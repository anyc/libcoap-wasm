// RFC 8323 length framing is used by libcoap's TCP socket. RFC 8327 carries
// the same message in one WebSocket frame, with a zero length nibble instead.
const MAX_PDU_SIZE = 8 * 1024 * 1024 + 256;

function bytes(data) {
	return data instanceof Uint8Array ? data : new Uint8Array(data);
}

function append(a, b) {
	const result = new Uint8Array(a.length + b.length);
	result.set(a);
	result.set(b, a.length);
	return result;
}

function lengthHeader(length, tkl) {
	if (length < 13)
		return Uint8Array.of(length << 4 | tkl);
	if (length < 269)
		return Uint8Array.of(13 << 4 | tkl, length - 13);
	if (length < 65805) {
		length -= 269;
		return Uint8Array.of(14 << 4 | tkl, length >>> 8, length & 255);
	}
	length -= 65805;
	return Uint8Array.of(15 << 4 | tkl, length >>> 24, length >>> 16 & 255,
		length >>> 8 & 255, length & 255);
}

function tokenSize(data, offset, tkl) {
	if (tkl < 13)
		return tkl;
	if (tkl === 15)
		throw new Error('Invalid CoAP token length');
	const extra = tkl === 13 ? 1 : 2;
	if (data.length < offset + extra)
		return null;
	return extra + (tkl === 13 ? data[offset] + 13 :
		(data[offset] << 8 | data[offset + 1]) + 269);
}

// Return one complete TCP message and its length, or null when a write ended
// in the middle of a header or message.
export function tcpMessage(data) {
	if (!data.length)
		return null;
	const kind = data[0] >>> 4;
	const headerSize = kind < 13 ? 2 : kind === 13 ? 3 : kind === 14 ? 4 : 6;
	if (data.length < headerSize)
		return null;
	let length = kind;
	if (kind === 13)
		length = data[1] + 13;
	else if (kind === 14)
		length = (data[1] << 8 | data[2]) + 269;
	else if (kind === 15)
		length = data[1] * 0x1000000 + (data[2] << 16 | data[3] << 8 | data[4]) + 65805;
	const tokenLength = tokenSize(data, headerSize, data[0] & 15);
	if (tokenLength === null)
		return null;
	const size = headerSize + tokenLength + length;
	if (size > MAX_PDU_SIZE)
		throw new Error('CoAP PDU exceeds libcoap receive limit');
	return data.length >= size ? {size, headerSize} : null;
}

export function tcpToWebSocket(data, headerSize) {
	const frame = new Uint8Array(data.length - headerSize + 2);
	frame[0] = data[0] & 15;
	frame.set(data.subarray(headerSize - 1), 1);
	return frame;
}

export function webSocketToTcp(data) {
	data = bytes(data);
	if (data.length < 2 || data[0] >>> 4 !== 0)
		throw new Error('Invalid CoAP-over-WebSocket header');
	const tokenLength = tokenSize(data, 2, data[0] & 15);
	if (tokenLength === null || data.length < 2 + tokenLength)
		throw new Error('Truncated CoAP-over-WebSocket token');
	const header = lengthHeader(data.length - 2 - tokenLength, data[0] & 15);
	const result = new Uint8Array(header.length + data.length - 1);
	result.set(header);
	result.set(data.subarray(1), header.length);
	if (result.length > MAX_PDU_SIZE)
		throw new Error('CoAP PDU exceeds libcoap receive limit');
	return result;
}

export function installCoapWebSocketAdapter(module) {
	const ops = module.SOCKFS.websocket_sock_ops;
	const originalCreatePeer = ops.createPeer;
	const originalSend = ops.sendmsg;
	const originalReceive = ops.recvmsg;
	const pending = new WeakMap();
	const converted = new WeakSet();

	ops.createPeer = function(sock, addr, port) {
		const peer = originalCreatePeer.call(this, sock, addr, port);
		if (sock.type === 1 && module.websocket.subprotocol === 'coap')
			sock.coapWebSocketAdapter = true;
		return peer;
	};

	ops.sendmsg = function(sock, buffer, offset, length, addr, port) {
		if (!sock.coapWebSocketAdapter)
			return originalSend.call(this, sock, buffer, offset, length, addr, port);
		const chunk = bytes(buffer).subarray(offset, offset + length);
		let stream = append(pending.get(sock) || new Uint8Array(), chunk);
		for (let message; (message = tcpMessage(stream)); ) {
			const frame = tcpToWebSocket(stream.subarray(0, message.size), message.headerSize);
			originalSend.call(this, sock, frame, 0, frame.length, addr, port);
			stream = stream.subarray(message.size);
		}
		if (stream.length > MAX_PDU_SIZE)
			throw new Error('CoAP TCP stream exceeds libcoap receive limit');
		pending.set(sock, stream.length ? stream : new Uint8Array());
		return length;
	};

	ops.recvmsg = function(sock, length) {
		if (sock.coapWebSocketAdapter) {
			for (const packet of sock.recv_queue) {
				if (!converted.has(packet)) {
					packet.data = webSocketToTcp(packet.data);
					converted.add(packet);
				}
			}
		}
		return originalReceive.call(this, sock, length);
	};
}
