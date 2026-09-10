const linkHints = require("../Vimkit Extension/js/link-hints.js");
const defaults = require("../Vimkit Extension/json/defaultSettings.json");

describe("link hint actions", () => {
    function addVisibleLink(url) {
        const link = document.createElement("a");
        link.href = url;
        link.textContent = "Example";
        link.getClientRects = () => [{ top: 12, left: 12, width: 80, height: 20 }];
        document.body.appendChild(link);
        document.elementFromPoint = jest.fn(() => link);
        return link;
    }

    function pressHintKey(key) {
        const event = {
            key,
            keyCode: key.toUpperCase().charCodeAt(0),
            preventDefault: jest.fn(),
            stopPropagation: jest.fn()
        };
        linkHints.onKeyDownInLinkHintsMode(event);
        return event;
    }

    beforeEach(() => {
        document.body.innerHTML = "";
        global.settings = JSON.parse(JSON.stringify(defaults));
        global.currentZoomLevel = 100;
        global.linkHintCss = {};
        global.addCssToPage = jest.fn();
        global.overlays = { showStatus: jest.fn() };
        global.clipboardController = { copy: jest.fn(() => Promise.resolve(true)) };
        global.extensionCommunicator = {
            requestOpenLinkInBackground: jest.fn(() => Promise.resolve({ ok: true }))
        };
        linkHints.deactivateLinkHintsMode();
    });

    afterEach(() => linkHints.deactivateLinkHintsMode());

    it("keeps queued hints open while opening each link in the background", () => {
        addVisibleLink("https://example.com/queued");
        linkHints.activateLinkHintsModeWithQueue();
        const event = pressHintKey(defaults.linkHintCharacters[0]);

        expect(extensionCommunicator.requestOpenLinkInBackground)
            .toHaveBeenCalledWith("https://example.com/queued");
        expect(document.querySelector("#vimiumHintMarkerContainer")).not.toBeNull();
        expect(event.preventDefault).toHaveBeenCalled();
    });

    it("copies a hinted URL and exits hint mode", () => {
        addVisibleLink("https://example.com/copied");
        linkHints.activateLinkHintsModeToCopyUrl();
        pressHintKey(defaults.linkHintCharacters[0]);

        expect(clipboardController.copy).toHaveBeenCalledWith("https://example.com/copied", "Link URL");
        expect(extensionCommunicator.requestOpenLinkInBackground).not.toHaveBeenCalled();
        expect(document.querySelector("#vimiumHintMarkerContainer")).toBeNull();
    });
});

describe("link hint generation and classification", () => {
    const linkHints = require("../Vimkit Extension/js/link-hints.js");

    beforeEach(() => {
        document.body.innerHTML = "";
        global.settings = { linkHintCharacters: "asdfjklqwerzxc", detectByCursorStyle: false };
        global.currentZoomLevel = 100;
        global.addCssToPage = jest.fn();
        global.overlays = { showStatus: jest.fn() };
        global.clipboardController = { copy: jest.fn(() => Promise.resolve(true)) };
    });

    afterEach(() => linkHints.deactivateLinkHintsMode());

    it("produces prefix-free, deterministic, shortest hints", () => {
        const alphabet = "asdfjklqwerzxc";
        const few = linkHints.generateHintStrings(3, alphabet);
        expect(few).toEqual(["a", "d", "s"]);

        const many = linkHints.generateHintStrings(20, alphabet);
        expect(many).toHaveLength(20);
        expect(new Set(many).size).toBe(20);
        expect(many.filter(hint => hint.length === 1)).toHaveLength(13);
        many.forEach(hint => many.forEach(other => {
            if (hint !== other) expect(other.startsWith(hint)).toBe(false);
        }));
        expect(linkHints.generateHintStrings(20, alphabet)).toEqual(many);
        expect(linkHints.generateHintStrings(200, alphabet).every(hint => hint.length <= 3)).toBe(true);
    });

    it("classifies links, controls and text inputs", () => {
        document.body.innerHTML = `
            <a id="link" href="https://example.com/">x</a>
            <a id="anchor">x</a>
            <button id="button">x</button>
            <input id="text" type="text">
            <input id="checkbox" type="checkbox">
            <input id="hidden" type="hidden">
            <div id="rolelink" role="link" href="/x">x</div>
            <textarea id="area"></textarea>
            <span id="plain">x</span>`;
        const kind = id => linkHints.clickableKind(document.getElementById(id));
        expect(kind("link")).toBe("link");
        expect(kind("anchor")).toBe("control");
        expect(kind("button")).toBe("control");
        expect(kind("text")).toBe("input");
        expect(kind("checkbox")).toBe("control");
        expect(kind("hidden")).toBeNull();
        expect(kind("rolelink")).toBe("link");
        expect(kind("area")).toBe("input");
        expect(kind("plain")).toBeNull();
    });

    it("marks hint markers with the element kind", () => {
        const button = document.createElement("button");
        button.textContent = "Go";
        button.getClientRects = () => [{ top: 12, left: 12, width: 80, height: 20 }];
        document.body.appendChild(button);
        document.elementFromPoint = jest.fn(() => button);
        linkHints.activateLinkHintsMode("open");
        expect(document.querySelector(".internalVimiumHintMarker.vimkitHint-control")).not.toBeNull();
    });

    it("selects a one-character hint immediately when hints are short", () => {
        const link = document.createElement("a");
        link.href = "https://example.com/only";
        link.textContent = "Only";
        link.getClientRects = () => [{ top: 12, left: 12, width: 80, height: 20 }];
        document.body.appendChild(link);
        document.elementFromPoint = jest.fn(() => link);
        linkHints.activateLinkHintsModeToCopyUrl();
        const marker = document.querySelector(".internalVimiumHintMarker");
        expect(marker.getAttribute("hintString")).toHaveLength(1);
        linkHints.onKeyDownInLinkHintsMode({
            key: "a", keyCode: 65, preventDefault: jest.fn(), stopPropagation: jest.fn()
        });
        expect(clipboardController.copy).toHaveBeenCalledWith("https://example.com/only", "Link URL");
    });

    it("copies link text and Markdown links", () => {
        const link = { href: "https://example.com/a(b)", textContent: "  Read [this]  " };
        expect(linkHints.linkHintCopyValue(link, "copyText")).toEqual({ text: "Read [this]", label: "Link text" });
        expect(linkHints.linkHintCopyValue(link, "copyMarkdown")).toEqual({
            text: "[Read \\[this\\]](https://example.com/a%28b%29)",
            label: "Markdown link"
        });
        expect(linkHints.linkHintCopyValue(link, "open")).toBeNull();
        expect(linkHints.linkHintCopyValue({ href: "https://e.com/", textContent: "" }, "copyText").text)
            .toBe("https://e.com/");
    });

    it("still accepts the legacy boolean signature", () => {
        expect(linkHints.LinkHintMode.openQueue).toBe("openQueue");
        const link = document.createElement("a");
        link.href = "https://example.com/legacy";
        link.textContent = "Legacy";
        link.getClientRects = () => [{ top: 12, left: 12, width: 80, height: 20 }];
        document.body.appendChild(link);
        document.elementFromPoint = jest.fn(() => link);
        linkHints.activateLinkHintsMode(false, false, true);
        linkHints.onKeyDownInLinkHintsMode({
            key: "a", keyCode: 65, preventDefault: jest.fn(), stopPropagation: jest.fn()
        });
        expect(clipboardController.copy).toHaveBeenCalledWith("https://example.com/legacy", "Link URL");
    });

    describe("filterLinkHints", () => {
        // Each link gets its own row so the occlusion check (elementFromPoint at
        // the rect's corner) resolves to the link being tested.
        let nextTop = 12;
        function addLink(text, url) {
            const link = document.createElement("a");
            link.href = url;
            link.textContent = text;
            const rect = { top: nextTop, left: 12, width: 80, height: 20 };
            nextTop += 30;
            // jsdom leaves borderTopLeftRadius empty, which makes the occlusion
            // offset NaN and hides everything; a real engine reports a length.
            link.style.borderTopLeftRadius = "0px";
            link.getClientRects = () => [rect];
            document.body.appendChild(link);
            return link;
        }

        function pressHintKey(key) {
            const event = {
                key,
                keyCode: key.toUpperCase().charCodeAt(0),
                preventDefault: jest.fn(),
                stopPropagation: jest.fn()
            };
            linkHints.onKeyDownInLinkHintsMode(event);
            return event;
        }

        function markers() {
            return Array.from(document.querySelectorAll("#vimiumHintMarkerContainer > div"));
        }

        function visibleMarkers() {
            return markers().filter(marker => marker.style.display !== "none");
        }

        beforeEach(() => {
            global.settings.filterLinkHints = true;
            nextTop = 12;
            document.elementFromPoint = (x, y) => Array.from(document.querySelectorAll("a")).find(link => {
                const rect = link.getClientRects()[0];
                return y >= rect.top && y <= rect.top + rect.height;
            }) || null;
        });

        it("numbers the hints instead of using hint characters", () => {
            addLink("Alpha", "https://example.com/a");
            addLink("Beta", "https://example.com/b");
            linkHints.activateLinkHintsMode();
            expect(markers().map(m => m.getAttribute("hintString"))).toEqual(["1", "2"]);
        });

        it("narrows the set by typed link text and renumbers the survivors", () => {
            addLink("Alpha", "https://example.com/a");
            addLink("Beta", "https://example.com/b");
            addLink("Alphabet", "https://example.com/c");
            linkHints.activateLinkHintsMode();

            pressHintKey("a"); pressHintKey("l");
            const shown = visibleMarkers();
            expect(shown).toHaveLength(2);
            expect(shown.map(m => m.getAttribute("hintString"))).toEqual(["1", "2"]);
        });

        it("matches aria-label and title as well as visible text", () => {
            const icon = addLink("", "https://example.com/settings");
            icon.setAttribute("aria-label", "Settings");
            addLink("Home", "https://example.com/");
            linkHints.activateLinkHintsMode();

            pressHintKey("s"); pressHintKey("e");
            expect(visibleMarkers()).toHaveLength(1);
            expect(visibleMarkers()[0].clickableItem).toBe(icon);
        });

        it("keeps the mode open on an over-narrow filter so backspace recovers", () => {
            addLink("Alpha", "https://example.com/a");
            linkHints.activateLinkHintsMode();

            pressHintKey("z");
            expect(global.linkHintsModeActivated).toBe(true);
            expect(visibleMarkers()).toHaveLength(0);

            linkHints.onKeyDownInLinkHintsMode({
                key: "Backspace", keyCode: 8, preventDefault: jest.fn(), stopPropagation: jest.fn()
            });
            expect(visibleMarkers()).toHaveLength(1);
        });

        it("selects a filtered link by its digit hint", () => {
            addLink("Alpha", "https://example.com/a");
            const beta = addLink("Beta", "https://example.com/b");
            const focused = jest.spyOn(beta, "focus");
            linkHints.activateLinkHintsMode();

            pressHintKey("b"); pressHintKey("e");
            pressHintKey("1");
            expect(focused).toHaveBeenCalled();
            expect(global.linkHintsModeActivated).toBe(false);
        });

        it("still uses hint characters when the setting is off", () => {
            global.settings.filterLinkHints = false;
            addLink("Alpha", "https://example.com/a");
            addLink("Beta", "https://example.com/b");
            linkHints.activateLinkHintsMode();
            expect(markers().every(m => /^[asdfjklqwerzxc]+$/.test(m.getAttribute("hintString")))).toBe(true);
        });
    });
});
