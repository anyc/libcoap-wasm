FROM docker.io/emscripten/emsdk:3.1.74

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates cmake git make \
    && rm -rf /var/lib/apt/lists/*

COPY docker/build.sh /usr/local/bin/build-libcoap-wasm

WORKDIR /workspace
ENTRYPOINT ["/usr/local/bin/build-libcoap-wasm"]
