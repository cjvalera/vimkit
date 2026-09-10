# Developers

## Setup

### Local setup

1. Clone the repository:
   ```bash
   git clone git@github.com:cjvalera/vimkit.git
   ```
2. Install JavaScript dependencies with `npm ci`.
3. Open `Vimkit.xcodeproj` with Xcode 27 or later.
4. [Set your signing team](https://help.apple.com/xcode/mac/current/#/dev23aab79b4) for both targets (the Vimkit app product and its Vimkit Extension target).
5. Run the project (<kbd>⌘</kbd>+<kbd>R</kbd>), then enable Vimkit and grant website access in Safari's Extensions settings.

Use `npm test` for JavaScript tests. Use the generated app for browser testing;
the source `Vimkit Extension` directory is arranged for Xcode and is not an
unpacked extension bundle.

Before release, test both Safari and Orion manually. Exercise normal pages and
SPAs, editable fields and insert mode, find wrapping, link copying and queued
background hints, counted commands, help and tab search, multiple windows,
closed-tab restore, settings updates, and a browser-restricted page. Automated
tests and unsigned builds do not verify extension signing, website permission
grants, or real browser event/API behavior.

### Local build

Run `make local-build` to create an ad-hoc signed development build at
`build/local/Vimkit.app`. The target cleans its generated bundle first so a
removed WebExtension resource cannot survive an incremental build. It uses
Xcode's **Sign to Run Locally** identity, so it does not require an Apple
developer team. Run `make local-run` to build and launch the containing app,
which registers the embedded extension with Safari.

Before enabling an ad-hoc signed build, open Safari's developer settings and
turn on **Allow unsigned extensions**. Safari resets that setting whenever it
quits. Then enable Vimkit from Safari's Extensions settings.

For Orion, choose **Tools → Extensions → Install from Disk** and select
`build/local/Vimkit.app`. Orion documents direct support for installing Safari
web extensions from disk. Grant Vimkit access to the sites used for the manual
smoke test.

### Linting & Formatting

The repository does not currently enforce an automatic formatter or linter.

### Compatibility boundaries

Vimkit checks optional WebExtension APIs at runtime. Find is implemented from
page text and closed-tab restore uses a ten-item URL cache because Safari does
not expose the equivalent native APIs. Restore recreates the URL near its old
position, but cannot restore the tab's full back/forward history. If native tab
duplication is unavailable, Vimkit recreates the current URL beside the tab.
Bookmark/history search, zoom commands, iframe coordination, and Shadow DOM
link discovery remain outside the current milestone.

### Manual verification

Jest runs in jsdom, which has no layout and no real key delivery, so these
behaviours have to be checked in Safari or Orion before a release:

- **Nested-pane scrolling** — on Gmail, Slack or Linear, `j`/`k`, `u`/`d` and
  `gg`/`G` must move the app's own scroller, not the document. A pane already at
  its end should hand the key to the next scrollable ancestor. On an ordinary
  long page the document must still scroll.
- **`excludedKeys`** — with a rule such as
  `{ "pattern": "github.com", "keys": ["/"] }`, `/` must open GitHub's own
  search rather than Vimkit's find bar, every other shortcut must still work,
  and `/` must be absent from the `?` overlay. Check it with
  `transparentBindings` both on and off.
- **`filterLinkHints`** — with the setting on, hints are numbers; typing link
  text narrows and renumbers them; `Enter` follows the first survivor; an
  icon-only link is reachable through its `aria-label`. With it off, character
  hints must return.

## Contributing

If you'd like to contribute to the development of Vimkit you can help us out through several means:

1. Create bug reports for issues you encounter, or look trough existing bug reports and try to reproduce their problems.
2. Try out the latest beta version (if there is one) and report issues back to us.
3. Contribute ideas, if you'd like something to be added to Vimkit you can create an issue describing exactly what you have in mind. Together we can help form the idea and get it into Vimkit.
4. Contribute code, if you find a bug or issue that you think you can help us solve you are more than welcome to do so.

### Contributing Code

If you want to contribute to Vimkit through coding you have to start by selecting an issue to work on. If you'd like to contribute something new, make an issue first to discuss the idea.

You can fork the Vimkit source code and make the changes to implement your feature or solve a bug. Once finished you can create a pull request back into the Vimkit repository where it can be reviewed.

After a successful review your code will be merged with the master branch and released to Vimkit users in the next release. Pretty cool!
