const expect = require('expect.js');

describe('isExcludedUrl', () => {
    const isExcludedUrl = window.isExcludedUrl;

    it('returns true on same exact domain', () => {
        const excludedUrl = 'specific-domain.com';
        const currentUrl = excludedUrl;
        expect(isExcludedUrl(excludedUrl, currentUrl)).to.be.ok();
    });

    it('returns true on duplicate domains', () => {
        const excludedUrls = 'specific-domain.com,specific-domain.com';
        const currentUrl = 'specific-domain.com';
        expect(isExcludedUrl(excludedUrls, currentUrl)).to.be.ok();
    });

    it('returns true if any domain match', () => {
        const excludedUrls = 'different-domain.com,specific-domain.com';
        const currentUrl = 'specific-domain.com';
        expect(isExcludedUrl(excludedUrls, currentUrl)).to.be.ok();
    });

    it('returns true on comma separated domains', () => {
        const excludedUrls = 'specific-domain.com,different-domain.com';
        const currentUrl = 'specific-domain.com';
        expect(isExcludedUrl(excludedUrls, currentUrl)).to.be.ok();
    });

    it('returns false on different domain', () => {
        const excludedUrl = 'www.different-domain.com';
        const currentUrl = 'specific-domain.com';
        expect(isExcludedUrl(excludedUrl, currentUrl)).to.not.be.ok();
    });

    it('returns false if no domains match', () => {
        const excludedUrls = 'www.different-domain.com,www.different-domain-2.com';
        const currentUrl = 'specific-domain.com';
        expect(isExcludedUrl(excludedUrls, currentUrl)).to.not.be.ok();
    });

    it('returns false on space separated domains', () => {
        const excludedUrls = 'specific-domain.com different-domain.com';
        const currentUrl = 'specific-domain.com';
        expect(isExcludedUrl(excludedUrls, currentUrl)).to.not.be.ok();
    });

    it('returns true on string added in front of current URL', () => {
        const excludedUrl = 'specific-domain.com';
        const currentUrl = 'http://specific-domain.com';
        expect(isExcludedUrl(excludedUrl, currentUrl)).to.be.ok();
    });

    it('returns true on string appended to current URL', () => {
        const excludedUrl = 'specific-domain.com';
        const currentUrl = 'specific-domain.com/arbitrary-string';
        expect(isExcludedUrl(excludedUrl, currentUrl)).to.be.ok();
    });

    it('returns true on string added on both sides of current URL', () => {
        const excludedUrl = 'specific-domain.com';
        const currentUrl = 'http://specific-domain.com/arbitrary-string';
        expect(isExcludedUrl(excludedUrl, currentUrl)).to.be.ok();
    });

    it('returns true if current URL is less specific than excluded domain', () => {
        let excludedUrl = 'http://specific-domain.com';
        let currentUrl = 'specific-domain.com';
        expect(isExcludedUrl(excludedUrl, currentUrl)).to.be.ok();

        excludedUrl = 'http://www.specific-domain.com';
        currentUrl = 'specific-domain.com';
        expect(isExcludedUrl(excludedUrl, currentUrl)).to.be.ok();
    });

    it('returns true if current URL with appended string is less specific than excluded domain', () => {
        const excludedUrl = 'http://specific-domain.com';
        const currentUrl = 'specific-domain.com/arbitrary-string';
        expect(isExcludedUrl(excludedUrl, currentUrl)).to.be.ok();
    });

    it('returns true even though cases doesn\'t match', () => {
        let excludedUrl = 'SPECIFIC-DOMAIN.com';
        let currentUrl = 'specific-domain.com';
        expect(isExcludedUrl(excludedUrl, currentUrl)).to.be.ok();

        excludedUrl = 'specific-domain.com';
        currentUrl = 'SPECIFIC-DOMAIN.com';
        expect(isExcludedUrl(excludedUrl, currentUrl)).to.be.ok();
    });
});

describe('stripProtocolAndWww', () => {
    const stripProtocolAndWww = window.stripProtocolAndWww;

    it('strips http', () => {
        const url = 'http://specific-domain.com';
        expect(stripProtocolAndWww(url)).to.equal('specific-domain.com');
    });

    it('strips https', () => {
        const url = 'https://specific-domain.com';
        expect(stripProtocolAndWww(url)).to.equal('specific-domain.com');
    });

    it('strips www', () => {
        const url = 'www.specific-domain.com';
        expect(stripProtocolAndWww(url)).to.equal('specific-domain.com');
    });

    it('strips http and www', () => {
        const url = 'http://www.specific-domain.com';
        expect(stripProtocolAndWww(url)).to.equal('specific-domain.com');
    });

    it('strips https and www', () => {
        const url = 'https://www.specific-domain.com';
        expect(stripProtocolAndWww(url)).to.equal('specific-domain.com');
    });
});

describe('command mode integration', () => {
    beforeEach(() => {
        const nextSettings = JSON.parse(JSON.stringify(__vimkitMocks.defaultSettings));
        window.VimkitInjected.setSettings(nextSettings);
    });

    it('suppresses commands in editable elements', () => {
        const action = jest.spyOn(window.VimkitInjected.actionMap, 'scrollDown').mockImplementation(() => {});
        const input = document.createElement('input');
        document.body.appendChild(input);
        input.focus();
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', bubbles: true, composed: true }));
        expect(action.mock.calls.length).to.equal(0);
    });

    it('disables commands in insert mode until Escape returns to normal mode', () => {
        const action = jest.spyOn(window.VimkitInjected.actionMap, 'scrollDown').mockImplementation(() => {});
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'i', bubbles: true }));
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', bubbles: true }));
        expect(action.mock.calls.length).to.equal(0);
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', bubbles: true }));
        expect(action.mock.calls.length).to.equal(1);
    });
});

describe('new default bindings dispatch', () => {
    beforeEach(() => {
        window.VimkitInjected.enterNormalMode();
        window.VimkitInjected.setSettings(JSON.parse(JSON.stringify(__vimkitMocks.defaultSettings)));
    });
    afterEach(() => jest.restoreAllMocks());

    function press(key, init) {
        document.body.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key, bubbles: true }, init || {})));
    }

    it('runs ]] / [[ / << / >> / R sequences', () => {
        const spies = ['nextPage', 'previousPage', 'moveTabLeft', 'moveTabRight', 'hardReload', 'copyLinkText', 'copyLinkMarkdown']
            .map(name => [name, jest.spyOn(window.VimkitInjected.actionMap, name).mockImplementation(() => {})]);
        press(']'); press(']');
        press('['); press('[');
        press('<', { shiftKey: true }); press('<', { shiftKey: true });
        press('>', { shiftKey: true }); press('>', { shiftKey: true });
        press('R', { shiftKey: true });
        press('y'); press('F', { shiftKey: true });
        press('y'); press('m');
        spies.forEach(([name, spy]) => expect(spy.mock.calls.length).to.equal(1, name));
    });

    it('follows the next-page link and reports when none exists', () => {
        const link = document.createElement('a');
        link.href = 'https://example.com/page/2';
        link.rel = 'next';
        link.click = jest.fn();
        document.body.appendChild(link);
        press(']'); press(']');
        expect(link.click.mock.calls.length).to.equal(1);
        link.remove();
        press('['); press('[');
        const status = document.querySelector('[data-vimkit-overlay="status"]');
        expect(status.shadowRoot.textContent).to.contain('No previous page link was found.');
    });

    it('moves tabs through the background with the count prefix', () => {
        press('3'); press('>', { shiftKey: true }); press('>', { shiftKey: true });
        const calls = browser.runtime.sendMessage.mock.calls;
        expect(calls[calls.length - 1][0]).to.eql({ action: 'tabs.move', offset: 3 });
        press('<', { shiftKey: true }); press('<', { shiftKey: true });
        expect(calls[calls.length - 1][0]).to.eql({ action: 'tabs.move', offset: -1 });
    });

    it('hard reload asks the background to bypass the cache', () => {
        press('R', { shiftKey: true });
        const calls = browser.runtime.sendMessage.mock.calls;
        expect(calls[calls.length - 1][0]).to.eql({ action: 'tabs.reload', bypassCache: true });
    });

    it('does not close the tab when the second key of "yy" is mistyped', () => {
        const closeTab = jest.spyOn(window.VimkitInjected.actionMap, 'closeTab').mockImplementation(() => {});
        press('y'); press('x');
        expect(closeTab.mock.calls.length).to.equal(0);
        press('x');
        expect(closeTab.mock.calls.length).to.equal(1);
    });

    it('lists insert mode in the help overlay', () => {
        press('?', { shiftKey: true });
        const help = document.querySelector('[data-vimkit-overlay="help"]');
        expect(help.shadowRoot.textContent).to.contain('Enter insert mode');
        window.VimkitInjected.enterNormalMode();
    });
});

describe('insert mode binding', () => {
    afterEach(() => {
        window.VimkitInjected.enterNormalMode();
        window.VimkitInjected.setSettings(JSON.parse(JSON.stringify(__vimkitMocks.defaultSettings)));
        jest.restoreAllMocks();
    });

    function press(key, init) {
        document.body.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key, bubbles: true }, init || {})));
    }

    it('comes from the settings rather than a hardcoded key', () => {
        const settings = JSON.parse(JSON.stringify(__vimkitMocks.defaultSettings));
        settings.bindings.enterInsertMode = 'a';
        window.VimkitInjected.enterNormalMode();
        window.VimkitInjected.setSettings(settings);

        const scrollDown = jest.spyOn(window.VimkitInjected.actionMap, 'scrollDown').mockImplementation(() => {});
        // "i" is no longer insert mode, so "j" still scrolls after it.
        press('i'); press('j');
        expect(scrollDown.mock.calls.length).to.equal(1);

        press('a'); press('j');
        expect(scrollDown.mock.calls.length).to.equal(1);
    });
});

describe('scrolling a nested element', () => {
    function makeScroller(element, { extent = 500, position = 0 } = {}) {
        element.style.overflowY = 'auto';
        Object.defineProperty(element, 'clientHeight', { value: 100, configurable: true });
        Object.defineProperty(element, 'scrollHeight', { value: 100 + extent, configurable: true });
        element.scrollTop = position;
        return element;
    }

    beforeEach(() => {
        document.body.innerHTML = '';
        document.elementFromPoint = () => null;
        const settings = JSON.parse(JSON.stringify(__vimkitMocks.defaultSettings));
        settings.smoothScroll = false;
        window.VimkitInjected.enterNormalMode();
        window.VimkitInjected.setSettings(settings);
    });

    it('scrolls the app shell pane rather than the document', () => {
        document.body.innerHTML = '<div id="pane"><input id="field"></div>';
        const pane = makeScroller(document.getElementById('pane'));
        document.getElementById('field').focus();

        // scrollSize is 150 by default, so a count of 2 moves 300px.
        window.VimkitInjected.actionMap.scrollDown({ count: 2 });
        expect(pane.scrollTop).to.equal(300);
    });

    it('measures a half page against the pane, not the window', () => {
        document.body.innerHTML = '<div id="pane"><input id="field"></div>';
        const pane = makeScroller(document.getElementById('pane'));
        document.getElementById('field').focus();

        window.VimkitInjected.actionMap.scrollDownHalfPage({ count: 1 });
        expect(pane.scrollTop).to.equal(50);
    });

    it('jumps to the end of the pane', () => {
        document.body.innerHTML = '<div id="pane"><input id="field"></div>';
        const pane = makeScroller(document.getElementById('pane'));
        document.getElementById('field').focus();

        window.VimkitInjected.actionMap.goToPageBottom({ count: 1 });
        expect(pane.scrollTop).to.equal(600);
    });

    it('leaves the document scroll to the window when no pane scrolls', () => {
        document.body.innerHTML = '<div id="plain"><input id="field"></div>';
        document.getElementById('field').focus();
        const scrollBy = jest.spyOn(window, 'scrollBy').mockImplementation(() => {});

        window.VimkitInjected.actionMap.scrollDown({ count: 1 });
        expect(scrollBy.mock.calls.length).to.equal(1);
        scrollBy.mockRestore();
    });
});
