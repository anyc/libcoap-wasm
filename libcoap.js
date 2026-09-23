import {libcoapWasmFactory} from './libcoap-wasm.js';
import {installCoapWebSocketAdapter} from './coap-websocket-adapter.js';

export var libcoapWasm = await libcoapWasmFactory({websocket: {}});
installCoapWebSocketAdapter(libcoapWasm);
let nextToken = 1;

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
	}
	
	newClientSession(uri, proto) {
		var session = new CoapClientSession(this, uri, proto)
		
		this.sessions.push(session)
		this.coap_io_process()
		
		return session
	}
	
	coap_io_process() {
		libcoapWasm._coap_io_process(this.coap_ctx, 0);
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
		
		function fct_gen(_this) { return function (fd) { _this.ctx.coap_io_process(); }}
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
	
	get(path, payload, code) {
		if (!this.connected)
			throw new Error('CoAP session is not connected')
		
		var pdu = new CoapPduRequest(this, path, code)
		
		if (payload)
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
	
	put(path, payload) {
		return this.get(path, payload, libcoapWasm.coap_pdu_code_t.COAP_REQUEST_CODE_PUT)
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
			libcoapWasm._coap_session_max_pdu_size(session.coap_session));
		
		this.token = nextToken++ >>> 0
		if (nextToken > 0xffffffff) nextToken = 1
		if (!libcoapWasm.setRequestToken(this.coap_pdu, this.token, observe))
			throw new Error('Could not set CoAP request token or Observe option')
		libcoapWasm.setPduPath(this.coap_pdu, path)
	}
	
	addPayload(data) {
		libcoapWasm.addPayload(this.session.coap_session, this.coap_pdu, data)
	}
	
	send(session) {
		session = (typeof session === 'undefined') ? this.session : session;
		
		var mid = libcoapWasm._coap_send(session.coap_session, this.coap_pdu)
	}
}

export class CoapPduResponse extends CoapPdu {
	constructor(session, coap_pdu) {
		super()
		this.session = session
		this.coap_pdu = coap_pdu
	}
	
	getPayload() {
		var payload = libcoapWasm.get_payload(this.coap_pdu)
		
		return new TextDecoder().decode(payload.data)
	}

	getToken() {
		return libcoapWasm.getPduToken(this.coap_pdu)
	}
}
