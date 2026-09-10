const { test, expect, settle } = require("./fixtures");

// The last link has no text at all, so it is only reachable through its
// aria-label — the case the digit hints exist as an escape hatch for.
const PAGE = `<!doctype html><meta charset="utf-8"><title>links</title>
<style>body { margin: 0; font: 16px system-ui } a { display: block; padding: 6px }</style>
<a href="/alpha">Alpha</a>
<a href="/beta">Beta</a>
<a href="/alphabet">Alphabet</a>
<a href="/settings" aria-label="Settings"><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" width="24" height="24"></a>`;

test.describe("filterLinkHints", () => {
    test.beforeEach(async ({ vimkit }) => {
        await vimkit.open(PAGE);
        await vimkit.setSettings({ filterLinkHints: true });
    });

    test("numbers the hints and narrows them by typed link text", async ({ vimkit }) => {
        const { page } = vimkit;
        await page.keyboard.press("f");
        await settle(page, 400);

        expect(await vimkit.hints()).toEqual([
            { hint: "1", text: "alpha" },
            { hint: "2", text: "beta" },
            { hint: "3", text: "alphabet" },
            { hint: "4", text: "settings" }
        ]);

        await page.keyboard.press("a");
        await page.keyboard.press("l");
        await settle(page, 300);

        // The survivors are renumbered, so a single digit stays in reach.
        expect(await vimkit.hints()).toEqual([
            { hint: "1", text: "alpha" },
            { hint: "2", text: "alphabet" }
        ]);
    });

    test("backspace unwinds the filter instead of leaving hint mode", async ({ vimkit }) => {
        const { page } = vimkit;
        await page.keyboard.press("f");
        await settle(page, 400);

        await page.keyboard.press("a");
        await page.keyboard.press("l");
        await settle(page, 300);
        await page.keyboard.press("Backspace");
        await page.keyboard.press("Backspace");
        await settle(page, 300);

        expect(await vimkit.hints()).toHaveLength(4);
    });

    test("reaches an icon-only link through its aria-label and follows it", async ({ vimkit }) => {
        const { page } = vimkit;
        await page.keyboard.press("f");
        await settle(page, 400);

        await page.keyboard.press("s");
        await page.keyboard.press("e");
        await settle(page, 300);
        expect(await vimkit.hints()).toEqual([{ hint: "1", text: "settings" }]);

        await page.keyboard.press("1");
        await settle(page, 900);
        expect(page.url()).toMatch(/\/settings$/);
    });

    test("returns to character hints when the setting is off", async ({ vimkit }) => {
        const { page } = vimkit;
        await vimkit.setSettings({ filterLinkHints: false });

        await page.keyboard.press("f");
        await settle(page, 400);

        const hints = await vimkit.hints();
        expect(hints).toHaveLength(4);
        expect(hints.every(marker => /^[asdfjklqwerzxc]+$/.test(marker.hint))).toBe(true);
    });
});
