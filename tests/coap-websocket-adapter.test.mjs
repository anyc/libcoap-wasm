import assert from 'node:assert/strict';
import test from 'node:test';
import {
	installCoapWebSocketAdapter, tcpMessage, tcpToWebSocket, webSocketToTcp,
} from '../src/coap-websocket-adapter.js';

function makeModule() {
	const sent = [];
	const ops = {
		createPeer() { return {}; },
		sendmsg(_sock, data, offset, length) {
			sent.push(data.slice(offset, offset + length));
			return length;
		},
		recvmsg(sock, length) {
			const packet = sock.recv_queue.shift();
			if (!packet) return null;
			const result = packet.data.subarray(0, length);
			if (result.length < packet.data.length) {
				packet.data = packet.data.subarray(result.length);
				sock.recv_queue.unshift(packet);
			}
			return {buffer: result};
		},
	};
	const module = {SOCKFS: {websocket_sock_ops: ops}, websocket: {subprotocol: 'coap'}};
	installCoapWebSocketAdapter(module);
	const sock = {type: 1, recv_queue: []};
	ops.createPeer(sock);
	return {ops, sock, sent};
}

test('encodes each PDU in a TCP stream as its own WebSocket message', () => {
	const {ops, sock, sent} = makeModule();
	const first = Uint8Array.of(0x10, 0x01, 0xaa); // one token byte, no options
	const second = Uint8Array.of(0x20, 0x02, 0xbb, 0x11);
	const both = new Uint8Array([...first, ...second]);
	assert.equal(ops.sendmsg(sock, both, 0, 2), 2);
	assert.equal(sent.length, 0);
	assert.equal(ops.sendmsg(sock, both, 2, both.length - 2), both.length - 2);
	assert.deepEqual(sent.map(frame => Array.from(frame)), [[0, 1, 0xaa], [0, 2, 0xbb, 0x11]]);
});

test('round trips extended lengths and extended tokens', () => {
	for (const optionLength of [0, 12, 13, 268, 269, 65805]) {
		const ws = new Uint8Array(2 + 1 + 13 + optionLength);
		ws[0] = 13;
		ws[1] = 0x45;
		ws[2] = 0; // 13 token bytes
		ws.fill(0xaa, 3, 16);
		const tcp = webSocketToTcp(ws);
		const message = tcpMessage(tcp);
		assert.equal(message.size, tcp.length);
		assert.deepEqual(tcpToWebSocket(tcp, message.headerSize), ws);
	}
	const ws = new Uint8Array(2 + 2 + 269);
	ws[0] = 14;
	ws[1] = 0x45;
	assert.deepEqual(tcpToWebSocket(webSocketToTcp(ws), tcpMessage(webSocketToTcp(ws)).headerSize), ws);
});

test('incoming frames are length framed once even when reads split a frame', () => {
	const {ops, sock} = makeModule();
	const first = Uint8Array.of(0, 0x45, 0xff, 0x41);
	const second = Uint8Array.of(0, 0x45, 0xff, 0x42);
	const expected = [webSocketToTcp(first), webSocketToTcp(second)];
	// SOCKFS preserves WebSocket message boundaries in recv_queue.
	sock.recv_queue.push({data: first}, {data: second});
	const received = [];
	for (let i = 0; i < 8; i++) {
		const message = ops.recvmsg(sock, 1);
		if (message) received.push(...message.buffer);
	}
	assert.deepEqual(received, [...expected[0], ...expected[1]]);
});

test('leaves sockets without the coap WebSocket subprotocol alone', () => {
	const {ops, sent} = makeModule();
	const sock = {type: 1, recv_queue: [{data: Uint8Array.of(1, 2, 3)}]};
	const data = Uint8Array.of(4, 5, 6);
	ops.sendmsg(sock, data, 0, data.length);
	assert.deepEqual(sent, [data]);
	assert.deepEqual(ops.recvmsg(sock, 3).buffer, Uint8Array.of(1, 2, 3));
});

test('rejects malformed WebSocket PDUs', () => {
	assert.throws(() => webSocketToTcp(Uint8Array.of(0x10, 1)), /header/);
	assert.throws(() => webSocketToTcp(Uint8Array.of(0x0f, 1)), /token/);
	assert.throws(() => webSocketToTcp(Uint8Array.of(0x01, 1)), /Truncated/);
});
