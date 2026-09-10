const {
    ClipboardController,
    FindMode,
    OverlayManager,
    TabPicker,
    findScrollTarget,
    parentUrl,
    visibleTextMatches
} = require("../Vimkit Extension/js/content-features.js");

describe("content features", () => {
    function makeVisible(element) {
        element.getClientRects = () => [{ top: 0, left: 0, width: 20, height: 10 }];
        element.scrollIntoView = jest.fn();
    }

    beforeEach(() => {
        document.body.innerHTML = "";
        jest.restoreAllMocks();
    });

    it("finds visible DOM text while excluding controls and hidden/script content", () => {
        document.body.innerHTML = `<p>Alpha beta alpha</p><div style="display:none">alpha</div><script>alpha</script><textarea>alpha</textarea>`;
        makeVisible(document.querySelector("p"));
        document.querySelector("div").getClientRects = () => [{ top: 0 }];
        expect(visibleTextMatches(document, window, "ALPHA")).toHaveLength(2);
    });

    it("updates incrementally and wraps forward and backward across dynamic DOM", () => {
        document.body.innerHTML = "<p>one match and another match</p>";
        makeVisible(document.querySelector("p"));
        const overlays = new OverlayManager(document, window);
        const find = new FindMode(document, window, overlays);
        find.open();
        find.update("match");
        expect(find.matches).toHaveLength(2);
        expect(find.index).toBe(0);
        find.move(-1);
        expect(find.index).toBe(1);
        find.move(1);
        expect(find.index).toBe(0);

        const added = document.createElement("p");
        added.textContent = "dynamic match";
        makeVisible(added);
        document.body.appendChild(added);
        find.move(1);
        expect(find.matches).toHaveLength(3);
        find.close();
    });

    it("highlights matches while open and selects the current match on close", () => {
        document.body.innerHTML = "<p>needle one. needle two.</p>";
        makeVisible(document.querySelector("p"));
        window.getSelection().removeAllRanges();
        const previous = { CSS: window.CSS, Highlight: window.Highlight };
        const registry = new Map();
        window.CSS = { highlights: registry };
        window.Highlight = function (...ranges) { return new Set(ranges); };
        try {
            const find = new FindMode(document, window, new OverlayManager(document, window));
            find.open();
            find.update("needle");
            expect(window.getSelection().rangeCount).toBe(0);
            expect([...registry.get("vimkit-find-current")][0].toString()).toBe("needle");
            expect(registry.get("vimkit-find-match").size).toBe(1);
            find.move(1);
            expect([...registry.get("vimkit-find-current")][0].startOffset).toBe(12);
            find.close();
            expect(registry.has("vimkit-find-current")).toBe(false);
            expect(window.getSelection().toString()).toBe("needle");
            expect(window.getSelection().anchorOffset).toBe(12);
            find.move(1);
            expect(window.getSelection().anchorOffset).toBe(0);
        } finally {
            window.CSS = previous.CSS;
            window.Highlight = previous.Highlight;
        }
    });

    it("shows a no-match state and closes on Escape", () => {
        document.body.innerHTML = "<p>only hay</p>";
        makeVisible(document.querySelector("p"));
        const find = new FindMode(document, window, new OverlayManager(document, window));
        find.open();
        find.update("needle");
        expect(find.count.textContent).toBe("No matches");
        find.input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        expect(find.isOpen()).toBe(false);
    });

    it("uses the async clipboard and then the textarea fallback", async () => {
        const overlays = { showStatus: jest.fn() };
        const navigatorObject = { clipboard: { writeText: jest.fn().mockResolvedValue() } };
        const clipboard = new ClipboardController(document, navigatorObject, overlays);
        await expect(clipboard.copy("https://example.com", "URL")).resolves.toBe(true);
        expect(navigatorObject.clipboard.writeText).toHaveBeenCalledWith("https://example.com");

        navigatorObject.clipboard.writeText.mockRejectedValue(new Error("denied"));
        document.execCommand = jest.fn(() => true);
        await expect(clipboard.copy("fallback", "Link")).resolves.toBe(true);
        expect(document.execCommand).toHaveBeenCalledWith("copy");
        expect(document.querySelector("textarea")).toBeNull();
    });

    it("computes parent and origin URLs without retaining search or hash", () => {
        expect(parentUrl("https://example.com/a/b/?q=1#hash", false)).toBe("https://example.com/a/");
        expect(parentUrl("https://example.com/a", false)).toBe("https://example.com/");
        expect(parentUrl("https://example.com/a/b", true)).toBe("https://example.com/");
    });

    it("gives each help shortcut its own key element", () => {
        const overlays = new OverlayManager(document, window);
        overlays.showHelp([
            { bindings: ["gg", "K"], description: "Go to the top of the page" },
            { bindings: ["yF"], description: "Copy a link's text" }
        ]);
        const root = overlays.modalHost.shadowRoot;
        const rows = root.querySelectorAll("tr");
        expect([...rows[0].children[0].querySelectorAll("kbd")].map((key) => key.textContent))
            .toEqual(["gg", "K"]);
        expect(rows[0].children[1].textContent).toBe("Go to the top of the page");
        expect(rows[1].children[0].querySelector("kbd").textContent).toBe("yF");
        overlays.closeModal();
        expect(overlays.modalHost).toBeNull();
    });

    it("filters the tab picker by title and URL and activates a result", () => {
        const overlays = new OverlayManager(document, window);
        const picker = new TabPicker(document, overlays);
        const select = jest.fn();
        picker.open([
            { id: 1, title: "Documentation", url: "https://docs.example.com" },
            { id: 2, title: "Inbox", url: "https://mail.example.com" }
        ], select);
        const root = picker.host.shadowRoot;
        const input = root.querySelector("input");
        input.value = "mail";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        expect(root.querySelectorAll("button.tab")).toHaveLength(1);
        root.querySelector("button.tab").click();
        expect(select).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }));
        expect(picker.host).toBeNull();
    });

    it("reports a visible clipboard error when both paths fail", async () => {
        const overlays = { showStatus: jest.fn() };
        document.execCommand = jest.fn(() => false);
        const clipboard = new ClipboardController(document, {}, overlays);
        await expect(clipboard.copy("nope", "URL")).resolves.toBe(false);
        expect(overlays.showStatus).toHaveBeenCalledWith(expect.stringContaining("clipboard"), "error");
    });
});

describe("pagination links", () => {
    const { findPaginationLink } = require("../Vimkit Extension/js/content-features.js");

    afterEach(() => { document.head.innerHTML = ""; document.body.innerHTML = ""; });

    it("prefers rel=next and rel=prev", () => {
        document.body.innerHTML = `
            <a id="text-next" href="/p3">Next</a>
            <a id="rel-next" rel="next" href="/p2">Onward</a>
            <a id="rel-prev" rel="prev" href="/p0">Backward</a>`;
        expect(findPaginationLink(document, "next").id).toBe("rel-next");
        expect(findPaginationLink(document, "previous").id).toBe("rel-prev");
    });

    it("scores link text when rel is missing, preferring exact matches and later next links", () => {
        document.body.innerHTML = `
            <a id="prev" href="/p0">&laquo; Previous</a>
            <a id="nextish" href="/about">What comes next for us</a>
            <a id="headline" href="/story">A single-folder back end you write in TypeScript</a>
            <a id="next-top" href="/p2">Next</a>
            <a id="next-bottom" href="/p2?b">Next</a>
            <a id="skip" href="#">Next</a>`;
        expect(findPaginationLink(document, "next").id).toBe("next-bottom");
        expect(findPaginationLink(document, "previous").id).toBe("prev");
        document.getElementById("prev").remove();
        expect(findPaginationLink(document, "previous")).toBeNull();
    });

    it("falls back to symbols and aria labels", () => {
        document.body.innerHTML = `
            <a id="older" href="/older" aria-label="Older posts">&larr;</a>
            <a id="arrow" href="/p2">&raquo;</a>`;
        expect(findPaginationLink(document, "next").id).toBe("arrow");
        expect(findPaginationLink(document, "previous").id).toBe("older");
        document.body.innerHTML = `<a href="/x">Unrelated</a>`;
        expect(findPaginationLink(document, "next")).toBeNull();
    });

    // jsdom has no layout, so the scroll geometry the resolver reads has to be
    // stubbed the way a real engine would report it.
    function makeScroller(element, { axis = "y", extent = 500, position = 0, overflow = "auto" } = {}) {
        element.style[axis === "x" ? "overflowX" : "overflowY"] = overflow;
        const client = 100;
        Object.defineProperty(element, axis === "x" ? "clientWidth" : "clientHeight", { value: client, configurable: true });
        Object.defineProperty(element, axis === "x" ? "scrollWidth" : "scrollHeight", { value: client + extent, configurable: true });
        element[axis === "x" ? "scrollLeft" : "scrollTop"] = position;
        return element;
    }

    describe("findScrollTarget", () => {
        beforeEach(() => {
            document.elementFromPoint = () => null;
        });

        it("returns the nearest scrollable ancestor of the focused element", () => {
            document.body.innerHTML = `<div id="pane"><div id="inner"><input id="field"></div></div>`;
            const pane = makeScroller(document.getElementById("pane"));
            document.getElementById("field").focus();
            expect(findScrollTarget("y", 1, document, window)).toBe(pane);
        });

        it("falls back to the element under the viewport centre when nothing is focused", () => {
            document.body.innerHTML = `<div id="pane"><span id="text">hi</span></div>`;
            const pane = makeScroller(document.getElementById("pane"));
            document.elementFromPoint = () => document.getElementById("text");
            expect(findScrollTarget("y", 1, document, window)).toBe(pane);
        });

        it("falls back to the document when no ancestor scrolls", () => {
            document.body.innerHTML = `<div id="pane"><input id="field"></div>`;
            document.getElementById("field").focus();
            expect(findScrollTarget("y", 1, document, window)).toBe(null);
        });

        it("ignores an element that is overflowing but not scrollable", () => {
            document.body.innerHTML = `<div id="pane"><input id="field"></div>`;
            makeScroller(document.getElementById("pane"), { overflow: "hidden" });
            document.getElementById("field").focus();
            expect(findScrollTarget("y", 1, document, window)).toBe(null);
        });

        it("skips a scroller already pinned at the requested end", () => {
            document.body.innerHTML = `<div id="outer"><div id="pane"><input id="field"></div></div>`;
            const outer = makeScroller(document.getElementById("outer"), { position: 200 });
            makeScroller(document.getElementById("pane"), { position: 500 });
            document.getElementById("field").focus();
            expect(findScrollTarget("y", 1, document, window)).toBe(outer);
            expect(findScrollTarget("y", -1, document, window)).toBe(document.getElementById("pane"));
        });

        it("resolves each axis independently", () => {
            document.body.innerHTML = `<div id="pane"><input id="field"></div>`;
            const pane = makeScroller(document.getElementById("pane"), { axis: "x" });
            document.getElementById("field").focus();
            expect(findScrollTarget("x", 1, document, window)).toBe(pane);
            expect(findScrollTarget("y", 1, document, window)).toBe(null);
        });
    });
});
