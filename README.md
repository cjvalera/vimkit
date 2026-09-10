<img align="left" width=160 style="padding: 10px" src="assets/logo.svg"></img>

## Vimkit
_Keyboard shortcuts extension for Safari and Orion_

![GitHub release (latest by date)](https://img.shields.io/github/v/release/cjvalera/vimkit)
![GitHub release (latest by date including pre-releases)](https://img.shields.io/github/v/release/cjvalera/vimkit?include_prereleases&label=pre%20release)

Vimkit is a Safari web extension that provides vim style keyboard based navigation.
This lets you control your browser from your keyboard instead of having to use your
mouse to open links, scroll, etc. It runs in Safari and in [Orion](https://kagi.com/orion/),
which loads Safari web extensions directly.

Vimkit is an independent fork of [Vimari](https://github.com/televator-apps/vimari)
by Televator Limited, which is itself a port of
[vimium](https://github.com/philc/vimium) to Safari. Vimkit is not published,
endorsed, or supported by either project — see
[ACKNOWLEDGMENTS.md](ACKNOWLEDGMENTS.md) for the full lineage.

<!-- TODO: add assets/screenshot.png — capture link hints in Safari with Vimkit enabled.
     The previous screenshot showed Vimari branding and was removed in the rename. -->

## Installation

Vimkit 1.0 requires macOS 14 or later and Safari 26.2 or later.

1. Build and run `Vimkit.xcodeproj` in Xcode after selecting your signing team for both targets.
2. Launch Vimkit and click **Open in Safari Extensions Preferences**.
3. Enable Vimkit and grant it access to the websites where you want keyboard navigation.
4. Add Vimkit to Safari's toolbar. Clicking its toolbar button opens the settings page.

For local testing in Orion, build the app with `make local-build`, then choose
**Tools → Extensions → Install from Disk** in Orion and select
`build/local/Vimkit.app`. See [Orion's Safari extension support](https://help.kagi.com/orion/browser-extensions/macos-extensions.html#safari-extensions-support).

## Usage

### Settings
Open Vimkit's extension settings from its Safari toolbar button or from Safari's
Extensions settings. Configuration remains JSON and is stored by Safari. The
settings page can save, reset, import, and export `userSettings.json` files.
Changes apply to open pages without a reload.

**Modifier** - Modifier key to hold down with your action key. If
you leave it blank you don't need to hold down anything (default
setting). It applies to every key of a shortcut, so with `ctrl` the
two-key `yy` becomes `⌃y⌃y`.

**Excluded URLs** - Comma separated list of website URLs you don't want
to use Vimkit with. To exclude GitHub for example, provide the value
`github.com` or `http://github.com`. It's smart and should handle all
possible domain cases.

**Link Hint Characters** - Allowed characters to be used when generating
link shortcuts.

**Extra detection by cursor style** - Detect clickable links by looking
for HTML elements having cursor style set to "pointer".

**Scroll Size** - How much each scroll will move on the page.

`Vimkit v2.1+`

**Smooth Scroll** - Scroll smoothly through the page.

**Normal vs Insert mode** - Isolate website keybindings from the
Vimkit keybindings. In normal mode you can use the Vimkit keybindings
while in insert mode you can use the websites own keybindings.

**Transparent Bindings** - Full keybinding isolation might not
be your style, instead the transparent bindings setting (when enabled)
allows you to use all **non-Vimkit-bound** keys to interact with the web
page as if you were in insert mode.

**Multiple Bindings** - You can bind multiple keybindings to a Vimkit
action. This is done by specifying an array of bindings in the 
configuration file, like so: `"goToPageTop": ["g g", "shift+k"]`.

Bindings can be multi-key sequences. Sequences time out after one second and
can be cancelled with <kbd>Esc</kbd>. Counts from 1–999 work with scrolling,
history, and relative tab navigation; for example, <kbd>5</kbd><kbd>j</kbd>
scrolls five steps and <kbd>3</kbd><kbd>g</kbd><kbd>t</kbd> selects the third tab.

Link hints are colour-coded: yellow for links, blue for buttons and other
controls, green for text fields. Hints use the fewest characters the
`linkHintCharacters` alphabet allows, so on sparse pages a single key selects
a link; the assignment is deterministic for a given number of hints.


### Keyboard Bindings

These bindings are the ones set by default, however you are able to change them in the settings.

#### In-page navigation
    f       Toggle links
    F       Toggle links (open link in new tab)
    ⌥f      Toggle links (keep open for multiple background tabs)
    yf      Copy a hinted link URL
    yF      Copy a hinted link's text
    ym      Copy a hinted link as a Markdown link
    k       Scroll up
    j       Scroll down
    h       Scroll left
    l       Scroll right
    u       Scroll up half page
    d       Scroll down half page
    gg      Go to top of page
    G       Go to bottom of page
    gi      Go to first input
    /       Find text on the page
    n       Next find match
    N       Previous find match
    yy      Copy the current URL
    gu      Go up one URL level
    gU      Go to the site's root
    ?       Show Vimkit help

Scroll commands act on whatever is actually scrolling. Vimkit walks up from the
focused element — or from the element in the middle of the viewport — to the
nearest ancestor that can still scroll in the requested direction, so
<kbd>j</kbd> and <kbd>k</kbd> work inside the nested panes that Gmail, Slack and
similar app shells use. When nothing nested can scroll, the page scrolls.
<kbd>u</kbd> and <kbd>d</kbd> move half of that pane's height, and <kbd>gg</kbd>
/ <kbd>G</kbd> jump to its ends.

#### Page/Tab navigation
    H       History back
    L       History forward
    r       Reload
    R       Reload, bypassing the cache
    ]]      Follow the page's "next" link
    [[      Follow the page's "previous" link
    w       Next tab
    q       Previous tab
    gt      Next tab (or select a tab when prefixed by a count)
    gT      Previous tab
    g0      First tab
    g$      Last tab
    ^       Previously active tab
    <<      Move the current tab left
    >>      Move the current tab right
    T       Search open tabs
    x       Close current tab
    X       Restore the last closed tab
    t       Open new tab
    yt      Duplicate the current tab

#### Vimkit Modes
    i       Enter insert mode
    ESC     Enter normal mode
    CTRL+[  Enter normal mode

`CTRL+[` is an alias for `ESC`. If a shortcut is bound to `CTRL+[` — which a
`ctrl` modifier does to `[[` — that shortcut wins and `ESC` remains the way
back to normal mode.
    
### Tips & Tricks

Vimkit is built as a Safari Extension, this poses some limits on what is possible through the extension. However default Safari shortcuts can help you keep your hands at the keyboard. Some helpful ones are listed here:

- **Focus URL Bar** <kbd>⌘</kbd><kbd>l</kbd> - This is a feature not available in Vimkit, it is also helpful where extensions are not loaded (for example on `topsites://`). By focusing the URL Bar you can go to a website where the extension is loaded.

- **Reader mode** <kbd>⇧</kbd><kbd>⌘</kbd><kbd>R</kbd> - Currently Vimkit does not support entering Reader mode (due to API limitations), also navigation inside reader mode (for example using <kbd>j</kbd> or <kbd>k</kbd>) is not supported.

- **Browser-restricted pages** - Safari does not inject extensions on every
  internal page. Use <kbd>⌘</kbd><kbd>L</kbd> to leave those pages before using
  Vimkit commands.

## Privacy

Vimkit collects nothing and makes no network requests of its own. Settings and
tab state stay on your Mac. See [PRIVACY.md](PRIVACY.md).

## License

MIT. Copyright (c) 2026 Christian Valera, with prior copyright held by the
Vimari and Vimium contributors — see [LICENSE](LICENSE) for the full notice and
[ACKNOWLEDGMENTS.md](ACKNOWLEDGMENTS.md) for attribution.
