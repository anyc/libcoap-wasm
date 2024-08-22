
-include Makefile.local

LIB_NAME?=libcoap-wasm.js

all: $(LIB_NAME)
.PHONY: $(LIB_NAME)

EMCC?=emcc
EMCC_PREFIX?=
LIBCOAP_SRC_DIR?=libcoap
LIBCOAP_BUILD_DIR?=libcoap_build

LIBCOAP_INCLUDE_DIR?=$(LIBCOAP_BUILD_DIR)/image/usr/share/emscripten/cache/sysroot/include

SOURCES=libcoap-wasm-lib.cpp $(LIBCOAP_BUILD_DIR)/libcoap-3.a
INCLUDES=-I$(LIBCOAP_INCLUDE_DIR)

EMCC_FLAGS+=$(INCLUDES) --bind -s 'EXTRA_EXPORTED_RUNTIME_METHODS=["cwrap"]' \
	-s LINKABLE=1 -s EXPORT_ALL=1 -s ERROR_ON_UNDEFINED_SYMBOLS=0 -s LEGACY_RUNTIME=1 \
	-sASYNCIFY=1 -O3 -s ALLOW_TABLE_GROWTH \
	--js-library libcoap-wasm-lib.js \
	-sMODULARIZE -s 'EXPORT_NAME="libcoapWasmFactory"'

ifneq ($(DEBUG),)
EMCC_FLAGS+=-s SOCKET_DEBUG=1 -s WEBSOCKET_DEBUG=1
endif

$(LIBCOAP_BUILD_DIR)/libcoap-3.a:
	# apply libcoap-tcp.patch once
	
	# we disable most things to keep the file size small
	emcmake cmake -B $(LIBCOAP_BUILD_DIR) -S $(LIBCOAP_SRC_DIR) \
		-DENABLE_DTLS=OFF -DWITH_EPOLL=OFF -DHAVE_GETRANDOM=OFF \
		-DENABLE_DOCS=OFF -DENABLE_EXAMPLES=OFF -DENABLE_WS=OFF \
		-DENABLE_OSCORE=OFF -DENABLE_AF_UNIX=OFF -DENABLE_IPV4=OFF -DENABLE_IPV6=OFF \
		-DENABLE_SERVER_MODE=OFF \
		-DCMAKE_BUILD_TYPE=release
	emmake make -C $(LIBCOAP_BUILD_DIR) -j8
	emmake make -C $(LIBCOAP_BUILD_DIR) install DESTDIR=image
	
$(LIB_NAME): $(SOURCES)
	$(EMCC_PREFIX) $(EMCC) $(EMCC_FLAGS) $^ -o $@
	sed -i "s,^var libcoapWasmFactory,export var libcoapWasmFactory," $@
