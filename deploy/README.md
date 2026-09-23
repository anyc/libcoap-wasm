# Deploy libcoap-wasm

Extract `libcoap-wasm-<version>.tgz` into your web server's document root.
The `libcoap-wasm/` directory contains all runtime files. Import
`libcoap-wasm/libcoap.js` from your page, and copy that entire directory when
deploying it elsewhere. The wrapper finds the generated JavaScript and Wasm
files beside itself in this layout, or in `../dist/` in the source repository.

`examples/` contains an optional CoAP Explorer page and an nginx configuration.
To serve it, extract the archive under `/var/www`, point `/var/www/libcoap-wasm`
at the extracted version directory, and adapt `examples/nginx.conf.example`
for your host name and TLS setup. The example is then available at `/examples/`.

The example needs a CoAP-over-WebSocket server that accepts the `coap`
WebSocket subprotocol. By default, it connects to `/.well-known/coap` on the
page's host.
The nginx example proxies that endpoint to a CoAP server listening on
`127.0.0.1:5684`. Start libcoap's example server with
`coap-server -A 127.0.0.1 -w 5684`, or change the proxy target to your server.
You can also enter a different `ws://` or `wss://` endpoint in the page.
