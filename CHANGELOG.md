Changelog
-------------

Vimkit is an independent fork of [Vimari](https://github.com/televator-apps/vimari).
Entries for 2.1.1 and earlier describe releases of Vimari by Televator Limited
and link to that project's issue tracker; they are kept here for history.

### 1.0.0 — first Vimkit release

* Rename the project to Vimkit, with its own bundle identifiers
  (`com.christianvalera.Vimkit`), original icon, and independent App Store
  identity. Vimkit does not update or replace Vimari.
* Replace the legacy Safari App Extension with a Manifest V3 Safari Web Extension.
* Move tab actions to standard WebExtension APIs and settings to `browser.storage.local`.
* Add a JSON settings page with validation, reset, import, and export support.
* Add sequence-aware commands with count prefixes and `gt`/`gT` aliases.
* A mistyped second key abandons the sequence instead of running on its own,
  so `yx` no longer closes the tab you meant to copy the URL of.
* The modifier setting applies to every key of a shortcut rather than only the
  first, keeping a page's own typing out of a half-finished sequence.
* `CTRL+[` yields to a shortcut bound to it, so a `ctrl` modifier no longer
  makes `[[` unreachable. `ESC` is unaffected.
* Insert mode is a normal binding (`enterInsertMode`), so `i` can be rebound
  and appears in the shortcut overlay.
* Add page find, URL and link copying, multi-link hints, URL-level navigation,
  and an accessible shortcut overlay. Find highlights every match while you
  type and selects the current one when the bar closes, so `n`/`N` continue
  from it.
* Add first/last/previous tab navigation, tab search, native tab creation and
  duplication, and cached closed-tab restore.
* Add `]]`/`[[` to follow a page's next/previous link, `<<`/`>>` to move the
  current tab, and `R` for a cache-bypassing reload.
* Generate shortest prefix-free link hints, colour hints by element kind
  (link, control, text input), and add `yF`/`ym` to copy a link's text or a
  Markdown link.
* Add `filterLinkHints`, an opt-in hint mode that selects a link by typing its
  text. Hints become digits, the candidate set narrows against link text,
  `aria-label`, `title`, `alt` and `placeholder`, and survivors are renumbered
  as it narrows.
* Add `excludedKeys`, per-site rules that surrender individual shortcuts to a
  site — GitHub's `/`, Gmail's `j`/`k` — instead of disabling Vimkit entirely.
  An excluded shortcut is left unbound, so it falls through to the page — even
  with `transparentBindings` off — and drops out of the help overlay for that
  site.
* Scroll the nested pane under the cursor or the focused element rather than
  always the document, so `j`/`k`, `u`/`d` and `gg`/`G` work inside app shells
  like Gmail and Slack. A pane already at the requested end hands the key to its
  nearest scrollable ancestor.
* Persist tab activation and a ten-item closed-tab cache using session storage
  when available, with local-storage fallback.
* Ship the MIT notice and acknowledgments inside the app, and add in-app links
  to the privacy policy and license information.
* Remove the unused Apache-2.0 licensed `mousetrap.js`.
* Require macOS 14 and Safari 26.2 or later.

### 2.1.1 — Vimari

* Rebuild for Apple Silicon
* Fixes excludedUrls handling

### 2.1.0
* Add `transparentBindings` setting that allows the use of non-bound keys in normal mode ([#188](https://github.com/televator-apps/vimari/issues/188)).
* Remove eager link hint triggering [#190](https://github.com/televator-apps/vimari/issues/190)
* Use `window.open` for `openNewTab` action [#189](https://github.com/televator-apps/vimari/issues/189)
* Add user customisation (based on the work of @nieldm [#163](https://github.com/televator-apps/vimari/pull/163)).
* Update Vimari interface to allow users access to their configuration.
* Remove `closeTabReverse` action.
* Normal mode now isolates keybindings from the underlying website, this means that to interact with the underlying website you need to enter insert mode.
* You can enter insert mode by pressing <kbd>i</kbd> and exit the mode by pressing <kbd>esc</kbd>. Activating either mode will display the HUD.
* In insert mode Vimari keybindings are disabled (except for <kbd>esc</kbd> which brings you back to normal mode) allowing you to interact with the underlying website.
* Add `goToFirstInput` action on <kbd>g i</kbd> by default (by [isundaylee](https://github.com/isundaylee)).
* Add smooth scrolling (based on sVim implementation).

### 2.0.3 (2019-09-26)

* Fix newTabHintToggle to use shift+f instead of F
* Implement forward tab and backward tab commands.
* Close tab with x is now implemented. Note that this relies on Safari's default behaviour to choose whether to switch to the left or right tab after closing the current tab.

### 2.0.2 (2019-09-23)

* Release a signed, notarized App and Safari App Extension 
* Reverse link hints, so nearby links have different hints [#77](https://github.com/televator-apps/vimari/issues/77)
* Hide non-matching link hints [#79](https://github.com/televator-apps/vimari/issues/79)
* Show state of extension in main application

### 2.0.0 (14/7/2018)
* vimari now exists as a Safari App Extension, making it compatible with Safari
  version 12

### 1.13.0 (16/8/2018)
* New fresh icon
* Removed shift as default modifier key
* 't' now opens new tab
* HUD now looks nicer
* Open link in new tab now works (bugfix)
* Excluded URL doesn't need to be exact anymore (bugfix)

### 1.2 - 1.12 skipped

### 1.1 (31/07/2011)
* Updated to work with the new version of Safari on lion
* Removed history forward / back
* Changed directory structure to make it more developer friendly

### 1.0 (21/11/2010)
* Changed the way vimari modifier keys work.  ESC key depricated.  Now use CTRL-modifierkey.

### 0.4 (17/11/2010)
* First BETA release !
* Press ESC to enter a permanent state of 'non' insert mode.  Clicking on any input then exits insert mode.  This fixes several issues with google and facebook.

### 0.3 (16/11/2010)
* Moved the extension startup code to be loaded before the browser page.  Events can now be intercepted before they are passed to the browser page.
* Created a manifest file, this allows automatic updates to take place.
* Added insert mode.  If the selected node can accept an input, the extension is disabled.  This functionality still needs some work.
* Ported the HUD from vimium.  The hud displays information along the bottom of the screen.  The hud has been ported but is not used for very much at the moment.

### 0.2 (14/11/2010)
* Pressing ESC now removes focus from any input fields and activates modifiers

### 0.1 (14/11/1020)
* First alpa release of vimari.  Added basic features but still very buggy.
