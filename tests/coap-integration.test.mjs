import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import net from 'node:net';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {parseLinkFormat} from '../src/coap-link-format.js';

// The current Emscripten output is an ES module but uses these CommonJS
// globals in its Node socket implementation.
globalThis.require = createRequire(import.meta.url);
globalThis.__dirname = fileURLToPath(new URL('../dist/', import.meta.url));

const port = 5684;
const serverUrl = `ws://127.0.0.1:${port}/.well-known/coap`;

async function waitForServer() {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const ready = await new Promise(resolve => {
      const socket = net.connect(port, '127.0.0.1');
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('error', () => resolve(false));
    });
    if (ready) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`CoAP WebSocket server did not start on port ${port}`);
}

test('Wasm client exchanges concurrent and blockwise CoAP requests', {timeout: 30000}, async () => {
  await waitForServer();
  const {CoapContext, coapGetLibCoapVersion} = await import('../src/libcoap.js');
  assert.ok(coapGetLibCoapVersion());

  const ctx = new CoapContext();
  const pending = new Map();
  ctx.response_callback = (_ctx, _session, _sent, response) => {
    const token = response.getToken();
    const waiting = pending.get(token);
    if (waiting) {
      pending.delete(token);
      clearTimeout(waiting.timer);
      waiting.resolve({code: response.getCode(), payload: response.getPayload(),
        bytes: response.getPayloadBytes()});
    }
    return 1;
  };
  const session = ctx.newClientSession(serverUrl);
  await session.waitConnected();

  function request(method, path, payload) {
    const pdu = method === 'PUT'
      ? session.put(path, payload, payload instanceof Uint8Array ? 42 : undefined)
      : session.get(path);
    return waitForPdu(pdu, method, path);
  }

  function waitForPdu(pdu, method, path) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(pdu.token);
        reject(new Error(`Timed out waiting for ${method} /${path}`));
      }, 10000);
      pending.set(pdu.token, {resolve, timer});
    });
  }

  function success(response) {
    assert.ok(response.code >= 64 && response.code < 96,
      `Expected a 2.xx response, got ${response.code}`);
  }

  try {
    const discovery = await request('GET', '.well-known/core');
    success(discovery);
    assert.ok(parseLinkFormat(discovery.payload).some(resource =>
      resource.href === '/example_data'));

    success(await request('GET', 'example_data'));
    const value = `node-wasm-test-${Date.now()}`;
    success(await request('PUT', 'example_data', value));

    const replies = await Promise.all(Array.from({length: 4}, () =>
      request('GET', 'example_data')));
    for (const reply of replies) {
      success(reply);
      assert.equal(reply.payload, value);
    }

    const fileBytes = Uint8Array.from({length: 32781}, (_, index) => index % 256);
    success(await request('PUT', 'example_data', fileBytes));
    const downloaded = await request('GET', 'example_data');
    success(downloaded);
    assert.deepEqual(downloaded.bytes, fileBytes);

    const reads = [];
    class TrackedBlob extends Blob {
      slice(start, end, type) {
        reads.push({start, end});
        return super.slice(start, end, type);
      }
    }
    const file = new TrackedBlob([fileBytes]);
    success(await waitForPdu(await session.putFile('example_data', file),
      'PUT file', 'example_data'));
    assert.ok(reads.length > 1, 'File upload should read multiple blocks');
    assert.ok(reads.every(({start, end}) => end - start <= 1024 &&
      start >= 0 && start < file.size), 'File reads should stay within one block');
    const uploaded = await request('GET', 'example_data');
    success(uploaded);
    assert.deepEqual(uploaded.bytes, fileBytes);
  } finally {
    for (const {timer} of pending.values()) clearTimeout(timer);
    pending.clear();
  }
});
