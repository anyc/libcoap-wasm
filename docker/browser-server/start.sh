#!/usr/bin/env bash
set -euo pipefail

if [[ ${NO_COAP_SERVER:-0} == 1 ]]; then
    exec nginx -g 'daemon off;'
fi

coap-server -A 127.0.0.1 -w 5684 &
coap_pid=$!
nginx -g 'daemon off;' &
nginx_pid=$!

stop() {
    kill "$coap_pid" "$nginx_pid" 2>/dev/null || true
    wait "$coap_pid" "$nginx_pid" 2>/dev/null || true
}
trap stop EXIT INT TERM

wait -n "$coap_pid" "$nginx_pid"
