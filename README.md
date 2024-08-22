libcoap-wasm
============

libcoap-wasm provides a JavaScript wrapper around [libcoap](https://libcoap.net/). As libcoap is a C library, it has to be compiled with [emscripten](https://emscripten.org/) into [WebAssembly](https://webassembly.org/).

The focus of this wrapper is to enable CoAP communication in a browser but it might also work with NodeJS. As we can only use WebSockets in browser scripts, we cannot use the regular UDP-based CoAP communication. While libcoap supports CoAP over WebSockets, we cannot use this builtin support either as the browser handles the WebSocket layer itself for security reasons. Hence, libcoap has to be configured to use CoAP over TCP which will be encapsulated into WebSocket packets by the browser. As the CoAP-TCP packets slightly differ from their WebSockets variant, we have to apply a small patch to libcoap for now before it can be used in the browser. On the remote end, one can use the regular libcoap to start a CoAP-over-WebSocket server.

Status
------
This project is a proof-of-concept for now but it can already be used to send and receive CoAP messages in the Firefox browser and possibly others.

License
-------

libcoap-wasm is provided under the MIT license. For libcoap, please see the [libcoap license](https://github.com/obgm/libcoap/blob/develop/LICENSE).

Example
-------
1. Start your CoAP+WS server, e.g., `coap-server -w 8080` if you have the libcoap utils installed.
2. Make the files of this repository available over HTTP(s), e.g., execute `python -m http.server` in the repository directory
3. Open the example.html which contains the following:
```
<script type="module">
	import * as coap from "./libcoap.js";
	
	console.log(coap.coapGetLibCoapVersion())
	
	var ctx = new coap.CoapContext()
	
	ctx.event_callback = function (ctx, session, event_type) {
		// TODO embind does not convert this enum
		if (event_type == coap.libcoapWasm.coap_event_t.COAP_EVENT_SESSION_CONNECTED.value)
			console.log("connected")
		else
			console.log("received event", event_type)
	}
	
	ctx.response_callback = function (ctx, session, sentPdu, receivedPdu, mid) {
		console.log("received response code", receivedPdu.getCode())
		
		console.log(receivedPdu.getPayload())
		document.write("<p>"+receivedPdu.getPayload()+"</p>")
	}
	
	var session = ctx.newClientSession("ws://localhost:8080")
	
	await session.waitConnected()
	
	session.get(".well-known/core")
	session.get("time")
	
	session.put("example_data", "example payload set from JS")
	session.get("example_data")
</script>

```