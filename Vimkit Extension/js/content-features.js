var VimkitContentFeatures = (function () {
    "use strict";

    var HOST_ATTRIBUTE = "data-vimkit-overlay";
    var BASE_STYLE = `
        :host { all: initial; color-scheme: light dark; }
        *, *::before, *::after { box-sizing: border-box; }
        .panel { background: Canvas; color: CanvasText; border: 1px solid color-mix(in srgb, CanvasText 25%, transparent); border-radius: 8px; box-shadow: 0 10px 35px rgba(0,0,0,.28); font: 13px -apple-system, BlinkMacSystemFont, sans-serif; }
        input { background: Field; color: FieldText; border: 1px solid color-mix(in srgb, CanvasText 30%, transparent); border-radius: 5px; font: inherit; padding: 7px 9px; }
        button { font: inherit; }
        .muted { color: GrayText; }
    `;

    function createHost(documentObject, id) {
        var previous = documentObject.querySelector(`[${HOST_ATTRIBUTE}="${id}"]`);
        if (previous) previous.remove();
        var host = documentObject.createElement("div");
        host.setAttribute(HOST_ATTRIBUTE, id);
        host.style.setProperty("all", "initial", "important");
        host.style.setProperty("position", "fixed", "important");
        host.style.setProperty("z-index", "2147483647", "important");
        (documentObject.documentElement || documentObject.body).appendChild(host);
        return { host: host, root: host.attachShadow({ mode: "open" }) };
    }

    function removeHost(host) {
        if (host && host.remove) host.remove();
    }

    function isExcludedTextNode(node) {
        var parent = node && node.parentElement;
        if (!parent || !node.nodeValue || !node.nodeValue.trim()) return true;
        if (parent.closest(`[${HOST_ATTRIBUTE}]`)) return true;
        if (parent.closest("script, style, noscript, template, textarea, input, select, option")) return true;
        return parent.isContentEditable;
    }

    function isVisibleTextNode(node, windowObject) {
        if (isExcludedTextNode(node)) return false;
        var element = node.parentElement;
        var style = windowObject.getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return false;
        return element.getClientRects().length > 0;
    }

    function visibleTextMatches(documentObject, windowObject, query) {
        var normalized = String(query || "").toLocaleLowerCase();
        if (!normalized) return [];
        var matches = [];
        var walker = documentObject.createTreeWalker(
            documentObject.body || documentObject.documentElement,
            windowObject.NodeFilter.SHOW_TEXT
        );
        var node;
        while ((node = walker.nextNode())) {
            if (!isVisibleTextNode(node, windowObject)) continue;
            var text = node.nodeValue.toLocaleLowerCase();
            var offset = 0;
            while ((offset = text.indexOf(normalized, offset)) >= 0) {
                matches.push({ node: node, start: offset, end: offset + normalized.length });
                offset += Math.max(1, normalized.length);
            }
        }
        return matches;
    }

    function parentUrl(value, toOrigin) {
        var url = new URL(value);
        if (toOrigin) return url.origin + "/";
        var path = url.pathname.replace(/\/$/, "");
        var slash = path.lastIndexOf("/");
        url.pathname = slash <= 0 ? "/" : path.slice(0, slash + 1);
        url.search = "";
        url.hash = "";
        return url.href;
    }

    var PAGINATION_PATTERNS = {
        next: ["next", "more", "newer", "\u203a", "\u2192", "\u00bb", "\u226b", ">>", ">"],
        previous: ["prev", "previous", "back", "older", "\u2039", "\u2190", "\u00ab", "\u226a", "<<", "<"]
    };

    function paginationText(element) {
        var text = [element.textContent, element.getAttribute("aria-label"), element.getAttribute("title")]
            .filter(Boolean)
            .join(" ");
        return text.toLowerCase().replace(/\s+/g, " ").trim();
    }

    function paginationScore(text, pattern) {
        if (!text) return 0;
        var stripped = text.replace(/^[\s\-\u2013\u2014.,;:!()\[\]{}|]+|[\s\-\u2013\u2014.,;:!()\[\]{}|]+$/g, "");
        if (stripped === pattern) return 3;
        if (/^[a-z]/.test(pattern)) {
            // A word only counts at the start or end of the text ("Next page", "Go back"),
            // never in the middle of a sentence, which would match ordinary headlines.
            var boundary = "[\\s.,;:!\\-\\u2013\\u2014()\\[\\]|/]";
            var starts = new RegExp("^" + pattern + "(?=" + boundary + "|$)");
            var ends = new RegExp("(^|" + boundary + ")" + pattern + "$");
            return starts.test(stripped) || ends.test(stripped) ? 2 : 0;
        }
        return stripped.indexOf(pattern) >= 0 && stripped.length <= pattern.length + 12 ? 2 : 0;
    }

    /*
     * Finds the link that most likely leads to the next or previous page.
     * rel="next"/"prev" wins outright; otherwise the anchor text is scored
     * against a fixed pattern list, earliest pattern first.
     */
    function findPaginationLink(documentObject, direction) {
        var rel = direction === "next" ? "next" : "prev";
        var relSelector = 'link[rel~="' + rel + '"], a[rel~="' + rel + '"]' +
            (rel === "prev" ? ', link[rel~="previous"], a[rel~="previous"]' : "");
        var relMatch = documentObject.querySelector(relSelector);
        if (relMatch && relMatch.href) return relMatch;

        var anchors = Array.prototype.slice.call(documentObject.querySelectorAll("a[href], [role=link][href]"))
            .filter(function (anchor) {
                var href = anchor.getAttribute("href") || "";
                return href && !/^(#|javascript:)/i.test(href);
            });
        // Next links tend to sit at the bottom of the page, previous links at the top.
        if (direction === "next") anchors.reverse();
        var patterns = PAGINATION_PATTERNS[direction === "next" ? "next" : "previous"];
        for (var i = 0; i < patterns.length; i++) {
            var best = null;
            var bestScore = 0;
            for (var j = 0; j < anchors.length; j++) {
                var score = paginationScore(paginationText(anchors[j]), patterns[i]);
                if (score > bestScore) {
                    best = anchors[j];
                    bestScore = score;
                }
            }
            if (best) return best;
        }
        return null;
    }

    function OverlayManager(documentObject, windowObject) {
        this.document = documentObject;
        this.window = windowObject;
        this.statusHost = null;
        this.modalHost = null;
        this.statusTimer = null;
    }

    OverlayManager.prototype.showStatus = function (message, kind, duration) {
        this.clearStatus();
        var overlay = createHost(this.document, "status");
        this.statusHost = overlay.host;
        overlay.host.style.setProperty("left", "50%", "important");
        overlay.host.style.setProperty("bottom", "18px", "important");
        overlay.host.style.setProperty("transform", "translateX(-50%)", "important");
        overlay.root.innerHTML = `<style>${BASE_STYLE}.status{padding:8px 12px;max-width:520px}.error{border-color:#c33;color:#c33}</style><div class="panel status ${kind === "error" ? "error" : ""}" role="status" aria-live="polite"></div>`;
        overlay.root.querySelector("div").textContent = message;
        var self = this;
        this.statusTimer = this.window.setTimeout(function () { self.clearStatus(); }, duration == null ? 2200 : duration);
    };

    OverlayManager.prototype.clearStatus = function () {
        if (this.statusTimer != null) this.window.clearTimeout(this.statusTimer);
        this.statusTimer = null;
        removeHost(this.statusHost);
        this.statusHost = null;
    };

    OverlayManager.prototype.closeModal = function () {
        removeHost(this.modalHost);
        this.modalHost = null;
    };

    OverlayManager.prototype.showHelp = function (commands) {
        this.closeModal();
        var overlay = createHost(this.document, "help");
        this.modalHost = overlay.host;
        overlay.host.style.setProperty("inset", "0", "important");
        var rows = commands.map(function (command) {
            var keys = command.bindings.map(function () { return "<kbd></kbd>"; }).join("");
            return `<tr><td class="keys">${keys}</td><td></td></tr>`;
        }).join("");
        overlay.root.innerHTML = `<style>${BASE_STYLE}
            .backdrop{position:fixed;inset:0;background:rgba(0,0,0,.42);display:grid;place-items:center;padding:24px}
            .help{width:min(720px,92vw);max-height:82vh;overflow:auto;padding:20px}
            header{display:flex;justify-content:space-between;align-items:center;position:sticky;top:-20px;background:Canvas;padding:4px 0 12px}
            h2{font-size:19px;margin:0}button{border:0;background:transparent;color:inherit;font-size:22px;cursor:pointer}
            table{border-collapse:collapse;width:100%}td{padding:7px 4px;border-top:1px solid color-mix(in srgb,CanvasText 12%,transparent)}td:first-child{width:38%}
            kbd{background:color-mix(in srgb,CanvasText 10%,Canvas);border-radius:4px;padding:3px 6px;white-space:nowrap}
            .keys kbd{display:inline-block;margin:0 6px 4px 0}
        </style><div class="backdrop"><section class="panel help" role="dialog" aria-modal="true" aria-labelledby="vimkit-help-title"><header><h2 id="vimkit-help-title">Vimkit shortcuts</h2><button aria-label="Close help">×</button></header><table><tbody>${rows}</tbody></table></section></div>`;
        var cells = overlay.root.querySelectorAll("tr");
        commands.forEach(function (command, index) {
            var keys = cells[index].children[0].querySelectorAll("kbd");
            command.bindings.forEach(function (binding, position) {
                keys[position].textContent = binding;
            });
            cells[index].children[1].textContent = command.description;
        });
        var self = this;
        overlay.root.querySelector("button").addEventListener("click", function () { self.closeModal(); });
        overlay.root.querySelector(".backdrop").addEventListener("click", function (event) {
            if (event.target.classList.contains("backdrop")) self.closeModal();
        });
        overlay.root.addEventListener("keydown", function (event) {
            if (event.key === "Escape") self.closeModal();
        });
        overlay.root.querySelector("button").focus();
    };

    var HIGHLIGHT_MATCHES = "vimkit-find-match";
    var HIGHLIGHT_CURRENT = "vimkit-find-current";

    function highlightRegistry(windowObject) {
        var css = windowObject.CSS;
        if (!css || !css.highlights || typeof windowObject.Highlight !== "function") return null;
        return css.highlights;
    }

    function FindMode(documentObject, windowObject, overlays) {
        this.document = documentObject;
        this.window = windowObject;
        this.overlays = overlays;
        this.host = null;
        this.input = null;
        this.count = null;
        this.query = "";
        this.matches = [];
        this.index = -1;
    }

    FindMode.prototype.isOpen = function () { return Boolean(this.host); };

    FindMode.prototype.open = function () {
        this.close(false);
        var overlay = createHost(this.document, "find");
        this.host = overlay.host;
        overlay.host.style.setProperty("right", "18px", "important");
        overlay.host.style.setProperty("top", "18px", "important");
        overlay.root.innerHTML = `<style>${BASE_STYLE}.find{display:flex;gap:8px;align-items:center;padding:8px}input{width:min(340px,65vw)}.count{min-width:72px;text-align:right}</style><form class="panel find" role="search"><input type="search" aria-label="Find on page" autocomplete="off" placeholder="Find on page"><span class="count muted" aria-live="polite">Type to find</span></form>`;
        this.input = overlay.root.querySelector("input");
        this.count = overlay.root.querySelector(".count");
        var self = this;
        this.input.addEventListener("input", function () { self.update(self.input.value); });
        overlay.root.querySelector("form").addEventListener("submit", function (event) {
            event.preventDefault();
            self.move(event.shiftKey ? -1 : 1);
        });
        this.input.addEventListener("keydown", function (event) {
            if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                self.close();
            } else if (event.key === "Enter") {
                event.preventDefault();
                event.stopPropagation();
                self.move(event.shiftKey ? -1 : 1);
            }
        });
        if (this.query) {
            this.input.value = this.query;
            this.update(this.query);
        }
        this.input.focus();
    };

    FindMode.prototype.refresh = function () {
        this.matches = visibleTextMatches(this.document, this.window, this.query);
        if (this.matches.length === 0) this.index = -1;
        else if (this.index >= this.matches.length) this.index = 0;
    };

    FindMode.prototype.updateCount = function () {
        if (!this.count) return;
        this.count.textContent = this.query
            ? (this.matches.length ? `${this.index + 1} / ${this.matches.length}` : "No matches")
            : "Type to find";
        this.count.classList.toggle("muted", this.matches.length > 0 || !this.query);
    };

    FindMode.prototype.rangeFor = function (match) {
        var range = this.document.createRange();
        range.setStart(match.node, match.start);
        range.setEnd(match.node, match.end);
        return range;
    };

    // Moving the selection while the find field has focus makes the browser
    // send the following keystrokes to the page instead of the field, so an
    // open bar shows matches with CSS highlights and only hands the current
    // match to the selection when it closes.
    FindMode.prototype.paintHighlights = function () {
        var registry = highlightRegistry(this.window);
        if (!registry) return;
        this.clearHighlights();
        if (!this.isOpen() || this.index < 0) return;
        var self = this;
        var others = new this.window.Highlight();
        this.matches.forEach(function (match, index) {
            if (index !== self.index) others.add(self.rangeFor(match));
        });
        registry.set(HIGHLIGHT_MATCHES, others);
        registry.set(HIGHLIGHT_CURRENT, new this.window.Highlight(this.rangeFor(this.matches[this.index])));
    };

    FindMode.prototype.clearHighlights = function () {
        var registry = highlightRegistry(this.window);
        if (!registry) return;
        registry.delete(HIGHLIGHT_MATCHES);
        registry.delete(HIGHLIGHT_CURRENT);
    };

    FindMode.prototype.selectMatch = function (match) {
        var selection = this.window.getSelection();
        selection.removeAllRanges();
        selection.addRange(this.rangeFor(match));
    };

    FindMode.prototype.selectCurrent = function () {
        var match = this.index >= 0 ? this.matches[this.index] : null;
        if (!match) {
            this.clearHighlights();
            this.updateCount();
            return false;
        }
        if (this.isOpen()) this.paintHighlights();
        else this.selectMatch(match);
        if (match.node.parentElement && match.node.parentElement.scrollIntoView) {
            match.node.parentElement.scrollIntoView({ block: "center", behavior: "smooth" });
        }
        this.updateCount();
        return true;
    };

    FindMode.prototype.update = function (query) {
        this.query = query;
        this.index = -1;
        this.refresh();
        if (this.matches.length) this.index = 0;
        this.selectCurrent();
    };

    FindMode.prototype.move = function (direction) {
        if (!this.query) return false;
        this.refresh();
        if (!this.matches.length) {
            this.updateCount();
            return false;
        }
        if (this.index < 0) this.index = direction < 0 ? this.matches.length - 1 : 0;
        else this.index = (this.index + direction + this.matches.length) % this.matches.length;
        return this.selectCurrent();
    };

    FindMode.prototype.close = function (restoreFocus) {
        var wasOpen = this.isOpen();
        if (restoreFocus !== false && this.input) this.input.blur();
        removeHost(this.host);
        this.host = null;
        this.input = null;
        this.count = null;
        this.clearHighlights();
        if (!wasOpen || this.index < 0) return;
        // The current match becomes the selection so n and N continue from it.
        this.refresh();
        if (this.index >= 0 && this.matches[this.index]) this.selectMatch(this.matches[this.index]);
    };

    function ClipboardController(documentObject, navigatorObject, overlays) {
        this.document = documentObject;
        this.navigator = navigatorObject;
        this.overlays = overlays;
    }

    ClipboardController.prototype.fallbackCopy = function (text) {
        var textarea = this.document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        this.document.body.appendChild(textarea);
        textarea.select();
        var copied = false;
        try {
            copied = typeof this.document.execCommand === "function" && this.document.execCommand("copy");
        } finally {
            textarea.remove();
        }
        return copied;
    };

    ClipboardController.prototype.copy = async function (text, label) {
        var copied = false;
        try {
            if (this.navigator.clipboard && typeof this.navigator.clipboard.writeText === "function") {
                await this.navigator.clipboard.writeText(text);
                copied = true;
            }
        } catch (_error) {
            copied = false;
        }
        if (!copied) copied = this.fallbackCopy(text);
        this.overlays.showStatus(copied ? `${label || "Value"} copied` : "Vimkit could not access the clipboard.", copied ? "success" : "error");
        return copied;
    };

    function TabPicker(documentObject, overlays) {
        this.document = documentObject;
        this.overlays = overlays;
        this.host = null;
    }

    TabPicker.prototype.open = function (tabs, onSelect) {
        this.close();
        var overlay = createHost(this.document, "tabs");
        this.host = overlay.host;
        this.overlays.modalHost = overlay.host;
        overlay.host.style.setProperty("inset", "0", "important");
        overlay.root.innerHTML = `<style>${BASE_STYLE}
            .backdrop{position:fixed;inset:0;background:rgba(0,0,0,.38);display:flex;justify-content:center;align-items:flex-start;padding-top:12vh}
            .picker{width:min(760px,92vw);padding:12px}input{width:100%;font-size:15px}.results{list-style:none;margin:8px 0 0;padding:0;max-height:55vh;overflow:auto}
            button.tab{background:transparent;color:inherit;border:0;border-radius:5px;display:block;padding:8px;text-align:left;width:100%;cursor:pointer}
            button.tab[aria-selected="true"]{background:Highlight;color:HighlightText}.title,.url{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.url{font-size:11px;opacity:.72;margin-top:2px}
        </style><div class="backdrop"><section class="panel picker" role="dialog" aria-modal="true" aria-label="Search tabs"><input type="search" placeholder="Search tabs by title or URL" aria-label="Search tabs"><ul class="results" role="listbox"></ul></section></div>`;
        var input = overlay.root.querySelector("input");
        var list = overlay.root.querySelector(".results");
        var filtered = tabs.slice();
        var selected = 0;
        var self = this;

        function render() {
            list.textContent = "";
            filtered.forEach(function (tab, index) {
                var item = self.document.createElement("li");
                var button = self.document.createElement("button");
                button.type = "button";
                button.className = "tab";
                button.setAttribute("role", "option");
                button.setAttribute("aria-selected", index === selected ? "true" : "false");
                var title = self.document.createElement("span");
                title.className = "title";
                title.textContent = tab.title || tab.url || "Untitled tab";
                var url = self.document.createElement("span");
                url.className = "url";
                url.textContent = tab.url || "";
                button.append(title, url);
                button.addEventListener("click", function () { self.close(); onSelect(tab); });
                item.appendChild(button);
                list.appendChild(item);
            });
        }

        input.addEventListener("input", function () {
            var query = input.value.toLocaleLowerCase();
            filtered = tabs.filter(function (tab) {
                return `${tab.title || ""} ${tab.url || ""}`.toLocaleLowerCase().includes(query);
            });
            selected = 0;
            render();
        });
        input.addEventListener("keydown", function (event) {
            if (event.key === "Escape") {
                event.preventDefault(); self.close();
            } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                if (filtered.length) selected = (selected + (event.key === "ArrowDown" ? 1 : -1) + filtered.length) % filtered.length;
                render();
            } else if (event.key === "Enter" && filtered[selected]) {
                event.preventDefault();
                var tab = filtered[selected];
                self.close(); onSelect(tab);
            }
        });
        render();
        input.focus();
    };

    TabPicker.prototype.close = function () {
        removeHost(this.host);
        if (this.overlays.modalHost === this.host) this.overlays.modalHost = null;
        this.host = null;
    };

    return {
        ClipboardController: ClipboardController,
        FindMode: FindMode,
        OverlayManager: OverlayManager,
        findPaginationLink: findPaginationLink,
        TabPicker: TabPicker,
        isExcludedTextNode: isExcludedTextNode,
        isVisibleTextNode: isVisibleTextNode,
        parentUrl: parentUrl,
        visibleTextMatches: visibleTextMatches
    };
})();

if (typeof module !== "undefined") {
    module.exports = VimkitContentFeatures;
    global.VimkitContentFeatures = VimkitContentFeatures;
}
