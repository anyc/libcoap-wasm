#!/usr/bin/env bash
set -euo pipefail

project_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
host_network=false
no_coap_server=false

while (($#)); do
    case "$1" in
        --host-network)
            host_network=true
            ;;
        --no-coap-server)
            no_coap_server=true
            ;;
        --help)
            echo "Usage: $0 [--host-network] [--no-coap-server]"
            echo '  --host-network    Share the host network.'
            echo '  --no-coap-server  Do not start the bundled CoAP server.'
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            exit 2
            ;;
    esac
    shift
done

if [[ $host_network == true && ${PORT:-8080} != 8080 ]]; then
    echo 'PORT must be 8080 with --host-network.' >&2
    exit 2
fi

if [[ -n ${CONTAINER_RUNTIME:-} ]]; then
    runtime=$CONTAINER_RUNTIME
elif command -v podman >/dev/null 2>&1; then
    runtime=podman
elif command -v docker >/dev/null 2>&1; then
    runtime=docker
else
    echo 'Install podman or docker, or set CONTAINER_RUNTIME.' >&2
    exit 1
fi

required_files=(
    web/coap-explorer.html
    src/libcoap.js
    src/coap-link-format.js
    src/coap-websocket-adapter.js
    dist/libcoap-wasm.js
    dist/libcoap-wasm.wasm
)
for file in "${required_files[@]}"; do
    if [[ ! -f "$project_dir/$file" ]]; then
        echo "Missing $project_dir/$file" >&2
        exit 1
    fi
done

image=localhost/libcoap-wasm-explorer
"$runtime" build -t "$image" -f "$project_dir/docker/explorer/Dockerfile" \
    --build-arg "LIBCOAP_REF=${LIBCOAP_REF:-develop}" "$project_dir"

run_args=(
    --rm
    --volume "$project_dir:/srv/project:ro"
)
if [[ $host_network == true ]]; then
    run_args+=(--network host)
else
    run_args+=(--publish "${PORT:-8080}:8080")
fi
if [[ $no_coap_server == true ]]; then
    run_args+=(--env NO_COAP_SERVER=1)
fi

echo "Open http://localhost:${PORT:-8080}/"
"$runtime" run "${run_args[@]}" "$image"
