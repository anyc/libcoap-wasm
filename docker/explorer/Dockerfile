FROM docker.io/library/debian:bookworm-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential ca-certificates cmake git \
    && rm -rf /var/lib/apt/lists/*

ARG LIBCOAP_REF=develop
RUN git clone --depth 1 --branch "$LIBCOAP_REF" https://github.com/obgm/libcoap.git /opt/libcoap \
    && cmake -S /opt/libcoap -B /tmp/libcoap-build \
       -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF \
       -DENABLE_DTLS=OFF -DENABLE_DOCS=OFF -DENABLE_EXAMPLES=ON \
       -DENABLE_WS=ON -DENABLE_PROXY_CODE=OFF \
    && cmake --build /tmp/libcoap-build --target coap-server --parallel

FROM docker.io/library/debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends nginx \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /srv/project

COPY --from=builder /tmp/libcoap-build/coap-server /usr/local/bin/coap-server
COPY docker/explorer/nginx.conf /etc/nginx/nginx.conf
COPY docker/explorer/start.sh /usr/local/bin/start-coap-explorer

EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/start-coap-explorer"]
