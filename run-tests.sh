#!/usr/bin/env bash
set -euo pipefail

project_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
browser_tests=false

while (($#)); do
    case "$1" in
        --browser)
            browser_tests=true
            ;;
        --help)
            echo "Usage: $0 [--browser]"
            echo '  --browser  Also run headless Chromium tests of the CoAP Explorer.'
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            exit 2
            ;;
    esac
    shift
done

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

if [[ ${SKIP_WASM_BUILD:-0} != 1 ]]; then
    CONTAINER_RUNTIME="$runtime" "$project_dir/build-container.sh"
fi

image=localhost/libcoap-wasm-test
target=core
run_args=(--rm --volume "$project_dir:/workspace:ro" --workdir /workspace)
if [[ $browser_tests == true ]]; then
    image=localhost/libcoap-wasm-test-browser
    target=browser
    run_args+=(--env RUN_BROWSER_TESTS=1 --shm-size=1g)
fi
"$runtime" build -t "$image" -f "$project_dir/docker/test/Dockerfile" \
    --target "$target" --build-arg "LIBCOAP_REF=${LIBCOAP_REF:-develop}" \
    "$project_dir"
"$runtime" run "${run_args[@]}" "$image"
