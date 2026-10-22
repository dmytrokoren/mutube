YOUTUBE_IPA := ./ipa/YouTube_4.54.01_decrypted.ipa
OUTPUT_IPA := ./mutube.ipa
PATCHER_FLAGS :=

ifneq ($(PRINTF_LOGS),)
ifneq ($(PRINTF_LOGS),0)
PATCHER_FLAGS += --enable-printf-logs
endif
endif

.PHONY: all
all: $(OUTPUT_IPA)

$(OUTPUT_IPA): $(YOUTUBE_IPA) patcher.py bootstrap.js inject.js vendor/dist/userScript.js
	uv run patcher.py --in $(YOUTUBE_IPA) --out $(OUTPUT_IPA) $(PATCHER_FLAGS)

.PHONY: clean
clean:
	rm -f $(OUTPUT_IPA)

.PHONY: userscript test
userscript:
	cd vendor/mods && npm ci --no-audit --no-fund && npm run build

test: tests/node_modules/jsdom/package.json
	node --check bootstrap.js
	node --check inject.js
	node --check vendor/dist/userScript.js
	node --test tests/runtime.test.mjs tests/dom-startup.test.cjs
	uv run --script patcher.py --help >/dev/null
	uv run --with lief --with capstone python tests/patcher_test.py

vendor/dist/userScript.js: $(wildcard vendor/mods/*.js vendor/mods/*/*.js vendor/mods/*/*.css vendor/mods/*/*/*.js vendor/mods/*/*/*.json) vendor/mods/package-lock.json
	cd vendor/mods && npm ci --no-audit --no-fund && npm run build

tests/node_modules/jsdom/package.json: tests/package.json tests/package-lock.json
	cd tests && npm ci --ignore-scripts --no-audit --no-fund

.PHONY: refresh-cobalt-version
refresh-cobalt-version:
	python3 tools/refresh-cobalt-version.py
