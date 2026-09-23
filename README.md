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

Build
-----

To build with Podman or Docker, run `./build-container.sh`. The script builds
an image with Emscripten, then starts a container that fetches libcoap's
`develop` branch and builds the wrapper. If there is a `libcoap/` directory
in this directory, it uses that copy instead of fetching one. The generated
JavaScript and WebAssembly files are written under `dist/` on the host. Set
`CONTAINER_RUNTIME=docker` to choose Docker explicitly, or `LIBCOAP_REF` to
fetch a different branch or tag.

Layout
------

`src/` contains the JavaScript client, socket adapter, parser, and Emscripten
bindings. `web/` contains the CoAP Explorer page. `tests/` contains the Node
and browser tests. `docker/` contains the three container definitions and their
support files. Generated JavaScript and WebAssembly files live in `dist/`.
The build, Explorer, and test scripts remain at the project root.

Status
------
This project is a proof-of-concept for now but it can already be used to send
and receive CoAP messages in the Firefox browser and possibly others.

License
-------

libcoap-wasm is provided under the MIT license. For libcoap, please see the
[libcoap license](https://github.com/obgm/libcoap/blob/develop/LICENSE).

CoAP Explorer
-------------

Run `./run-coap-explorer.sh`, then open `http://localhost:8080/`. The script
creates a container that sets up libcoap-wasm with nginx and starts the example
CoAP server from libcoap.

CoAP Explorer connects to the page's host at `/.well-known/coap` by default.
Enter another `ws://` or `wss://` endpoint and press Connect to reload with a
fresh session. The web browser contacts that endpoint directly, so it must be
reachable from the web browser and accept the `coap` WebSocket subprotocol.

Set `PORT=18080` to publish another host port. The script uses Podman when
available, or Docker; set `CONTAINER_RUNTIME=docker` to choose Docker
explicitly.

On Linux, `--host-network` shares the host network; `--no-coap-server` skips
the bundled `coap-server`. Use both options to proxy through nginx to a CoAP
WebSocket server already running on the host at `127.0.0.1:5684`. Without
`--host-network`, using `--no-coap-server` leaves the default same-host proxy
without an upstream; enter a directly reachable WebSocket URL in CoAP Explorer.
With host networking, nginx listens on port 8080.

The explorer image builds a native libcoap `coap-server` from the `develop`
branch and installs nginx during the image build. Nginx serves the current
`web/coap-explorer.html`, JavaScript files from `src/`, and generated files
from `dist/`. It proxies `/.well-known/coap` to the server's loopback-only
WebSocket listener. The page
shows discovered resources as a tree, observes observable resources, gets
values for the others, and provides Get and Send (PUT) controls for each local
resource. Resource attributes can be expanded beneath each resource.

Tests
-----

Run `./run-tests.sh` to build the current Wasm client and run the JavaScript
unit tests plus a Node.js integration test in a container. The integration
test starts libcoap's WebSocket server, discovers resources, and checks GET,
PUT, and several concurrent GET requests through the Wasm client. The build
updates `dist/libcoap-wasm.js` and `dist/libcoap-wasm.wasm`. Set
`SKIP_WASM_BUILD=1` to test the existing generated files without rebuilding.
As with the other scripts, set `CONTAINER_RUNTIME=docker` to use Docker or
`LIBCOAP_REF` to choose a libcoap branch or tag; `develop` is the default.

Run `./run-tests.sh --browser` to add a headless Chromium test of the CoAP
Explorer page. This option installs Playwright, Chromium, and nginx in a
separate test image; the default test image does not include them. The browser
test checks resource discovery and a PUT followed by a GET through the page.

GitHub Actions runs the container tests on every push and pull request. To run
the optional browser test in CI, open the **Tests** workflow in GitHub Actions,
choose **Run workflow**, and enable **Run the headless browser test**. That
run reuses the Wasm files built by the first step.

Releases
--------

Push a Git tag to run the release workflow. It builds and tests the tagged
sources, then attaches `libcoap-wasm-<version>.tgz` to the GitHub
Release. The archive contains a portable `libcoap-wasm/` runtime directory,
deployment instructions, and CoAP Explorer with an nginx sample under
`examples/`. For a `v1.0.0` tag, run
`./scripts/package-release.sh v1.0.0` to build
`artifacts/libcoap-wasm-1.0.0.tgz` locally.
