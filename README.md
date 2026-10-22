# MuTube

YouTube for Apple TV, enhanced with a locally bundled, patched version of
[TizenTube](https://github.com/reisxd/TizenTube).

This build preserves YouTube's native navigation and adds TizenTube's ad-blocking,
SponsorBlock, settings, and playback features. The patched userscript is included
in the IPA, so it does not need to download executable JavaScript from a CDN.

## Before you start

You need:

- A Mac with **Xcode and the tvOS SDK** installed. Open Xcode once to finish its setup.
- **uv**, **Node.js with npm**, and **Python 3.9 or newer**, available in Terminal.
- Your own **decrypted YouTube 4.54.01 IPA**. Other versions are not supported by these native patches.
- A way to sign and install an IPA on your Apple TV.

The build resolves its Python dependencies with uv. JavaScript build and test
dependencies are installed from the included npm lockfiles when needed.

## Build an IPA

### 1. Get the project

Download and extract this repository, or clone it:

```sh
git clone https://github.com/dmytrokoren/mutube.git
cd mutube
```

Already have the project? Open Terminal in that folder and continue below.
For the prepared Downloads folder, use:

```sh
cd ~/Downloads/MuTube-Build
```

### 2. Add your YouTube IPA

Create an `ipa` folder inside the project if it does not already exist:

```sh
mkdir -p ipa
```

Place your decrypted IPA there and name it exactly:

```text
ipa/YouTube_4.54.01_decrypted.ipa
```

### 3. Build

Run this single command from the project folder:

```sh
make build
```

When it finishes, **`mutube.ipa`** will be in the same folder as this README.
Sign that file and install it on your Apple TV.

`make build` removes an earlier output and creates a fresh IPA. It never
modifies your original YouTube IPA. To run the automated checks afterward:

```sh
make test
```

## When a new Cobalt release is published

To refresh the Cobalt version shown in TizenTube Settings, run:

```sh
make update-reference
```

This command does all four steps for you:

1. Checks the official [TizenTube Cobalt release feed](https://github.com/reisxd/TizenTubeCobalt/releases).
2. Updates the local Cobalt version reference, if it has changed.
3. Rebuilds the patched userscript and creates a fresh `mutube.ipa`.
4. Runs the automated checks.

When it completes successfully, sign and install the new `mutube.ipa`.
If a step fails, the command stops—resolve the reported error before installing.

**This refreshes the updater's version reference. It does not install a new
Cobalt engine or download new TizenTube functionality.** The tvOS engine still
comes from your YouTube IPA. The Cobalt release reference and the bundled
TizenTube userscript have separate version numbers.

Automatic update checks remain disabled. Inside the app, **Check for updates**
checks the Cobalt release feed only when selected and shows its result in a
native toast popup. The startup-check checkbox is hidden.

## Updating TizenTube features

The patched TizenTube source lives in `vendor/mods/`. To bring in upstream
features or fixes, merge the new upstream source while retaining the tvOS
changes, then run:

```sh
make userscript && make build && make test
```

Replacing the patched source with the stock CDN script would remove the Kids,
sidebar, updater, and startup fixes. Refreshing the Cobalt version reference
alone does not perform this source update.

## What's included

- **Kids profiles:** hide only the additional TizenTube Settings category and
  its command. Profile detection uses YouTube's native identity and theme.
- **Native navigation:** preserve Home, Search, Subscriptions, Settings, Privacy,
  and YouTube's original Shorts navigation.
- **Adult profiles:** retain TizenTube Settings.
- **Manual updater:** Cobalt release checks with the requested version row and
  toast popup; no startup checks or notifications.
- **Startup compatibility:** asynchronous userscript initialization, handling for
  missing native cache data, and delayed optional playback services.
- **Bounded patching:** a dedicated read-only payload segment, checked header
  allocations, and verification of existing executable sections.

## Commands at a glance

| Command | What it does |
| --- | --- |
| `make build` | Creates a fresh `mutube.ipa`. |
| `make update-reference` | Refreshes the Cobalt version reference, rebuilds, and tests. |
| `make userscript` | Rebuilds the patched JavaScript from local source. |
| `make test` | Runs syntax, behavior, startup, and patch-safety checks after a build. |
| `make clean` | Removes the generated `mutube.ipa`. |
| `make help` | Lists the main commands in Terminal. |

## Troubleshooting

| Problem | What to check |
| --- | --- |
| Input IPA is missing | Confirm the exact path is `ipa/YouTube_4.54.01_decrypted.ipa`. |
| `uv`, `npm`, or `python3` is not found | Install the missing tool, reopen Terminal, and try again. |
| `xcrun` cannot find the tvOS SDK | Finish Xcode setup and install its tvOS SDK. |
| Dependency download or release check fails | Check your internet connection and retry. |
| A native patch reports an unexpected instruction | Use the supported decrypted YouTube 4.54.01 IPA. Do not bypass the check. |
| Build succeeds but installation fails | Check your signing and installation setup. The build output still needs signing. |

Automated tests do not replace Apple TV testing. Confirm launch, profile
switching, remote navigation, playback, and update popups on the device.
Startup diagnostics are available in `window.__mutubeStatus`.

## Files to keep

Keep `bootstrap.js`, `inject.js`, `patcher.py`, `Makefile`, and `vendor/` for
building. `vendor/` contains the patched source, compiled userscript, dependency
lockfile, and TizenTube's license. `tests/` provides validation, and `tools/`
contains the manual version-reference refresh tool.

The entire `ipa/` folder, all `.ipa` files, installed dependencies, caches,
and signing material are excluded by `.gitignore`. Keep those files local.

## Credits

- [Exaphis/MuTube](https://github.com/Exaphis/mutube), based on commit
  `ffa68bfc5691e45669f20cc8764b57db1168e777`.
- [reisxd/TizenTube](https://github.com/reisxd/TizenTube), based on commit
  `f99945a84ff767bf14ad8c1146e8e3fd49a3d628`, with the tvOS changes in this repository.
- [TizenTube Cobalt](https://github.com/reisxd/TizenTubeCobalt), the upstream
  project whose releases are tracked by the manual updater.

TizenTube's license is included in [`vendor/LICENSE`](vendor/LICENSE).
