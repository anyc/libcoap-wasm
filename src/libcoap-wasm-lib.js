addToLibrary({
	coap_js_ctx_response_callback: function(ctx_handle, coap_session, sent, received, mid) {
		var js_session = null;
		var js_ctx = Emval.toValue(ctx_handle);
		for (const session_it of js_ctx.sessions) {
			if (session_it.coap_session == coap_session) {
				js_session = session_it;
				break;
			}
		}
		
		if (js_session && typeof js_ctx.response_callback === "function") {
			return js_ctx.response_callback(js_ctx, js_session, sent, js_session.newResponsePdu(received), mid);
		} else {
			console.log("received response", libcoapWasm._coap_pdu_get_code(pdu))
			
			var COAP_RESPONSE_OK = 1
			return COAP_RESPONSE_OK
		}
	},
	
	coap_js_ctx_event_callback: function(ctx_handle, coap_session, coap_event) {
		var js_session = null;
		var js_ctx = Emval.toValue(ctx_handle);
		for (const session_it of js_ctx.sessions) {
			if (session_it.coap_session == coap_session) {
				js_session = session_it;
				break;
			}
		}
		
		if (js_session && typeof js_ctx.event_callback === "function") {
			return js_ctx.event_callback(js_ctx, js_session, coap_event);
		} else {
			console.log("received event", coap_event)
		}
	},
});
