libcoap-wasm
============

libcoap-wasm provides a JavaScript wrapper around
[libcoap](https://libcoap.net/). As libcoap is a C library, it has to be
compiled with [emscripten](https://emscripten.org/) into
[WebAssembly](https://webassembly.org/).

The focus of this wrapper is to enable CoAP communication in a browser but it
might also work with NodeJS. As we can only use WebSockets in browser scripts,
we cannot use the regular UDP-based CoAP communication. While libcoap supports
CoAP over WebSockets, we cannot use this builtin support either as the browser
handles the WebSocket layer itself for security reasons. Libcoap therefore
uses its unmodified CoAP-over-TCP implementation. The JavaScript socket adapter
converts each TCP PDU to a CoAP-over-WebSocket PDU before sending it, and adds
TCP length framing to each incoming WebSocket PDU. On the remote end, one can
use the regular libcoap to start a CoAP-over-WebSocket server.

The checked-in `libcoap-wasm.js` and `libcoap-wasm.wasm` files are built from
unmodified libcoap's `develop` branch.

To build with Podman or Docker, run `./build-container.sh`. The script builds
an image with Emscripten, then starts a container that fetches libcoap's
`develop` branch and builds the wrapper. If this project's `libcoap/` directory
exists, it uses that copy instead of fetching one. The generated JavaScript
and WebAssembly files are written into this project directory on the host. Set
`CONTAINER_RUNTIME=docker` to choose Docker explicitly, or `LIBCOAP_REF` to
fetch a different branch or tag.

Status
------
This project is a proof-of-concept for now but it can already be used to send
and receive CoAP messages in the Firefox browser and possibly others.

License
-------

libcoap-wasm is provided under the MIT license. For libcoap, please see the
[libcoap license](https://github.com/obgm/libcoap/blob/develop/LICENSE).

Browser
-------

Run `./run-browser-server.sh`, then open `http://localhost:8080/`. Set
`PORT=18080` to publish another host port. The script uses Podman when
available, or Docker; set `CONTAINER_RUNTIME=docker` to choose Docker
explicitly.

The browser connects to the page's host at `/.well-known/coap` by default.
Enter another `ws://` or `wss://` endpoint and press Connect to reload with a
fresh session. The browser contacts that endpoint directly, so it must be
reachable from the browser and accept the `coap` WebSocket subprotocol.

On Linux, `--host-network` shares the host network; `--no-coap-server` skips
the bundled `coap-server`. Use both options to proxy through nginx to a CoAP
WebSocket server already running on the host at `127.0.0.1:5684`. Without
`--host-network`, using `--no-coap-server` leaves the default same-host proxy
without an upstream; enter a directly reachable WebSocket URL in the browser.
With host networking, nginx listens on port 8080.

The browser image builds a native libcoap `coap-server` from the `develop`
branch and installs nginx during the image build. At runtime the project
directory is mounted read-only. Nginx serves the current `browser.html`,
JavaScript, and WebAssembly files, and proxies `/.well-known/coap` to the
server's loopback-only WebSocket listener. The page shows discovered resources
as a tree, observes observable resources, gets values for the others, and
provides Get and Send (PUT) controls for each local resource. Resource
attributes can be expanded beneath each resource.
