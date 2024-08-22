import {libcoapWasmFactory} from './libcoap-wasm.js';

export var libcoapWasm = await libcoapWasmFactory();

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
		libcoapWasm["websocket"]["url"] = js_url.protocol+"//"+js_url.hostname+":"+port+"/.well-known/coap"
		libcoapWasm["websocket"]["subprotocol"] = "coap"
		
		function fct_gen(_this) { return function (fd) { _this.ctx.coap_io_process(); }}
		libcoapWasm['websocket']['on']('message', fct_gen(this));
		
		this.coap_uri = libcoapWasm.allocUri();
		
		var coap_uri_s = "coap+tcp://"+js_url.hostname+":"+js_url.port
		
		var uri_p = libcoapWasm.stringToNewUTF8(coap_uri_s);
		var i = libcoapWasm._coap_split_uri(uri_p, coap_uri_s.length, this.coap_uri.$$.ptr);
		
		this.coap_addr_info = libcoapWasm.resolveUri(this.coap_uri)
		
		this.connected = false;
		
		var COAP_PROTO_TCP = 3
		var COAP_PROTO_WS = 5
		this.coap_session = libcoapWasm._coap_new_client_session(this.ctx.coap_ctx, 0, this.coap_addr_info.addr.$$.ptr, COAP_PROTO_TCP)
	}
	
	async waitConnected() {
		if (this.connected)
			return;
		while (1) {
			await new Promise(r => setTimeout(r, 100));
			if (this.connected)
				break;
		}
	}
	
	get(path, payload, code) {
		this.waitConnected()
		
		var pdu = new CoapPduRequest(path, code)
		pdu.session = this
		
		if (payload)
			pdu.addPayload(payload)
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
	constructor(path, code) {
		super()
		var COAP_MESSAGE_CON = 0
		
		code = (typeof code === 'undefined') ? libcoapWasm.coap_pdu_code_t.COAP_REQUEST_CODE_GET : code;
		
		this.coap_pdu = libcoapWasm._coap_pdu_init(COAP_MESSAGE_CON,
			code.value,
			libcoapWasm._coap_new_message_id(this.coap_session),
			libcoapWasm._coap_session_max_pdu_size(this.coap_session));
		
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
		
		return String.fromCharCode.apply(null, payload.data)
	}
}
