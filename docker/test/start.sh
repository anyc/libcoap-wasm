#!/usr/bin/env bash
set -euo pipefail

coap-server -A 127.0.0.1 -w 5684 &
server_pid=$!
nginx_pid=
if [[ ${RUN_BROWSER_TESTS:-0} == 1 ]]; then
    nginx -g 'daemon off;' &
    nginx_pid=$!
fi
stop() {
    kill "$server_pid" ${nginx_pid:+"$nginx_pid"} 2>/dev/null || true
    wait "$server_pid" ${nginx_pid:+"$nginx_pid"} 2>/dev/null || true
}
trap stop EXIT INT TERM

tests=(tests/coap-link-format.test.mjs tests/coap-websocket-adapter.test.mjs tests/coap-integration.test.mjs)
if [[ ${RUN_BROWSER_TESTS:-0} == 1 ]]; then
    tests+=(tests/coap-browser.test.mjs)
fi
node --test --test-force-exit "${tests[@]}"
