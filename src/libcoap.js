import {installCoapWebSocketAdapter} from './coap-websocket-adapter.js';

let wasmDirectory = new URL('./', import.meta.url);
let wasmModule;
try {
	wasmModule = await import(new URL('libcoap-wasm.js', wasmDirectory));
} catch {
	wasmDirectory = new URL('../dist/', import.meta.url);
	wasmModule = await import(new URL('libcoap-wasm.js', wasmDirectory));
}
const {libcoapWasmFactory} = wasmModule;

export var libcoapWasm = await libcoapWasmFactory({
	websocket: {},
	locateFile: path => new URL(path, wasmDirectory).href,
});
installCoapWebSocketAdapter(libcoapWasm);
let nextToken = 1;
// Limit request PDUs so libcoap uses Block1 before a small peer's receive limit.
const MAX_REQUEST_PDU_SIZE = 1152;
const FILE_BLOCK_SIZE = 1024;
const FILE_CACHE_BLOCKS = 4;

class FileChunkSource {
	constructor(file, onClose) {
		this.file = file
		this.size = file.size
		this.onClose = onClose
		this.cache = new Map()
		this.position = 0
		this.nextOffset = 0
		this.fillPromise = null
		this.closed = false
	}

	fill() {
		if (this.closed || this.fillPromise) return
		this.fillPromise = (async () => {
			while (!this.closed && this.nextOffset < this.size &&
				this.nextOffset < this.position + FILE_CACHE_BLOCKS * FILE_BLOCK_SIZE) {
				const offset = this.nextOffset
				const bytes = new Uint8Array(await this.file.slice(
					offset, offset + FILE_BLOCK_SIZE).arrayBuffer())
				if (!this.closed) {
					this.cache.set(offset, bytes)
					this.nextOffset += bytes.length
					if (bytes.length === 0) throw new Error('File read ended early')
				}
			}
		})().finally(() => { this.fillPromise = null })
	}

	async ready() {
		this.fill()
		if (this.fillPromise) await this.fillPromise
	}

	read(offset, length) {
		const base = Math.floor(offset / FILE_BLOCK_SIZE) * FILE_BLOCK_SIZE
		const block = this.cache.get(base)
		if (!block || offset + length > base + block.length) return null
		this.position = Math.max(this.position, offset + length)
		for (const cachedOffset of this.cache.keys()) {
			if (cachedOffset + 2 * FILE_BLOCK_SIZE < this.position)
				this.cache.delete(cachedOffset)
		}
		return block.subarray(offset - base, offset - base + length)
	}

	close() {
		if (this.closed) return
		this.closed = true
		this.cache.clear()
		this.onClose(this)
	}
}

export function coapGetLibCoapVersion() {
	return libcoapWasm.UTF8ToString(libcoapWasm._coap_package_version());
}

export function coapSetLogLevel(level) {
	level = (typeof level === 'undefined') ? 7 : level;
	
	libcoapWasm._coap_set_log_level(level);
}

export class CoapContext {
	constructor() {
		// TODO do we want multiple context?
		libcoapWasm.context = this
		
		if (typeof coapInitialized != "number") {
			libcoapWasm._coap_startup()
			var coapInitialized = 1
		}
		
		this.coap_ctx = libcoapWasm.newContext(this);
		
		this.sessions = []
		this.lastIo = Promise.resolve()
		this.fileSources = new Set()
	}
	
	newClientSession(uri, proto) {
		var session = new CoapClientSession(this, uri, proto)
		
		this.sessions.push(session)
		this.coap_io_process()
		
		return session
	}
	
	coap_io_process() {
		return this.queueIo(async () => {
			await Promise.all([...this.fileSources].map(source => source.ready()))
			return libcoapWasm._coap_io_process(this.coap_ctx, 0)
		});
	}

	queueIo(operation) {
		const result = this.lastIo.then(operation);
		this.lastIo = result.catch(() => {});
		return result;
	}
}

export class CoapClientSession {
	constructor(ctx, uri) {
		this.ctx = ctx
		
		const js_url = new URL(uri)
		if (js_url.protocol !== 'ws:' && js_url.protocol !== 'wss:')
			throw new Error('CoAP WebSocket URL must use ws: or wss:')
		if (js_url.pathname === '/')
			js_url.pathname = '/.well-known/coap'
		
		var port = js_url.port
		
		// ($%/"§=W)% default ports are removed...
		if (js_url.port == "") {
			if (js_url.protocol == "ws:")
				port = "80"
			else
				port = "443"
		}
		
		/*
		 * We have to tell emscripten which websocket server we want to connect to,
		 * and later also libcoap but with protocol "coap+tcp" as websocket protocol
		 * is handled be the browser.
		 */
		
		// TODO viable with multiple connections?
		libcoapWasm["websocket"]["url"] = js_url.href
		libcoapWasm["websocket"]["subprotocol"] = "coap"
		
		function fct_gen(_this) { return function (fd) {
			_this.ctx.coap_io_process().catch(error => console.error('CoAP I/O failed:', error));
		}}
		libcoapWasm['websocket']['on']('open', fct_gen(this));
		libcoapWasm['websocket']['on']('message', fct_gen(this));
		
		this.coap_uri = libcoapWasm.allocUri();
		
		var coap_uri_s = "coap+tcp://"+js_url.hostname+":"+port
		
		var uri_p = libcoapWasm.stringToNewUTF8(coap_uri_s);
		var i = libcoapWasm._coap_split_uri(uri_p, coap_uri_s.length, this.coap_uri.$$.ptr);
		
		this.coap_addr_info = libcoapWasm.resolveUri(this.coap_uri)
		
		this.connected = false;
		
		var COAP_PROTO_TCP = 3
		var COAP_PROTO_WS = 5
		this.coap_session = libcoapWasm._coap_new_client_session(this.ctx.coap_ctx, 0, this.coap_addr_info.addr.$$.ptr, COAP_PROTO_TCP)
		if (!this.coap_session)
			throw new Error('Could not create CoAP client session')
	}
	
	async waitConnected() {
		if (this.connected)
			return;
		const deadline = Date.now() + 10000;
		while (!this.connected) {
			if (Date.now() >= deadline)
				throw new Error('Timed out connecting to the CoAP server');
			await new Promise(r => setTimeout(r, 100));
		}
	}
	
	get(path, payload, code, contentFormat) {
		if (!this.connected)
			throw new Error('CoAP session is not connected')
		
		var pdu = new CoapPduRequest(this, path, code)
		if (contentFormat !== undefined)
			pdu.setContentFormat(contentFormat)
		if (payload !== undefined)
			pdu.addPayload(payload)
		pdu.send()
		
		return pdu
	}

	observe(path) {
		if (!this.connected)
			throw new Error('CoAP session is not connected')
		const pdu = new CoapPduRequest(this, path, undefined, true)
		pdu.send()
		return pdu
	}
	
	post(path, payload) {
		return this.get(path, payload, libcoapWasm.coap_pdu_code_t.COAP_REQUEST_CODE_POST)
	}
	
	put(path, payload, contentFormat) {
		return this.get(path, payload,
			libcoapWasm.coap_pdu_code_t.COAP_REQUEST_CODE_PUT, contentFormat)
	}

	async putFile(path, file, contentFormat = 42) {
		if (!this.connected)
			throw new Error('CoAP session is not connected')
		if (!(file instanceof Blob))
			throw new TypeError('CoAP file payload must be a Blob or File')
		// libcoap's blockwise transfer offsets and the Wasm heap are 32-bit.
		if (file.size > 0xffffffff)
			throw new RangeError('CoAP file payload is too large')
		if (file.size === 0)
			return this.put(path, new Uint8Array(0), contentFormat)
		const source = new FileChunkSource(file, item => this.ctx.fileSources.delete(item))
		this.ctx.fileSources.add(source)
		try {
			await source.ready()
		} catch (error) {
			source.close()
			throw error
		}
		try {
			const pdu = new CoapPduRequest(this, path,
				libcoapWasm.coap_pdu_code_t.COAP_REQUEST_CODE_PUT)
			pdu.setContentFormat(contentFormat)
			return await this.ctx.queueIo(() => {
				pdu.addFilePayload(source)
				pdu.send()
				return pdu
			})
		} catch (error) {
			source.close()
			throw error
		}
	}
	
	newResponsePdu(coap_pdu) {
		return new CoapPduResponse(this, coap_pdu)
	}
}

export class CoapPdu {
	getCode() {
		return libcoapWasm._coap_pdu_get_code(this.coap_pdu)
	}
}

export class CoapPduRequest extends CoapPdu {
	constructor(session, path, code, observe = false) {
		super()
		this.session = session
		var COAP_MESSAGE_CON = 0
		
		code = (typeof code === 'undefined') ? libcoapWasm.coap_pdu_code_t.COAP_REQUEST_CODE_GET : code;
		
		this.coap_pdu = libcoapWasm._coap_pdu_init(COAP_MESSAGE_CON,
			code.value,
			libcoapWasm._coap_new_message_id(session.coap_session),
			Math.min(libcoapWasm._coap_session_max_pdu_size(session.coap_session),
				MAX_REQUEST_PDU_SIZE));
		
		this.token = nextToken++ >>> 0
		if (nextToken > 0xffffffff) nextToken = 1
		if (!libcoapWasm.setRequestToken(this.coap_pdu, this.token, observe))
			throw new Error('Could not set CoAP request token or Observe option')
		libcoapWasm.setPduPath(this.coap_pdu, path)
	}
	
	addPayload(data) {
		const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
		if (!(bytes instanceof Uint8Array))
			throw new TypeError('CoAP payload must be a string or Uint8Array')
		if (!libcoapWasm.addPayload(this.session.coap_session, this.coap_pdu, bytes))
			throw new Error('Could not add CoAP request payload')
	}

	addFilePayload(source) {
		if (!libcoapWasm.addFilePayload(
			this.session.coap_session, this.coap_pdu, source))
			throw new Error('Could not add CoAP file payload')
	}

	setContentFormat(format) {
		if (!libcoapWasm.setContentFormat(this.coap_pdu, format))
			throw new Error('Could not set CoAP Content-Format')
	}
	
	send(session) {
		session = (typeof session === 'undefined') ? this.session : session;
		
		return libcoapWasm._coap_send(session.coap_session, this.coap_pdu)
	}
}

export class CoapPduResponse extends CoapPdu {
	constructor(session, coap_pdu) {
		super()
		this.session = session
		this.coap_pdu = coap_pdu
	}
	
	getPayload() {
		return new TextDecoder().decode(this.getPayloadBytes())
	}

	getPayloadBytes() {
		return Uint8Array.from(libcoapWasm.get_payload(this.coap_pdu).data)
	}

	getToken() {
		return libcoapWasm.getPduToken(this.coap_pdu)
	}
}
