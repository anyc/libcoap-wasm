#!/usr/bin/env bash
set -euo pipefail

project_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)

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

image=localhost/libcoap-wasm-builder
"$runtime" build -t "$image" -f "$project_dir/Dockerfile" "$project_dir"
run_args=(
	--rm
	--user "$(id -u):$(id -g)"
	--volume "$project_dir:/workspace"
	--workdir /workspace
	-e LIBCOAP_REF="${LIBCOAP_REF:-develop}"
)
if [[ $(basename -- "$runtime") == podman ]]; then
	run_args+=(--userns keep-id)
fi
"$runtime" run "${run_args[@]}" "$image" "$@"
