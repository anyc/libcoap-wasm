#include <emscripten.h>
#include <emscripten/bind.h>

#include <coap3/coap.h>
#include <sys/socket.h>

using namespace emscripten;

extern "C" {
	// in libcoap-wasm-lib.js
	extern coap_response_t coap_js_ctx_response_callback(void *ctx, void *session, void*sent, void *pdu, int id);
	extern coap_response_t coap_js_ctx_event_callback(void *ctx, void *session, const coap_event_t event);
}

std::string getCoapString(const coap_str_const_t& s) {
	std::string res((char*)s.s, s.length);
	return res;
}

coap_uri_t * allocUri() {
	return (coap_uri_t*) malloc(sizeof(coap_uri_t));
}

coap_addr_info_t * resolveUri(coap_uri_t *uri_t) {
	return coap_resolve_address_info(&uri_t->host, uri_t->port, uri_t->port, uri_t->port, uri_t->port,
							AF_UNSPEC, 1 << uri_t->scheme, COAP_RESOLVE_TYPE_REMOTE);
}

int setPduPath(ptrdiff_t mpdu, std::string path) {
	int rv;
	coap_optlist_t *optlist = 0;
	
	coap_pdu_t *pdu = (coap_pdu_t*) mpdu;
	
	coap_path_into_optlist((const uint8_t*) path.c_str(), path.length(), COAP_OPTION_URI_PATH, &optlist);
	rv = coap_add_optlist_pdu(pdu, &optlist);
	
	return 0;
}

int addPayload(ptrdiff_t coap_session, ptrdiff_t coap_pdu, std::string payload) {
	return coap_add_data_large_request(
		(coap_session_t*) coap_session,
		(coap_pdu_t*) coap_pdu,
		payload.length(),
		(uint8_t *) payload.c_str(),
		0, /* release callback */
		0  /* release callback userdata */
		);
}

EM_ASYNC_JS(void, coap_set_connected, (EM_VAL js_ctx_handle, ptrdiff_t coap_session), {
	var session = null;
	var js_ctx = Emval.toValue(js_ctx_handle);
	for (const ctx_session of js_ctx.sessions) {
		if (ctx_session.coap_session == coap_session) {
			session = ctx_session;
			break;
		}
	}
	
	session.connected = true;
});

int coap_event_handler(coap_session_t *session, const coap_event_t event) {
	coap_context_t *ctx;
	
	ctx = coap_session_get_context(session);
	EM_VAL js_ctx_handle = (EM_VAL) coap_context_get_app_data(ctx);
	
	if (event == COAP_EVENT_SESSION_CONNECTED) {
		EM_VAL js_ctx_handle = (EM_VAL) coap_context_get_app_data(ctx);
		coap_set_connected(js_ctx_handle, (ptrdiff_t) session);
	}
	
	coap_js_ctx_event_callback(js_ctx_handle, (void*)session, event);
	
	return 0;
}

coap_response_t coap_response_handler(coap_session_t *session,
									  const coap_pdu_t *sent,
									  const coap_pdu_t *received,
									  const coap_mid_t id)
{
	coap_context_t *ctx;
	
	ctx = coap_session_get_context(session);
	EM_VAL js_ctx_handle = (EM_VAL) coap_context_get_app_data(ctx);
	
	return coap_js_ctx_response_callback(js_ctx_handle, (void*)session, (void*)sent, (void*)received, id);
}

ptrdiff_t newContext(emscripten::val js_ctx) {
	coap_context_t *ctx;
	
	ctx = coap_new_context(0);
	
	coap_register_event_handler(ctx, coap_event_handler);
	coap_register_response_handler(ctx, coap_response_handler);
	
	// TODO free memory on context release
	emscripten::val *l_js_ctx = new emscripten::val(js_ctx);
	coap_context_set_app_data(ctx, l_js_ctx->as_handle());
	
	return (ptrdiff_t) ctx;
}

EMSCRIPTEN_BINDINGS(libcoap) {
	function(
		"get_payload",
		(emscripten::val (*)(emscripten::val)) []( emscripten::val mpdu) {
			size_t size;
			ptrdiff_t data;
			size_t offset;
			size_t total;
			int r;
			
			coap_pdu_t *pdu = (coap_pdu_t*) mpdu.as<ptrdiff_t>();
			r = coap_get_data_large(pdu, &size, (const uint8_t**) &data, &offset, &total);
			
			emscripten::val jpayload = emscripten::val::object();
			
			jpayload.set("size", size);
			jpayload.set("data_ptr", data);
			jpayload.set("offset", offset);
			jpayload.set("total", total);
			
			emscripten::val jarray = emscripten::val(emscripten::typed_memory_view(size, (char*)data));
			jpayload.set("data", jarray);
			
			return jpayload;
		}
	);
	
	
	class_<coap_address_t>("coap_address_t")
		.constructor<>()
		;
	
	class_<coap_optlist_t>("coap_optlist_t")
		.constructor<>()
		;
	
	class_<coap_addr_info_t>("coap_addr_info_t")
		.constructor<>()
		// .property("next", &coap_addr_info_t::next)
		// .property("scheme", &coap_addr_info_t::scheme)
		// .property("proto", &coap_addr_info_t::proto)
		.property("addr", &coap_addr_info_t::addr, return_value_policy::reference())
		;
	
	class_<coap_uri_t>("coap_uri_t")
		.constructor<>()
		.property("host", &coap_uri_t::host)
		.property("port", &coap_uri_t::port)
		.property("path", &coap_uri_t::path)
		.property("query", &coap_uri_t::query)
		.property("scheme", &coap_uri_t::scheme)
		;
	
	class_<coap_str_const_t>("coap_str_const_t")
		.property("length", &coap_str_const_t::length)
		.property("s", &getCoapString)
		;
	
	enum_<coap_event_t>("coap_event_t")
		.value("COAP_EVENT_SESSION_CONNECTED", COAP_EVENT_SESSION_CONNECTED)
		.value("COAP_EVENT_TCP_CONNECTED", COAP_EVENT_TCP_CONNECTED)
		;
	
	enum_<coap_pdu_code_t>("coap_pdu_code_t")
		.value("COAP_REQUEST_CODE_GET", COAP_REQUEST_CODE_GET)
		.value("COAP_REQUEST_CODE_POST", COAP_REQUEST_CODE_POST)
		.value("COAP_REQUEST_CODE_PUT", COAP_REQUEST_CODE_PUT)
		;
	
	function("coap_split_uri2", &coap_split_uri, allow_raw_pointers());
	function("allocUri", &allocUri, allow_raw_pointers());
	function("resolveUri", &resolveUri, allow_raw_pointers());
	function("setPduPath", &setPduPath, allow_raw_pointers());
	function("newContext", &newContext);
	function("addPayload", &addPayload);
}
