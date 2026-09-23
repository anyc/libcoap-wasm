import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import net from 'node:net';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {parseLinkFormat} from './coap-link-format.js';

// The current Emscripten output is an ES module but uses these CommonJS
// globals in its Node socket implementation.
globalThis.require = createRequire(import.meta.url);
globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url));

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

test('Wasm client exchanges multiple CoAP requests over WebSocket', {timeout: 30000}, async () => {
  await waitForServer();
  const {CoapContext, coapGetLibCoapVersion} = await import('./libcoap.js');
  assert.ok(coapGetLibCoapVersion());

  const ctx = new CoapContext();
  const pending = new Map();
  ctx.response_callback = (_ctx, _session, _sent, response) => {
    const token = response.getToken();
    const waiting = pending.get(token);
    if (waiting) {
      pending.delete(token);
      clearTimeout(waiting.timer);
      waiting.resolve({code: response.getCode(), payload: response.getPayload()});
    }
    return 1;
  };
  const session = ctx.newClientSession(serverUrl);
  await session.waitConnected();

  function request(method, path, payload) {
    const pdu = method === 'PUT' ? session.put(path, payload) : session.get(path);
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
  } finally {
    for (const {timer} of pending.values()) clearTimeout(timer);
    pending.clear();
  }
});
