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

# Simple entry points for the documented build workflows.
.PHONY: build update-reference help
build:
	@$(MAKE) --no-print-directory clean
	@$(MAKE) --no-print-directory all
	@printf '\nReady: %s\nSign and install this IPA on your Apple TV.\n' "$(abspath $(OUTPUT_IPA))"

update-reference:
	@$(MAKE) --no-print-directory refresh-cobalt-version
	@$(MAKE) --no-print-directory userscript
	@$(MAKE) --no-print-directory build
	@$(MAKE) --no-print-directory test

help:
	@printf '%s\n' 'make build              Build a fresh mutube.ipa' 'make update-reference   Refresh the Cobalt version label, rebuild and test' 'make test               Run checks after building' 'make clean              Remove the generated IPA'
