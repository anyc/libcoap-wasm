#!/usr/bin/env bash
set -euo pipefail

project_dir=/workspace
build_dir=/tmp/libcoap_build

if [[ -d "$project_dir/libcoap" ]]; then
	libcoap_dir="$project_dir/libcoap"
	echo "Building with $libcoap_dir"
else
	libcoap_dir=/tmp/libcoap
	libcoap_ref=${LIBCOAP_REF:-develop}
	echo "Fetching libcoap $libcoap_ref"
	git clone --depth 1 --branch "$libcoap_ref" https://github.com/obgm/libcoap.git "$libcoap_dir"
fi

export HOME=/tmp
export EM_CACHE=/tmp/emscripten-cache

make -C "$project_dir" -B \
	LIBCOAP_SRC_DIR="$libcoap_dir" \
	LIBCOAP_BUILD_DIR="$build_dir" \
	LIBCOAP_INCLUDE_DIR="$build_dir/image/usr/local/include" \
	"$@"
