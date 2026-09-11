/*
 * This implements link hinting. Typing "F" will enter link-hinting mode, where all clickable items on
 * the page have a hint marker displayed containing a sequence of letters. Typing those letters will select
 * a link.
 *
 * The characters we use to show link hints are a user-configurable option. By default they're the home row.
 * The CSS which is used on the link hints is also a configurable option.
 */

var hintMarkers = [];
var hintMarkerContainingDiv = null;
// The characters that were typed in while in "link hints" mode.
var hintKeystrokeQueue = [];
// In filtered mode, the link text typed so far to narrow the candidate set.
var linkHintTextFilter = "";
var linkHintsModeActivated = false;
// What happens once a hint is selected. See LinkHintMode.
var linkHintMode = "open";
// Whether link hint's "open in current/new tab" setting is currently toggled 
var openLinkModeToggle = false;
// Whether we have added to the page the CSS needed to display link hints.
var linkHintsCssAdded = false;

var LinkHintMode = Object.freeze({
  open: "open",
  openNewTab: "openNewTab",
  openQueue: "openQueue",
  copyUrl: "copyUrl",
  copyText: "copyText",
  copyMarkdown: "copyMarkdown"
});

// Modes that only make sense for elements with an href.
var LINK_ONLY_MODES = [LinkHintMode.copyUrl, LinkHintMode.copyText, LinkHintMode.copyMarkdown];

// With filterLinkHints on, hints are digits and typing a link's visible text
// narrows the set — Vimium's signature behaviour. Digits stay usable as an
// escape hatch for links with no readable text (icons, images).
function linkHintsFilterEnabled() {
  return !!(typeof settings !== "undefined" && settings && settings.filterLinkHints);
}

// Everything a user might reasonably read off the element, folded to one
// lowercase line so the filter is a plain substring test.
function hintFilterText(element) {
  var attribute = function (name) {
    return element && typeof element.getAttribute === "function" ? (element.getAttribute(name) || "") : "";
  };
  var parts = [element && element.textContent, attribute("aria-label"), attribute("title"),
               attribute("alt"), attribute("placeholder"), element && element.value];
  return parts
    .filter(function (part) { return typeof part === "string" && part.trim(); })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function activateLinkHintsModeToOpenInNewTab() { activateLinkHintsMode(LinkHintMode.openNewTab); }

function activateLinkHintsModeWithQueue() { activateLinkHintsMode(LinkHintMode.openQueue); }

function activateLinkHintsModeToCopyUrl() { activateLinkHintsMode(LinkHintMode.copyUrl); }

function activateLinkHintsModeToCopyText() { activateLinkHintsMode(LinkHintMode.copyText); }

function activateLinkHintsModeToCopyMarkdown() { activateLinkHintsMode(LinkHintMode.copyMarkdown); }

/*
 * Legacy callers passed (openInNewTab, withQueue, copyUrl) booleans; map them onto a mode name.
 */
function resolveLinkHintMode(mode, withQueue, copyUrl) {
  if (typeof mode === "string" && LinkHintMode[mode]) return mode;
  if (copyUrl) return LinkHintMode.copyUrl;
  if (withQueue) return LinkHintMode.openQueue;
  if (mode === true) return LinkHintMode.openNewTab;
  return LinkHintMode.open;
}

function activateLinkHintsMode(mode, withQueue, copyUrl) {
  if (!linkHintsCssAdded)
    addCssToPage(linkHintCss); // linkHintCss is declared by vimiumFrontend.js
  linkHintCssAdded = true;
  linkHintsModeActivated = true;
  linkHintMode = resolveLinkHintMode(mode, withQueue, copyUrl);
  if (!buildLinkHints()) {
    linkHintsModeActivated = false;
    linkHintMode = LinkHintMode.open;
    if (typeof overlays !== "undefined") overlays.showStatus("No links are available in the viewport.", "error");
    return;
  }
  document.addEventListener("keydown", onKeyDownInLinkHintsMode, true);
  document.addEventListener("keyup", onKeyUpInLinkHintsMode, true);
}

function isLinkOnlyMode() {
  return LINK_ONLY_MODES.indexOf(linkHintMode) >= 0;
}

/*
 * Shift temporarily swaps "open here" and "open in a new tab" while hint mode is active.
 */
function toggleOpenLinkMode() {
  if (linkHintMode === LinkHintMode.open) linkHintMode = LinkHintMode.openNewTab;
  else if (linkHintMode === LinkHintMode.openNewTab) linkHintMode = LinkHintMode.open;
}

/*
 * Builds and displays link hints for every visible clickable item on the page.
 */
function buildLinkHints() {
  var visibleElements = getVisibleClickableElements();
  if (visibleElements.length === 0)
    return false;

  var hintStrings = linkHintsFilterEnabled()
    ? visibleElements.map(function (_element, index) { return String(index + 1); })
    : generateHintStrings(visibleElements.length, settings.linkHintCharacters);
  for (var i = 0; i < visibleElements.length; i++)
    hintMarkers.push(createMarkerFor(visibleElements[i], hintStrings[i]));
  // Note(philc): Append these markers as top level children instead of as child nodes to the link itself,
  // because some clickable elements cannot contain children, e.g. submit buttons. This has the caveat
  // that if you scroll the page and the link has position=fixed, the marker will not stay fixed.
  // Also note that adding these nodes to document.body all at once is significantly faster than one-by-one.
  hintMarkerContainingDiv = document.createElement("div");
  hintMarkerContainingDiv.id = "vimiumHintMarkerContainer";
  hintMarkerContainingDiv.className = "vimiumReset";
  for (var i = 0; i < hintMarkers.length; i++)
    hintMarkerContainingDiv.appendChild(hintMarkers[i]);
  document.body.appendChild(hintMarkerContainingDiv);
  return true;
}

/*
 * Returns all clickable elements that are not hidden and are in the current viewport.
 * We prune invisible elements partly for performance reasons, but moreso it's to decrease the number
 * of digits needed to enumerate all of the links on screen.
 */
function getVisibleClickableElements() {
  // Get all clickable elements.
  var elements = getClickableElements();

  // Get those that are visible too.
  var visibleElements = [];

  for (var i = 0; i < elements.length; i++) {
    var element = elements[i];

    if (isLinkOnlyMode() && !element.href)
      continue;
    var selectedRect = getFirstVisibleRect(element);
    if (selectedRect) {
      visibleElements.push(selectedRect);
    }
  }

  return visibleElements;
}

function getClickableElements() {
  var elements = document.getElementsByTagName('*');
  var clickableElements = [];
  for (var i = 0; i < elements.length; i++) {
    var element = elements[i];
    if (isClickable(element))
      clickableElements.push(element);
  }
  return clickableElements;
}

var TEXT_INPUT_TYPES = ["text", "search", "password", "email", "url", "tel", "number", "date", "datetime-local",
  "month", "week", "time"];

/*
 * Classifies an element as "link" (navigates somewhere), "input" (takes text) or "control"
 * (buttons, toggles, and everything else that reacts to a click). Returns null when the
 * element is not clickable at all.
 */
function clickableKind(element) {
  var name = element.nodeName.toLowerCase();
  var role = element.getAttribute('role');
  var type = (element.getAttribute('type') || 'text').toLowerCase();

  if (name === 'a' || role === 'link')
    return element.href || element.hasAttribute('href') ? 'link' : 'control';
  if (name === 'textarea' || role === 'textbox' || role === 'combobox')
    return 'input';
  if (name === 'input')
    return type === 'hidden' ? null : TEXT_INPUT_TYPES.indexOf(type) >= 0 ? 'input' : 'control';
  if (name === 'button' || name === 'select' ||
      // elements having an ARIA role implying clickability
      // (see http://www.w3.org/TR/wai-aria/roles#widget_roles)
      role === 'button' ||
      role === 'checkbox' ||
      role === 'menuitem' ||
      role === 'menuitemcheckbox' ||
      role === 'menuitemradio' ||
      role === 'radio' ||
      role === 'tab' ||
      // other ways by which we can know an element is clickable
      element.hasAttribute('onclick') ||
      settings.detectByCursorStyle && window.getComputedStyle(element).cursor === 'pointer' &&
        (!element.parentNode ||
         window.getComputedStyle(element.parentNode).cursor !== 'pointer'))
    return 'control';
  return null;
}

function isClickable(element) {
  return clickableKind(element) !== null;
}

/*
 * Get firs visible rect under an element.
 *
 * Inline elements can have more than one rect.
 * Block elemens only have one rect.
 * So, in general, add element's first visible rect, if any.
 * If element does not have any visible rect, 
 * it can still be wrapping other visible children.
 * So, in that case, recurse to get the first visible rect
 * of the first child that has one.
 */
function getFirstVisibleRect(element) {
  // find visible clientRect of element itself
  var clientRects = element.getClientRects();
  for (var i = 0; i < clientRects.length; i++) {
    var clientRect = clientRects[i];
    if (isVisible(element, clientRect)) {
      return {element: element, rect: clientRect};
    }
  }
  // Only iterate over elements with a children property. This is mainly to
  // avoid issues with SVG elements, as Safari doesn't expose a children
  // property on them.
  if (element.children) {
    // find visible clientRect of child
    for (var j = 0; j < element.children.length; j++) {
      var childClientRect = getFirstVisibleRect(element.children[j]);
      if (childClientRect) {
        return childClientRect;
      }
    }
  }
  return null;
}

/*
 * Returns true if element is visible.
 */
function isVisible(element, clientRect) {
  // Exclude links which have just a few pixels on screen, because the link hints won't show for them anyway.
  var zoomFactor = currentZoomLevel / 100.0;
  if (!clientRect || clientRect.top < 0 || clientRect.top * zoomFactor >= window.innerHeight - 4 ||
      clientRect.left < 0 || clientRect.left * zoomFactor >= window.innerWidth - 4)
    return false;

  if (clientRect.width < 3 || clientRect.height < 3)
    return false;

  // eliminate invisible elements (see test_harnesses/visibility_test.html)
  var computedStyle = window.getComputedStyle(element, null);
  if (computedStyle.getPropertyValue('visibility') !== 'visible' ||
      computedStyle.getPropertyValue('display') === 'none')
    return false;

  // Eliminate elements hidden by another overlapping element.
  // To do that, get topmost element at some offset from upper-left corner of clientRect
  // and check whether it is the element itself or one of its descendants.
  // The offset is needed to account for coordinates truncation and elements with rounded borders.
  // 
  // Coordinates truncation occcurs when using zoom. In that case, clientRect coords should be float, 
  // but we get integers instead. That makes so that elementFromPoint(clientRect.left, clientRect.top)
  // sometimes returns an element different from the one clientRect was obtained from.
  // So we introduce an offset to make sure elementFromPoint hits the right element.
  //
  // For elements with a rounded topleft border, the upper left corner lies outside the element.
  // Then, we need an offset to get to the point nearest to the upper left corner, but within border.
  var coordTruncationOffset = 2, // A value of 1 has been observed not to be enough, 
                                 // so we heuristically choose 2, which seems to work well. 
                                 // We know a value of 2 is still safe (lies within the element) because, 
                                 // from the code above, widht & height are >= 3.
      radius = parseFloat(computedStyle.borderTopLeftRadius), 
      roundedBorderOffset = Math.ceil(radius * (1 - Math.sin(Math.PI / 4))), 
      offset = Math.max(coordTruncationOffset, roundedBorderOffset);
  if (offset >= clientRect.width || offset >= clientRect.height) 
    return false;
  var el = document.elementFromPoint(clientRect.left + offset, clientRect.top + offset);
  while (el && el !== element)
    el = el.parentNode;
  if (!el)
    return false;

  return true;
}

function onKeyDownInLinkHintsMode(event) {
  if (event.keyCode === keyCodes.shiftKey && !openLinkModeToggle) {
    // Toggle whether to open link in a new or current tab.
    toggleOpenLinkMode();
    openLinkModeToggle = true;
  }

  var keyChar = getKeyChar(event);
  if (!keyChar)
    return;

  // TODO(philc): Ignore keys that have modifiers.
  if (isEscape(event)) {
    deactivateLinkHintsMode();
  } else if (event.keyCode === keyCodes.backspace || event.keyCode === keyCodes.deleteKey) {
    // Backspace unwinds the digits first, then the text filter, then leaves.
    if (hintKeystrokeQueue.length > 0) {
      hintKeystrokeQueue.pop();
      updateLinkHints();
    } else if (linkHintsFilterEnabled() && linkHintTextFilter.length > 0) {
      linkHintTextFilter = linkHintTextFilter.slice(0, -1);
      updateLinkHints();
    } else {
      deactivateLinkHintsMode();
    }
  } else if (linkHintsFilterEnabled()) {
    if (/^[0-9]$/.test(keyChar)) {
      hintKeystrokeQueue.push(keyChar);
      updateLinkHints();
    } else if (keyChar === "enter") {
      activateFirstVisibleHint();
    } else if (keyChar.length === 1 && !event.ctrlKey && !event.metaKey) {
      // Renumbering invalidates any digits already typed.
      linkHintTextFilter += keyChar;
      hintKeystrokeQueue = [];
      updateLinkHints();
    } else {
      return;
    }
  } else if (settings.linkHintCharacters.indexOf(keyChar) >= 0) {
    hintKeystrokeQueue.push(keyChar);
    updateLinkHints();
  } else {
    return;
  }

  event.stopPropagation();
  event.preventDefault();
}

function onKeyUpInLinkHintsMode(event) {
  if (event.keyCode === keyCodes.shiftKey && openLinkModeToggle) {
    // Revert toggle on whether to open link in new or current tab.
    toggleOpenLinkMode();
    openLinkModeToggle = false;
  }
  event.stopPropagation();
  event.preventDefault();
}

/*
 * Updates the visibility of link hints on screen based on the keystrokes typed
 * thus far. If the provided keystrokes match exactly with one LinkHint, click
 * on that link and exit link hints mode.
 */
function updateLinkHints() {
  var matchString = hintKeystrokeQueue.join("");
  var markersMatched;
  if (linkHintsFilterEnabled()) {
    var candidates = applyLinkHintTextFilter();
    if (candidates.length === 0) {
      // An over-narrow filter is a typo, not a decision to leave: hold the mode
      // open so backspace can recover.
      highlightLinkMatches(matchString, candidates);
      return;
    }
    markersMatched = highlightLinkMatches(matchString, candidates);
  } else {
    markersMatched = highlightLinkMatches(matchString);
  }

  if (markersMatched.length === 0) {
    deactivateLinkHintsMode();
  } else if (markersMatched.length === 1 && markersMatched[0].getAttribute("hintString") === matchString) {
    activateHintMarker(markersMatched[0]);
  }
}

/*
 * In filtered mode, hides the markers whose text does not contain the filter and
 * renumbers the survivors, so a one-digit hint is always in reach.
 */
function applyLinkHintTextFilter() {
  var candidates = [];
  for (var i = 0; i < hintMarkers.length; i++) {
    var text = hintMarkers[i].getAttribute("hintText") || "";
    if (text.indexOf(linkHintTextFilter) >= 0) candidates.push(hintMarkers[i]);
  }
  for (var j = 0; j < candidates.length; j++)
    setMarkerHintString(candidates[j], String(j + 1));
  return candidates;
}

function activateFirstVisibleHint() {
  var candidates = linkHintsFilterEnabled() ? applyLinkHintTextFilter() : hintMarkers;
  if (candidates.length > 0) activateHintMarker(candidates[0]);
}

function activateHintMarker(marker) {
  var matchedLink = marker.clickableItem;
  if (isSelectable(matchedLink)) {
    matchedLink.focus();
    // When focusing a textbox, put the selection caret at the end of the textbox's contents.
    matchedLink.setSelectionRange(matchedLink.value.length, matchedLink.value.length);
    deactivateLinkHintsMode();
  } else {
    var copyValue = linkHintCopyValue(matchedLink, linkHintMode);
    if (copyValue) {
      clipboardController.copy(copyValue.text, copyValue.label);
      matchedLink.focus();
      deactivateLinkHintsMode();
      return;
    }
    // When we're opening the link in the current tab, don't navigate to the selected link immediately;
    // we want to give the user some feedback depicting which link they've selected by focusing it.
    if (linkHintMode === LinkHintMode.openQueue) {
      simulateClick(matchedLink, true);
      resetLinkHintsMode();
    } else if (linkHintMode === LinkHintMode.openNewTab) {
      simulateClick(matchedLink, true);
      matchedLink.focus();
      deactivateLinkHintsMode();
    } else {
      setTimeout(function() { simulateClick(matchedLink, false); }, 400);
      matchedLink.focus();
      deactivateLinkHintsMode();
    }
  }
}

function linkHintText(link) {
  var attribute = function (name) { return typeof link.getAttribute === "function" ? link.getAttribute(name) : ""; };
  var text = (link.textContent || attribute("aria-label") || attribute("title") || "")
    .replace(/\s+/g, " ").trim();
  return text || link.href;
}

/*
 * Returns { text, label } for the copy modes, or null when the mode opens the link instead.
 */
function linkHintCopyValue(link, mode) {
  switch (mode) {
  case LinkHintMode.copyUrl:
    return { text: link.href, label: "Link URL" };
  case LinkHintMode.copyText:
    return { text: linkHintText(link), label: "Link text" };
  case LinkHintMode.copyMarkdown: {
    var label = linkHintText(link).replace(/([\[\]\\])/g, "\\$1");
    var url = String(link.href).replace(/\(/g, "%28").replace(/\)/g, "%29");
    return { text: "[" + label + "](" + url + ")", label: "Markdown link" };
  }
  default:
    return null;
  }
}

/*
 * Selectable means the element has a text caret; this is not the same as "focusable".
 */
function isSelectable(element) {
  var selectableTypes = ["search", "text", "password"];
  return (element.tagName === "INPUT" && selectableTypes.indexOf(element.type) >= 0) ||
      element.tagName === "TEXTAREA";
}

/*
 * Hides link hints which do not match the given search string. To allow the backspace key to work, this
 * will also show link hints which do match but were previously hidden.
 */
function highlightLinkMatches(searchString, candidates) {
  var markersMatched = [];
  for (var i = 0; i < hintMarkers.length; i++) {
    var linkMarker = hintMarkers[i];
    var inCandidateSet = !candidates || candidates.indexOf(linkMarker) >= 0;
    if (inCandidateSet && linkMarker.getAttribute("hintString").indexOf(searchString) === 0) {
      if (linkMarker.style.display === "none")
        linkMarker.style.display = "";
      for (var j = 0; j < linkMarker.childNodes.length; j++)
        linkMarker.childNodes[j].className = (j >= searchString.length) ? "" : "matchingCharacter";
      markersMatched.push(linkMarker);
    } else {
      linkMarker.style.display = "none";
    }
  }
  return markersMatched;
}

/*
 * Generates `count` hint strings from `characters`. The result is prefix-free (no hint is the start of
 * another), as short as the alphabet allows, and deterministic: the same count and alphabet always
 * produce the same hints in the same order, so muscle memory holds across visits.
 *
 * Hints are grown breadth-first from the empty string, so with 14 characters and 20 links you get
 * 8 one-character hints and 12 two-character hints instead of 20 two-character hints. The strings are
 * then sorted and reversed so the first character typed varies the most between neighbouring hints.
 */
function generateHintStrings(count, characters) {
  var alphabet = String(characters || "").split("").filter(function (character, index, all) {
    return all.indexOf(character) === index;
  });
  if (alphabet.length < 2) alphabet = ["a", "s"];
  var hints = [""];
  var offset = 0;
  while (hints.length - offset < count || hints.length === 1) {
    var hint = hints[offset++];
    // Prepend so the working set is suffix-free; reversing each string below makes it prefix-free.
    for (var i = 0; i < alphabet.length; i++)
      hints.push(alphabet[i] + hint);
  }
  hints = hints.slice(offset, offset + count);
  return hints.sort().map(function (hint) { return hint.split("").reverse().join(""); });
}

function simulateClick(link, openInNewTab) {
  if (openInNewTab) {
    extensionCommunicator.requestOpenLinkInBackground(link.href);
  } else {
    link.click();
  }

  // If clicking the link doesn't take you to a new page
  // the focus should not stay on the link, hence calling blur()
  link.blur();
}

function deactivateLinkHintsMode() {
  if (hintMarkerContainingDiv)
    hintMarkerContainingDiv.parentNode.removeChild(hintMarkerContainingDiv);
  hintMarkerContainingDiv = null;
  hintMarkers = [];
  hintKeystrokeQueue = [];
  linkHintTextFilter = "";
  document.removeEventListener("keydown", onKeyDownInLinkHintsMode, true);
  document.removeEventListener("keyup", onKeyUpInLinkHintsMode, true);
  linkHintsModeActivated = false;
  linkHintMode = LinkHintMode.open;
}

function resetLinkHintsMode() {
  deactivateLinkHintsMode();
  activateLinkHintsModeWithQueue();
}

/*
 * Writes a hint string onto a marker. Each character is its own span so the
 * typed prefix can be highlighted, and filtered mode rewrites this as the
 * candidate set narrows.
 */
function setMarkerHintString(marker, hintString) {
  var innerHTML = [];
  for (var i = 0; i < hintString.length; i++)
    innerHTML.push('<span class="vimiumReset">' + hintString[i].toUpperCase() + '</span>');
  marker.innerHTML = innerHTML.join("");
  marker.setAttribute("hintString", hintString);
}

/*
 * Creates a link marker for the given link.
 */
function createMarkerFor(link, hintString) {
  var marker = document.createElement("div");
  marker.className = "internalVimiumHintMarker vimiumReset";
  setMarkerHintString(marker, hintString);
  marker.setAttribute("hintText", hintFilterText(link.element));

  // Note: this call will be expensive if we modify the DOM in between calls.
  var clientRect = link.rect;
  // The coordinates given by the window do not have the zoom factor included since the zoom is set only on
  // the document node.
  var zoomFactor = currentZoomLevel / 100.0;
  marker.style.left = clientRect.left + window.scrollX / zoomFactor + "px";
  marker.style.top = clientRect.top  + window.scrollY / zoomFactor + "px";

  marker.clickableItem = link.element;
  return marker;
}

if (typeof module !== "undefined") {
  module.exports = {
    LinkHintMode: LinkHintMode,
    activateLinkHintsMode: activateLinkHintsMode,
    activateLinkHintsModeToCopyMarkdown: activateLinkHintsModeToCopyMarkdown,
    activateLinkHintsModeToCopyText: activateLinkHintsModeToCopyText,
    activateLinkHintsModeToCopyUrl: activateLinkHintsModeToCopyUrl,
    activateLinkHintsModeWithQueue: activateLinkHintsModeWithQueue,
    clickableKind: clickableKind,
    deactivateLinkHintsMode: deactivateLinkHintsMode,
    generateHintStrings: generateHintStrings,
    hintFilterText: hintFilterText,
    linkHintCopyValue: linkHintCopyValue,
    onKeyDownInLinkHintsMode: onKeyDownInLinkHintsMode,
    updateLinkHints: updateLinkHints
  };
  global.LinkHintMode = LinkHintMode;
  global.activateLinkHintsMode = activateLinkHintsMode;
  global.activateLinkHintsModeToCopyMarkdown = activateLinkHintsModeToCopyMarkdown;
  global.activateLinkHintsModeToCopyText = activateLinkHintsModeToCopyText;
  global.activateLinkHintsModeToCopyUrl = activateLinkHintsModeToCopyUrl;
  global.activateLinkHintsModeWithQueue = activateLinkHintsModeWithQueue;
  global.deactivateLinkHintsMode = deactivateLinkHintsMode;
  Object.defineProperty(global, "linkHintsModeActivated", {
    configurable: true,
    get: function () { return linkHintsModeActivated; },
    set: function (value) { linkHintsModeActivated = value; }
  });
}
