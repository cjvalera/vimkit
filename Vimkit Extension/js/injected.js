/* Vimkit's top-frame command runtime. */
var topWindow = (window.top === window),
    settings = {},
    currentZoomLevel = 100,
    linkHintCss = {},
    extensionActive = true,
    insertMode = false,
    shiftKeyToggle = false,
    hudDuration = 5000,
    sitePropagationHandler = null,
    commandDispatcher = null,
    excludedSingleKeyTokens = new Set(),
    extensionCommunicator = WebExtensionCommunicator(),
    overlays = new VimkitContentFeatures.OverlayManager(document, window),
    findMode = new VimkitContentFeatures.FindMode(document, window, overlays),
    clipboardController = new VimkitContentFeatures.ClipboardController(document, navigator, overlays),
    tabPicker = new VimkitContentFeatures.TabPicker(document, overlays);

var commandDescriptions = {
    hintToggle: "Open a link in the current tab",
    newTabHintToggle: "Open a link in a background tab",
    multiLinkHintToggle: "Open multiple links in background tabs",
    copyLinkUrl: "Copy a link URL",
    copyLinkText: "Copy a link's text",
    copyLinkMarkdown: "Copy a link as Markdown",
    scrollUp: "Scroll up",
    scrollDown: "Scroll down",
    scrollLeft: "Scroll left",
    scrollRight: "Scroll right",
    scrollUpHalfPage: "Scroll up half a page",
    scrollDownHalfPage: "Scroll down half a page",
    goToPageTop: "Go to the top of the page",
    goToPageBottom: "Go to the bottom of the page",
    goToFirstInput: "Focus the first text input",
    enterFindMode: "Find text on the page",
    findNext: "Select the next find match",
    findPrevious: "Select the previous find match",
    copyCurrentUrl: "Copy the current URL",
    goUpUrl: "Go up one URL level",
    goRootUrl: "Go to the site origin",
    goBack: "Go back in history",
    goForward: "Go forward in history",
    nextPage: "Follow the next-page link",
    previousPage: "Follow the previous-page link",
    reload: "Reload the page",
    hardReload: "Reload the page, bypassing the cache",
    tabForward: "Go to the next tab",
    tabBack: "Go to the previous tab",
    firstTab: "Go to the first tab",
    lastTab: "Go to the last tab",
    previousActiveTab: "Return to the previously active tab",
    moveTabLeft: "Move the current tab left",
    moveTabRight: "Move the current tab right",
    searchTabs: "Search open tabs",
    closeTab: "Close the current tab",
    restoreTab: "Restore the last closed tab",
    openTab: "Open a new tab",
    duplicateTab: "Duplicate the current tab",
    showHelp: "Show this shortcut reference",
    enterInsertMode: "Enter insert mode"
};

function reportRequest(request) {
    return Promise.resolve(request).then(function (response) {
        if (response && !response.ok) overlays.showStatus(response.error || "The browser could not perform that action.", "error");
        return response;
    });
}

function scrollTargetFor(axis, delta) {
    return VimkitContentFeatures.findScrollTarget(axis, delta, document, window);
}

function scrollByCount(x, y, meta) {
    var axis = x ? "x" : "y";
    customScrollBy(x * meta.count, y * meta.count, scrollTargetFor(axis, x || y));
}

// Half a page means half of whatever is actually scrolling, not half the window.
function scrollHalfPage(sign, meta) {
    var target = scrollTargetFor("y", sign);
    var height = target ? target.clientHeight : window.innerHeight;
    customScrollBy(0, sign * (height / 2) * meta.count, target);
}

function scrollToEnd(sign) {
    var target = scrollTargetFor("y", sign);
    var distance = target ? target.scrollHeight : document.body.scrollHeight;
    customScrollBy(0, sign * distance, target);
}

function navigateUpUrl(toOrigin) {
    window.location.assign(VimkitContentFeatures.parentUrl(window.location.href, toOrigin));
}

function followPaginationLink(direction) {
    var link = VimkitContentFeatures.findPaginationLink(document, direction);
    if (!link) {
        overlays.showStatus("No " + (direction === "next" ? "next" : "previous") + " page link was found.", "error");
        return;
    }
    if (typeof link.click === "function" && link.tagName.toLowerCase() !== "link") link.click();
    else window.location.assign(link.href);
}

function hardReload() {
    reportRequest(extensionCommunicator.requestReloadTab(true)).then(function (response) {
        // Older engines without tabs.reload still get a plain reload.
        if (!response || !response.ok) window.location.reload();
    });
}

function effectiveBindingsFor(actionName, excludedKeys) {
    var excluded = excludedKeys || excludedKeysFor(settings, document.URL);
    var configured = settings.bindings && settings.bindings[actionName];
    var bindings = Array.isArray(configured) ? configured.slice() : [configured];
    var aliases = actionName === "tabForward" ? ["gt"] : actionName === "tabBack" ? ["g shift+t"] : [];
    aliases.forEach(function (alias) {
        var normalizedAlias = VimkitCommandDispatcher.normalizeBinding(alias).join(" ");
        if (!bindings.some(function (binding) {
            return VimkitCommandDispatcher.normalizeBinding(binding).join(" ") === normalizedAlias;
        })) bindings.push(alias);
    });
    return bindings.filter(function (binding) {
        if (typeof binding !== "string" || !binding.trim()) return false;
        return !excluded.has(VimkitCommandDispatcher.normalizeBinding(binding).join(" "));
    });
}

function showHelp() {
    var commands = Object.keys(commandDescriptions).map(function (actionName) {
        return {
            bindings: effectiveBindingsFor(actionName).map(VimkitCommandDispatcher.formatBinding).filter(Boolean),
            description: commandDescriptions[actionName]
        };
    }).filter(function (command) { return command.bindings.length > 0; });
    overlays.showHelp(commands);
}

function searchTabs() {
    reportRequest(extensionCommunicator.requestTabs()).then(function (response) {
        if (!response || !response.ok) return;
        tabPicker.open(response.tabs || [], function (tab) {
            reportRequest(extensionCommunicator.requestActivateTab(tab.id));
        });
    });
}

var actionMap = {
    hintToggle: function () { activateLinkHintsMode(LinkHintMode.open); },
    newTabHintToggle: function () { activateLinkHintsMode(LinkHintMode.openNewTab); },
    multiLinkHintToggle: function () { activateLinkHintsMode(LinkHintMode.openQueue); },
    copyLinkUrl: function () { activateLinkHintsMode(LinkHintMode.copyUrl); },
    copyLinkText: function () { activateLinkHintsMode(LinkHintMode.copyText); },
    copyLinkMarkdown: function () { activateLinkHintsMode(LinkHintMode.copyMarkdown); },
    tabForward: function (meta) {
        if (meta.binding.endsWith("g t") && meta.countProvided) reportRequest(extensionCommunicator.requestTabIndex(meta.count - 1));
        else reportRequest(extensionCommunicator.requestTabForward(meta.count));
    },
    tabBack: function (meta) { reportRequest(extensionCommunicator.requestTabBackward(meta.count)); },
    firstTab: function () { reportRequest(extensionCommunicator.requestFirstTab()); },
    lastTab: function () { reportRequest(extensionCommunicator.requestLastTab()); },
    previousActiveTab: function () { reportRequest(extensionCommunicator.requestPreviousActiveTab()); },
    moveTabLeft: function (meta) { reportRequest(extensionCommunicator.requestMoveTab(-meta.count)); },
    moveTabRight: function (meta) { reportRequest(extensionCommunicator.requestMoveTab(meta.count)); },
    searchTabs: searchTabs,
    restoreTab: function () { reportRequest(extensionCommunicator.requestRestoreTab()); },
    scrollDown: function (meta) { scrollByCount(0, settings.scrollSize, meta); },
    scrollUp: function (meta) { scrollByCount(0, -settings.scrollSize, meta); },
    scrollLeft: function (meta) { scrollByCount(-settings.scrollSize, 0, meta); },
    scrollRight: function (meta) { scrollByCount(settings.scrollSize, 0, meta); },
    goBack: function (meta) { window.history.go(-meta.count); },
    goForward: function (meta) { window.history.go(meta.count); },
    reload: function () { window.location.reload(); },
    hardReload: hardReload,
    nextPage: function () { followPaginationLink("next"); },
    previousPage: function () { followPaginationLink("previous"); },
    openTab: function () { reportRequest(extensionCommunicator.requestCreateTab(settings.openTabUrl)); },
    closeTab: function () { reportRequest(extensionCommunicator.requestCloseTab()); },
    duplicateTab: function () { reportRequest(extensionCommunicator.requestDuplicateTab()); },
    scrollDownHalfPage: function (meta) { scrollHalfPage(1, meta); },
    scrollUpHalfPage: function (meta) { scrollHalfPage(-1, meta); },
    goToPageBottom: function () { scrollToEnd(1); },
    goToPageTop: function () { scrollToEnd(-1); },
    goToFirstInput: goToFirstInput,
    enterFindMode: function () { findMode.open(); },
    findNext: function () { findMode.move(1); },
    findPrevious: function () { findMode.move(-1); },
    copyCurrentUrl: function () { clipboardController.copy(window.location.href, "URL"); },
    goUpUrl: function () { navigateUpUrl(false); },
    goRootUrl: function () { navigateUpUrl(true); },
    showHelp: showHelp,
    enterInsertMode: function () { enterInsertMode(); }
};

function goToFirstInput() {
    var inputs = document.querySelectorAll("input,textarea,[contenteditable=true]");
    var bestInput = null;
    var bestInViewInput = null;
    inputs.forEach(function (input) {
        if (input.offsetParent === null || input.disabled || input.getAttribute("type") === "hidden" ||
            getComputedStyle(input).visibility === "hidden" || getComputedStyle(input).display === "none" ||
            /button|radio|file|image|checkbox|submit/i.test(input.getAttribute("type") || "")) return;
        var rect = input.getClientRects()[0];
        if (!rect) return;
        var inView = rect.top >= -rect.height && rect.top <= window.innerHeight &&
            rect.left >= -rect.width && rect.left <= window.innerWidth;
        if (!bestInput) bestInput = input;
        if (inView && !bestInViewInput) bestInViewInput = input;
    });
    var inputToFocus = bestInViewInput || bestInput;
    if (inputToFocus) inputToFocus.focus();
}

function bindKeyCodesToActions(nextSettings) {
    if (commandDispatcher) commandDispatcher.reset();
    commandDispatcher = new VimkitCommandDispatcher.CommandDispatcher({
        timeout: 1000,
        onPending: function (pending) {
            if (pending) overlays.showStatus(pending, "pending", 1100);
            else overlays.clearStatus();
        }
    });
    if (!topWindow) return;
    var excludedKeys = excludedKeysFor(nextSettings, document.URL);
    // Kept for onDocumentKeyDown: with transparentBindings off, every unhandled
    // key is stopped, which would swallow an excluded key instead of handing it
    // to the site. Only single-key exclusions can be recognised here — the first
    // key of a sequence stays bound to the other sequences that start with it.
    excludedSingleKeyTokens = new Set();
    excludedKeys.forEach(function (binding) {
        var tokens = VimkitCommandDispatcher.applyGlobalModifier(binding, nextSettings.modifier);
        if (tokens.length === 1) excludedSingleKeyTokens.add(tokens[0]);
    });
    Object.keys(actionMap).forEach(function (actionName) {
        commandDispatcher.register(actionName, effectiveBindingsFor(actionName, excludedKeys), executeAction(actionName), nextSettings.modifier);
    });
}

function enterNormalMode() {
    if (document.activeElement && typeof document.activeElement.blur === "function") document.activeElement.blur();
    deactivateLinkHintsMode();
    findMode.close();
    tabPicker.close();
    overlays.closeModal();
    if (commandDispatcher) commandDispatcher.reset();
    var wasInsertMode = insertMode;
    insertMode = false;
    if (wasInsertMode) overlays.showStatus("Normal mode");
}

function enterInsertMode() {
    if (insertMode) return;
    insertMode = true;
    if (commandDispatcher) commandDispatcher.reset();
    overlays.showStatus("Insert mode");
}

function executeAction(actionName) {
    return function (meta) {
        if (linkHintsModeActivated || !extensionActive || insertMode) return;
        actionMap[actionName](meta || { count: 1, countProvided: false, binding: "" });
    };
}

function isEditable(target) {
    if (!target || !target.tagName) return false;
    if (target.getAttribute("contentEditable") === "true" || target.isContentEditable) return true;
    return ["input", "textarea", "select", "button"].indexOf(target.tagName.toLowerCase()) >= 0;
}

function eventTargetsEditable(event) {
    var path = typeof event.composedPath === "function" ? event.composedPath() : [event.target];
    return path.some(isEditable);
}

// Ctrl-[ only stands in for Escape while no shortcut is bound to it, so the
// dispatcher decides once the bindings are known.
function isEscapeToken(token) {
    if (commandDispatcher) return commandDispatcher.isEscape(token);
    return token === "esc" || token === "ctrl+[";
}

function onDocumentKeyDown(event) {
    var token = VimkitCommandDispatcher.eventToToken(event);
    if (isEscapeToken(token)) {
        enterNormalMode();
        event.preventDefault();
        event.stopPropagation();
        return;
    }
    if (!extensionActive || insertMode || linkHintsModeActivated || findMode.isOpen() || overlays.modalHost) return;
    if (eventTargetsEditable(event) && !settings.modifier) return;
    var handled = commandDispatcher && commandDispatcher.handleEvent(event);
    if (handled) {
        event.preventDefault();
        event.stopPropagation();
    } else if (settings.transparentBindings === false && !eventTargetsEditable(event) &&
               !excludedSingleKeyTokens.has(token)) {
        event.stopPropagation();
    }
}

function unbindKeyCodes() {
    if (commandDispatcher) commandDispatcher.reset();
    commandDispatcher = null;
    excludedSingleKeyTokens = new Set();
    if (sitePropagationHandler) document.removeEventListener("keydown", sitePropagationHandler, true);
    sitePropagationHandler = null;
}

function boundKeys() {
    var keys = [];
    Object.keys(commandDescriptions).forEach(function (action) {
        effectiveBindingsFor(action).forEach(function (binding) {
            keys = keys.concat(VimkitCommandDispatcher.normalizeBinding(binding));
        });
    });
    return new Set(keys);
}

function stopSitePropagation(event) {
    onDocumentKeyDown(event);
}

function isActiveElementEditable() {
    return isEditable(document.activeElement);
}

function getKeyCode(actionName) {
    if (!settings || !settings.bindings) return "";
    var binding = settings.bindings[actionName];
    function addModifier(value) { return settings.modifier ? `${settings.modifier}+${value}` : value; }
    return Array.isArray(binding) ? binding.map(addModifier) : addModifier(binding);
}

function addCssToPage() {}
function isEmbed(element) { return ["EMBED", "OBJECT"].indexOf(element.tagName) >= 0; }

function setSettings(message) {
    settings = message;
    // In the browser `var settings` is already the global the vendored sVim
    // scroller reads; under Jest each file is its own module, so publish it.
    window.settings = settings;
    activateExtension(settings);
}

function activateExtension(nextSettings) {
    deactivateExtension();
    if (nextSettings && isExcludedUrl(nextSettings.excludedUrls, document.URL)) return;
    extensionActive = true;
    sitePropagationHandler = stopSitePropagation;
    document.addEventListener("keydown", sitePropagationHandler, true);
    bindKeyCodesToActions(nextSettings);
}

function deactivateExtension() {
    extensionActive = false;
    insertMode = false;
    deactivateLinkHintsMode();
    findMode.close();
    tabPicker.close();
    overlays.closeModal();
    unbindKeyCodes();
}

function urlMatchesPattern(pattern, currentUrl) {
    var formattedUrl = stripProtocolAndWww(String(pattern || "")).toLowerCase().trim();
    if (!formattedUrl) return false;
    return String(currentUrl || "").toLowerCase().includes(formattedUrl);
}

function isExcludedUrl(storedExcludedUrls, currentUrl) {
    if (!storedExcludedUrls.length) return false;
    return storedExcludedUrls.split(",").some(function (excludedUrl) {
        return urlMatchesPattern(excludedUrl, currentUrl);
    });
}

// Sites that already bind a key well (GitHub's "/", Gmail's j/k, YouTube's f)
// only need that one shortcut surrendered, not the whole extension. An excluded
// key is simply left unbound, so it falls through to the page the same way an
// unbound key does under transparentBindings.
function excludedKeysFor(nextSettings, currentUrl) {
    var rules = nextSettings && nextSettings.excludedKeys;
    var excluded = new Set();
    if (!Array.isArray(rules)) return excluded;
    rules.forEach(function (rule) {
        if (!rule || !Array.isArray(rule.keys)) return;
        if (!urlMatchesPattern(rule.pattern, currentUrl)) return;
        rule.keys.forEach(function (key) {
            var normalized = VimkitCommandDispatcher.normalizeBinding(key).join(" ");
            if (normalized) excluded.add(normalized);
        });
    });
    return excluded;
}

function stripProtocolAndWww(url) {
    url = url.replace("http://", "").replace("https://", "");
    return url.startsWith("www.") ? url.slice(4) : url;
}

function inIframe() {
    try { return window.self !== window.top; }
    catch (_error) { return true; }
}

if (!inIframe()) {
    VimkitSettings.load().then(setSettings).catch(function (error) {
        console.error("Unable to load Vimkit settings:", error);
    });
    VimkitSettings.subscribe(setSettings);
}

window.isExcludedUrl = isExcludedUrl;
window.excludedKeysFor = excludedKeysFor;
window.stripProtocolAndWww = stripProtocolAndWww;
window.VimkitInjected = {
    actionMap: actionMap,
    bindKeyCodesToActions: bindKeyCodesToActions,
    enterInsertMode: enterInsertMode,
    enterNormalMode: enterNormalMode,
    effectiveBindingsFor: effectiveBindingsFor,
    eventTargetsEditable: eventTargetsEditable,
    isActiveElementEditable: isActiveElementEditable,
    navigateUpUrl: navigateUpUrl,
    onDocumentKeyDown: onDocumentKeyDown,
    setSettings: setSettings
};
