#!/usr/bin/env bash
set -euo pipefail

project_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
tag=${1:-}
output_dir=${2:-"$project_dir/artifacts"}

if [[ -z $tag ]]; then
    echo 'Usage: package-release.sh <tag> [output-directory]' >&2
    exit 2
fi

version=$tag
if [[ $version =~ ^v[0-9] ]]; then
    version=${version#v}
fi
version=${version//\//-}
if [[ ! $version =~ ^[A-Za-z0-9][A-Za-z0-9._+-]*$ ]]; then
    echo "Tag cannot be used as an archive version: $tag" >&2
    exit 2
fi

staging_dir=$(mktemp -d)
trap 'rm -rf -- "$staging_dir"' EXIT
release_dir="$staging_dir/libcoap-wasm-$version"
runtime_dir="$release_dir/libcoap-wasm"
example_dir="$release_dir/examples"
mkdir -p "$runtime_dir" "$example_dir" "$output_dir"

# The example sits beside the runtime directory in the archive.
sed -e 's#\.\./src/coap-link-format.js#./coap-link-format.js#g' \
    -e 's#\.\./src/libcoap.js#../libcoap-wasm/libcoap.js#g' \
    "$project_dir/web/coap-explorer.html" > "$example_dir/index.html"
cp "$project_dir/src/libcoap.js" \
    "$project_dir/src/coap-websocket-adapter.js" "$runtime_dir/"
cp "$project_dir/src/coap-link-format.js" "$example_dir/"
cp "$project_dir/dist/libcoap-wasm.js" \
    "$project_dir/dist/libcoap-wasm.wasm" "$runtime_dir/"
cp "$project_dir/deploy/README.md" "$release_dir/DEPLOY.md"
cp "$project_dir/deploy/nginx.conf.example" \
    "$example_dir/nginx.conf.example"
printf '%s\n' "$tag" > "$release_dir/VERSION"

archive="$output_dir/libcoap-wasm-$version.tgz"
tar -C "$staging_dir" -czf "$archive" "libcoap-wasm-$version"
echo "$archive"
