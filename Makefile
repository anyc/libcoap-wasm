
-include Makefile.local

LIB_NAME?=dist/libcoap-wasm.js

all: $(LIB_NAME)
.PHONY: $(LIB_NAME)

EMCC?=emcc
EMCC_PREFIX?=
LIBCOAP_SRC_DIR?=../libcoap
LIBCOAP_BUILD_DIR?=libcoap_build

LIBCOAP_INCLUDE_DIR?=$(LIBCOAP_BUILD_DIR)/image/usr/local/include

SOURCES=src/libcoap-wasm-lib.cpp $(LIBCOAP_BUILD_DIR)/libcoap-3.a
INCLUDES=-I$(LIBCOAP_INCLUDE_DIR)

EMCC_FLAGS+=$(INCLUDES) --bind -s 'EXPORTED_RUNTIME_METHODS=["cwrap"]' \
	-s 'EXPORTED_FUNCTIONS=["_coap_package_version","_coap_set_log_level","_coap_startup","_coap_io_process","_coap_split_uri","_coap_new_client_session","_coap_pdu_get_code","_coap_pdu_init","_coap_new_message_id","_coap_session_max_pdu_size","_coap_send"]' \
	-s LINKABLE=1 -s EXPORT_ALL=1 -s ERROR_ON_UNDEFINED_SYMBOLS=0 -s LEGACY_RUNTIME=1 \
	-sASYNCIFY=1 -O3 -s ALLOW_TABLE_GROWTH \
	--js-library src/libcoap-wasm-lib.js \
	-sMODULARIZE -s 'EXPORT_NAME="libcoapWasmFactory"'

ifneq ($(DEBUG),)
EMCC_FLAGS+=-s SOCKET_DEBUG=1 -s WEBSOCKET_DEBUG=1
endif

$(LIBCOAP_BUILD_DIR)/libcoap-3.a:
	# we disable most things to keep the file size small
	emcmake cmake -B $(LIBCOAP_BUILD_DIR) -S $(LIBCOAP_SRC_DIR) \
		-DENABLE_DTLS=OFF -DWITH_EPOLL=OFF -DHAVE_GETRANDOM=OFF -DHAVE_GETIFADDRS=OFF \
		-DENABLE_DOCS=OFF -DENABLE_EXAMPLES=OFF -DENABLE_WS=OFF \
		-DENABLE_OSCORE=OFF -DENABLE_AF_UNIX=OFF -DENABLE_IPV4=ON -DENABLE_IPV6=OFF \
		-DENABLE_SERVER_MODE=OFF -DENABLE_PROXY_CODE=OFF \
		-DCMAKE_INSTALL_PREFIX=/usr/local \
		-DCMAKE_BUILD_TYPE=release
	emmake make -C $(LIBCOAP_BUILD_DIR) -j8
	emmake make -C $(LIBCOAP_BUILD_DIR) install DESTDIR=image
	
$(LIB_NAME): $(SOURCES)
	mkdir -p $(dir $@)
	$(EMCC_PREFIX) $(EMCC) $(EMCC_FLAGS) $^ -o $@
	sed -i "s,^var libcoapWasmFactory,export var libcoapWasmFactory," $@
