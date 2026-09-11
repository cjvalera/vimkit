# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Vimkit is a Manifest V3 Safari Web Extension (also loaded by Orion) that adds Vim-style keyboard navigation. It is an independent fork of Vimari, itself a port of Vimium; `ACKNOWLEDGMENTS.md` records the lineage and `js/lib/*.js` are vendored Vimium/sVim files that keep their attribution. Requires macOS 14 and Safari 26.2+. It makes no network requests and stores everything in `browser.storage`.

## Commands

```sh
npm install              # or: make deps
npm test                 # Jest (jsdom), what CI runs on Node 20 and 22
npm run test:watch
npx jest tests/command-dispatcher.spec.js      # one file
npx jest -t "abandons the sequence"            # one test by name
npm run test:e2e         # Playwright, real extension in Chromium (npx playwright install chromium first)
npx playwright test tests/e2e/scrolling.spec.js  # one e2e file
make local-build         # unsigned Debug build -> build/local/Vimkit.app (for Orion: Tools > Extensions > Install from Disk)
make local-run           # build and open the app
```

The Xcode project `Vimkit.xcodeproj` has one scheme, `Vimkit`, and two targets: `Vimkit` (thin macOS host app that opens Safari's extension preferences) and `Vimkit Extension`. For Safari, build and run from Xcode with your signing team on both targets, then enable the extension in Safari. There is no linter configured.

Jest runs the content scripts in jsdom, which hides browser-only behaviour (for example window timers rejecting a foreign `this`, moving the selection stealing keystrokes from a focused input, or anything that reads layout — jsdom reports every dimension as 0). `npm run test:e2e` (`tests/e2e/`, Playwright) loads the real extension into Chromium for those cases; it needs `npx playwright install chromium` once, and Chromium is not Safari or Orion, so release still needs the manual pass in `DEVELOPERS.md`. When a change depends on real engine behaviour, cover it there, or emulate the browser check in a unit test as `tests/command-dispatcher.spec.js` and `tests/content-features.spec.js` do.

## Bundle layout vs. source layout

Sources live under `Vimkit Extension/js/`, `js/lib/`, `css/`, `json/`, but Xcode copies every resource to the bundle root. `manifest.json`, `options.html`, and `browser.runtime.getURL("defaultSettings.json")` therefore use bare filenames. A new script or asset must be added to the `Vimkit Extension` target's Resources phase in `project.pbxproj` and listed in `manifest.json`; `js/mocks.js` is test-only and not shipped.

## Architecture

**Two runtimes, one message protocol.** Content scripts run in every top frame (`all_frames: false`, `document_start`); `background.js` is the MV3 service worker. The content side never touches `browser.tabs`. It calls `WebExtensionCommunicator` (`request*` methods) which sends `{ action, ...details }` with the `VimkitAction` strings defined in `background.js`; `handleRuntimeMessage(request, sender)` scopes everything to `sender.tab.windowId` and always resolves `{ ok, error? }` rather than throwing. `reportRequest` in `injected.js` turns `ok: false` into an error status overlay. The background keeps per-window activation history (for `^`) and a ten-item closed-tab cache (for `X`) in `storage.session`, falling back to `storage.local`. Use the promise-based `browser.*` namespace, not `chrome.*`.

**Content scripts share one global scope.** The manifest order is `svim-scripts`, `settings`, `WebExtensionCommunicator`, `command-dispatcher`, `content-features`, `keyboard-utils`, `vimium-scripts`, `link-hints`, `injected`. Top-level `var`s such as `settings`, `customScrollBy`, `linkHintsModeActivated`, `extensionCommunicator`, `clipboardController`, and `LinkHintMode` are deliberately cross-file globals; `svim-scripts.js` resolves `settings` off the global object through `currentSettings()`, and `setSettings` publishes it to `window` so Jest's per-file module scope sees it. Each module ends with `if (typeof module !== "undefined") { module.exports = ...; global.X = X; }` so Jest can load the same files.

**`injected.js` is the orchestrator.** `actionMap` maps action names to handlers receiving `meta` (`count`, `countProvided`, `binding`); `commandDescriptions` feeds the help overlay; `effectiveBindingsFor` adds the fixed `gt`/`gT` aliases. `onDocumentKeyDown` is a capture-phase `keydown` listener on `document` that gates on `extensionActive`, `insertMode`, link-hint mode, an open find bar, or an open modal, then hands the event to the dispatcher. Settings arrive via `VimkitSettings.load()` and `subscribe`, and every change rebinds live without a page reload. Insert mode is an ordinary binding (`enterInsertMode`), not special-cased.

**`VimkitCommandDispatcher`** is a trie of normalized tokens (`ctrl+alt+meta+shift+key` order, Shift explicit only for letters and named keys, punctuation already shifted). It handles count prefixes (1–999), a one-second sequence timeout, abandoning a sequence on a mismatched key instead of restarting at the root (so `yx` is swallowed), applying the global modifier to every token, and `isEscape`, where `ctrl+[` is Escape only while nothing is bound to it. `eventToToken` recovers the letter from `event.code` for Option combinations that Safari/Orion report as composed characters.

**`VimkitContentFeatures`** owns all UI as shadow-DOM hosts `div[data-vimkit-overlay="status|help|find|tabs"]` appended to `documentElement` (`OverlayManager`). `FindMode` highlights matches with the CSS Custom Highlight API while the bar is open and only moves the real selection when it closes, so typing keeps flowing into the field and `n`/`N` continue from the current match. `TabPicker`, `ClipboardController` (async clipboard then `execCommand` fallback), `parentUrl`, and `findPaginationLink` (`rel=next/prev`, then scored anchor text) live here too.

**`link-hints.js`** (Vimium-derived) renders `#vimiumHintMarkerContainer` markers with shortest prefix-free hint strings from `linkHintCharacters`, coloured by element kind via `vimkitHint-*` classes. `LinkHintMode` selects the outcome; the copy modes hint only anchors, `openQueue` re-arms after each pick until Escape.

**Settings** are the merge of `json/defaultSettings.json` (fetched through `runtime.getURL`) and `storage.local.settings`; `VimkitSettings.validate` is the single source of type rules, and `options.html`/`options.js` is a JSON editor over `VimkitSettings` (save, reset, import, export).

## Adding or changing a command

Touch all of: the binding in `json/defaultSettings.json`, the handler in `actionMap`, the text in `commandDescriptions`, the binding table in `README.md`, and `CHANGELOG.md`. A tab-level command also needs a `VimkitAction` value and `handleRuntimeMessage` case in `background.js` plus a `request*` method in `WebExtensionCommunicator.js`. Help-overlay labels come from `formatBinding` and must read the way the README writes shortcuts (`gg`, `G`, `⌥f`).

## Tests

`jest.config.js` loads `js/mocks.js` and then every content script as `setupFiles`, so specs see `window.VimkitInjected`, `VimkitSettings`, `VimkitCommandDispatcher`, and friends as globals. `mocks.js` installs `global.browser` (storage, tabs, runtime stubs with `jest.fn`) and exposes `global.__vimkitMocks` for inspecting stored settings and registered listeners. `tests/background.spec.js` requires `background.js` directly. `tests/vimkit.spec.js` still uses `expect.js`; newer specs use Jest's `expect`.
