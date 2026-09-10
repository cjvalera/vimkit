const {
    CommandDispatcher,
    applyGlobalModifier,
    eventToToken,
    formatBinding,
    normalizeBinding
} = require("../Vimkit Extension/js/command-dispatcher.js");

describe("CommandDispatcher", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    function createDispatcher() {
        return new CommandDispatcher({ timeout: 1000 });
    }

    it("calls window timers without rebinding this", () => {
        // Browsers throw when setTimeout/clearTimeout run with another object
        // as `this`; Node's timers do not, so emulate the browser check.
        const setTimer = global.setTimeout;
        const clearTimer = global.clearTimeout;
        const strict = fn => function () {
            if (this !== undefined && this !== globalThis) throw new TypeError("Illegal invocation");
            return fn.apply(undefined, arguments);
        };
        global.setTimeout = strict(setTimer);
        global.clearTimeout = strict(clearTimer);
        try {
            const called = jest.fn();
            const dispatcher = createDispatcher();
            dispatcher.register("top", "g g", called);
            expect(() => dispatcher.handleToken("g")).not.toThrow();
            jest.advanceTimersByTime(1000);
            dispatcher.handleToken("g");
            expect(called).not.toHaveBeenCalled();
            dispatcher.handleToken("g");
            expect(called).toHaveBeenCalledTimes(1);
        } finally {
            global.setTimeout = setTimer;
            global.clearTimeout = clearTimer;
        }
    });

    it("normalizes legacy bindings and keyboard events", () => {
        expect(normalizeBinding("g shift+G")).toEqual(["g", "shift+g"]);
        expect(applyGlobalModifier("g g", "ctrl")).toEqual(["ctrl+g", "ctrl+g"]);
        expect(eventToToken({ key: "G", shiftKey: true })).toBe("shift+g");
        expect(eventToToken({ key: "?", shiftKey: true })).toBe("?");
        expect(eventToToken({ key: "ArrowDown" })).toBe("down");
        expect(eventToToken({ key: "ƒ", code: "KeyF", altKey: true })).toBe("alt+f");
    });

    it("supports strings, arrays, sequences, and global modifiers", () => {
        const called = jest.fn();
        const dispatcher = createDispatcher();
        dispatcher.register("top", ["g g", "home"], called, "ctrl");

        expect(dispatcher.handleToken("ctrl+g")).toBe(true);
        dispatcher.handleToken("ctrl+g");
        expect(called).toHaveBeenCalledWith(expect.objectContaining({ binding: "ctrl+g ctrl+g" }));
    });

    it("holds the global modifier for every key of a sequence", () => {
        const called = jest.fn();
        const dispatcher = createDispatcher();
        dispatcher.register("copyUrl", "y y", called, "ctrl");

        // A bare second key belongs to the page, not to Vimkit.
        dispatcher.handleToken("ctrl+y");
        expect(dispatcher.handleToken("y")).toBe(true);
        expect(called).not.toHaveBeenCalled();

        dispatcher.handleToken("ctrl+y");
        dispatcher.handleToken("ctrl+y");
        expect(called).toHaveBeenCalledTimes(1);
    });

    it("resolves overlapping commands after the timeout", () => {
        const short = jest.fn();
        const long = jest.fn();
        const dispatcher = createDispatcher();
        dispatcher.register("short", "g", short);
        dispatcher.register("long", "g g", long);

        dispatcher.handleToken("g");
        expect(short).not.toHaveBeenCalled();
        jest.advanceTimersByTime(999);
        expect(short).not.toHaveBeenCalled();
        dispatcher.handleToken("g");
        expect(long).toHaveBeenCalledTimes(1);
        expect(short).not.toHaveBeenCalled();

        dispatcher.handleToken("g");
        jest.advanceTimersByTime(1000);
        expect(short).toHaveBeenCalledTimes(1);
    });

    it("keeps gg, g0, and gt distinct", () => {
        const results = [];
        const dispatcher = createDispatcher();
        dispatcher.register("top", "g g", () => results.push("top"));
        dispatcher.register("first", "g 0", () => results.push("first"));
        dispatcher.register("next", "g t", () => results.push("next"));

        dispatcher.handleToken("g"); dispatcher.handleToken("0");
        dispatcher.handleToken("g"); dispatcher.handleToken("t");
        dispatcher.handleToken("g"); dispatcher.handleToken("g");
        expect(results).toEqual(["first", "next", "top"]);
    });

    it("applies bounded count prefixes while zero remains a command key", () => {
        const called = jest.fn();
        const zero = jest.fn();
        const dispatcher = createDispatcher();
        dispatcher.register("scroll", "j", called);
        dispatcher.register("zero", "0", zero);

        dispatcher.handleToken("1"); dispatcher.handleToken("2"); dispatcher.handleToken("0"); dispatcher.handleToken("j");
        expect(called).toHaveBeenCalledWith(expect.objectContaining({ count: 120, countProvided: true }));
        dispatcher.handleToken("9"); dispatcher.handleToken("9"); dispatcher.handleToken("9"); dispatcher.handleToken("9"); dispatcher.handleToken("j");
        expect(called).toHaveBeenLastCalledWith(expect.objectContaining({ count: 999 }));
        dispatcher.handleToken("0");
        expect(zero).toHaveBeenCalledTimes(1);
    });

    it("cancels pending counts and sequences with Escape", () => {
        const called = jest.fn();
        const dispatcher = createDispatcher();
        dispatcher.register("top", "g g", called);
        dispatcher.handleToken("3");
        expect(dispatcher.handleToken("esc")).toBe(true);
        dispatcher.handleToken("g");
        dispatcher.handleToken("esc");
        jest.advanceTimersByTime(1000);
        expect(called).not.toHaveBeenCalled();
    });

    it("abandons a mistyped prefix instead of running the second key alone", () => {
        const copyUrl = jest.fn();
        const closeTab = jest.fn();
        const dispatcher = createDispatcher();
        dispatcher.register("copyUrl", "y y", copyUrl);
        dispatcher.register("closeTab", "x", closeTab);

        // "yx" is a slip of the second key, not a request to close the tab.
        dispatcher.handleToken("y");
        expect(dispatcher.handleToken("x")).toBe(true);
        expect(closeTab).not.toHaveBeenCalled();
        expect(copyUrl).not.toHaveBeenCalled();

        // The sequence is over, so the next "x" is a command again.
        dispatcher.handleToken("x");
        expect(closeTab).toHaveBeenCalledTimes(1);
    });

    it("drops a pending count when the sequence is abandoned", () => {
        const scroll = jest.fn();
        const dispatcher = createDispatcher();
        dispatcher.register("top", "g g", jest.fn());
        dispatcher.register("scroll", "j", scroll);

        dispatcher.handleToken("3");
        dispatcher.handleToken("g");
        expect(dispatcher.handleToken("z")).toBe(true);
        dispatcher.handleToken("j");
        expect(scroll).toHaveBeenCalledWith(expect.objectContaining({ count: 1, countProvided: false }));
    });

    it("lets a binding on Ctrl-[ win over the Escape alias", () => {
        const previousPage = jest.fn();
        const plain = createDispatcher();
        plain.register("top", "g g", jest.fn());

        expect(plain.isEscape("esc")).toBe(true);
        expect(plain.isEscape("ctrl+[")).toBe(true);

        // A "ctrl" modifier turns "[ [" into "ctrl+[ ctrl+[", which used to be
        // swallowed as Escape and left the shortcut unreachable.
        const bound = createDispatcher();
        bound.register("previousPage", "[ [", previousPage, "ctrl");

        expect(bound.isEscape("ctrl+[")).toBe(false);
        expect(bound.isEscape("esc")).toBe(true);
        bound.handleToken("ctrl+[");
        bound.handleToken("ctrl+[");
        expect(previousPage).toHaveBeenCalledTimes(1);
    });

    it("expires incomplete counts and sequences", () => {
        const called = jest.fn();
        const dispatcher = createDispatcher();
        dispatcher.register("top", "g g", called);
        dispatcher.handleToken("4");
        jest.advanceTimersByTime(1000);
        dispatcher.handleToken("j");
        dispatcher.handleToken("g");
        jest.advanceTimersByTime(1000);
        dispatcher.handleToken("g");
        expect(called).not.toHaveBeenCalled();
    });
});

describe("formatBinding", () => {
    it("renders a key sequence as one shortcut without separating spaces", () => {
        expect(formatBinding("g g")).toBe("gg");
        expect(formatBinding("] ]")).toBe("]]");
        expect(formatBinding("g $")).toBe("g$");
    });

    it("folds shift into an uppercase letter and keeps other modifier symbols", () => {
        expect(formatBinding("shift+f")).toBe("F");
        expect(formatBinding("y shift+f")).toBe("yF");
        expect(formatBinding("alt+f")).toBe("\u2325f");
        expect(formatBinding("ctrl+alt+d")).toBe("\u2303\u2325d");
    });

    it("names keys that have no printable character", () => {
        expect(formatBinding("esc")).toBe("Esc");
        expect(formatBinding("shift+space")).toBe("\u21e7Space");
    });

    it("returns an empty label for a missing binding", () => {
        expect(formatBinding("")).toBe("");
        expect(formatBinding(undefined)).toBe("");
    });
});
