# MuTube build folder

This folder contains the latest working tvOS source, the minified userscript,
locked build dependencies, tests, and an untouched copy of your decrypted
YouTube 4.54.01 IPA under `ipa/`. Generated IPAs and dependency caches are omitted.

## Build an IPA

Requirements: Xcode with the tvOS SDK, uv, Node.js/npm, Python 3, and make.
Open Terminal in this folder:

```sh
make clean && make
```

The result is `mutube.ipa` in this folder. Sign and install that file using your
usual process. The input IPA is never overwritten.

## When a new Cobalt release is published

To fetch the official latest TizenTube Cobalt release and refresh the updater's
version reference:

```sh
make refresh-cobalt-version
make userscript
make clean && make
make test
```

The first command is an explicit manual network check; it changes only
`vendor/mods/cobaltRelease.js`. It does not download or install a new Cobalt
engine or a new TizenTube userscript. The remaining commands compile the current
local source. Automatic version checks and the startup checkbox stay disabled.

## Updating actual TizenTube functionality

The bundled TizenTube userscript source is in `vendor/mods/` (upstream 1.15.2 plus
the tvOS modifications). A newer upstream userscript must be merged into this
source while retaining the Kids, native sidebar, manual-toast updater, and
startup fixes. Do not replace it with the stock CDN bundle: that discards these
changes. After merging, use `make userscript`, `make clean && make`, and
`make test`. A Cobalt Android release alone does not update this tvOS engine.

## Current behavior

- Kids: suppress only TizenTube's extra Settings category and command using
  native profile/theme state. Preserve the native guide and Settings entries.
- Adult: retain TizenTube Settings.
- Updater: TizenTube Cobalt Updater, reference version 2.0.3, manual GitHub-release
  checks and native toast results matching the provided reference.
- Startup: load the userscript asynchronously; tolerate absent native cache and
  delayed optional services. Keep the original MediaSource compatibility hook.
- Allocation: payload in a dedicated read-only Mach-O segment; bounded hooks in
  header padding. All original sections are verified before patching.

`make test` installs the DOM-test dependency from its lockfile on first use.
The current source passes 16 tests and a clean IPA build. Apple TV remains the
final check for signing, playback, profile switching and remote interaction.
Native startup diagnostics are available at `window.__mutubeStatus`.

## Source provenance

MuTube: Exaphis/mutube, commit ffa68bfc5691e45669f20cc8764b57db1168e777.
TizenTube: reisxd/TizenTube, commit f99945a84ff767bf14ad8c1146e8e3fd49a3d628.
TizenTube's GPL license is retained in `vendor/LICENSE`.
