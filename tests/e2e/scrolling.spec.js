const { test, expect, settle } = require("./fixtures");

// A nested scroller, the shape Gmail, Slack and Linear use. The focus anchor is
// deliberately a tabindex div: focusing an <input> puts Vimkit into insert mode
// and the keystrokes go to the field instead of the extension.
const PANE_PAGE = `<!doctype html><meta charset="utf-8"><title>pane</title>
<style>
  html, body { margin: 0; height: 100% }
  #pane { position: absolute; inset: 0; overflow-y: auto }
  .tall { height: 5000px; background: linear-gradient(#eee, #333) }
</style>
<div id="pane"><div id="anchor" tabindex="0">anchor</div><div class="tall">content</div></div>`;

const PLAIN_PAGE = `<!doctype html><meta charset="utf-8"><title>plain</title>
<style>body { margin: 0 } .tall { height: 8000px; background: linear-gradient(#fff, #000) }</style>
<a href="#one">one</a> <a href="#two">two</a><div class="tall">plain document</div>`;

const paneTop = page => page.evaluate(() => document.getElementById("pane").scrollTop);
const resetPane = page => page.evaluate(() => { document.getElementById("pane").scrollTop = 0; });

test.describe("scrolling a nested pane", () => {
    test("scrolls the pane holding the focused element, not the document", async ({ vimkit }) => {
        const { page } = vimkit;
        await vimkit.open(PANE_PAGE);
        await page.focus("#anchor");

        await page.keyboard.press("j");
        await settle(page);

        expect(await paneTop(page)).toBeGreaterThan(0);
        expect(await page.evaluate(() => window.scrollY)).toBe(0);
    });

    test("falls back to the pane under the viewport centre when nothing is focused", async ({ vimkit }) => {
        const { page } = vimkit;
        await vimkit.open(PANE_PAGE);
        await page.evaluate(() => document.getElementById("anchor").blur());
        await resetPane(page);

        await page.keyboard.press("j");
        await settle(page);

        expect(await paneTop(page)).toBeGreaterThan(0);
    });

    test("measures a half page against the pane rather than the window", async ({ vimkit }) => {
        const { page } = vimkit;
        await vimkit.open(PANE_PAGE);
        await resetPane(page);

        await page.keyboard.press("d");
        await settle(page);

        const half = await page.evaluate(() => document.getElementById("pane").clientHeight / 2);
        expect(Math.abs(await paneTop(page) - half)).toBeLessThan(12);
    });

    test("G and gg reach the pane's ends", async ({ vimkit }) => {
        const { page } = vimkit;
        await vimkit.open(PANE_PAGE);
        await resetPane(page);

        await page.keyboard.press("Shift+G");
        await settle(page, 1000);
        expect(await page.evaluate(() => {
            const pane = document.getElementById("pane");
            return pane.scrollTop >= pane.scrollHeight - pane.clientHeight - 2;
        })).toBe(true);

        await page.keyboard.press("g");
        await page.keyboard.press("g");
        await settle(page, 1000);
        expect(await paneTop(page)).toBeLessThan(2);
    });

    test("a pane already at its end does not move further", async ({ vimkit }) => {
        const { page } = vimkit;
        await vimkit.open(PANE_PAGE);
        await page.keyboard.press("Shift+G");
        await settle(page, 1000);
        const before = await paneTop(page);

        await page.keyboard.press("j");
        await settle(page);

        expect(await paneTop(page)).toBeLessThanOrEqual(before + 1);
    });
});

test.describe("scrolling a plain document", () => {
    test("keeps working when nothing nested can scroll", async ({ vimkit }) => {
        const { page } = vimkit;
        await vimkit.open(PLAIN_PAGE);

        await page.keyboard.press("j");
        await settle(page);
        const afterLine = await page.evaluate(() => window.scrollY);
        expect(afterLine).toBeGreaterThan(0);

        await page.keyboard.press("d");
        await settle(page);
        expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(afterLine);

        await page.keyboard.press("Shift+G");
        await settle(page, 1200);
        expect(await page.evaluate(
            () => window.scrollY >= document.body.scrollHeight - window.innerHeight - 4
        )).toBe(true);

        await page.keyboard.press("g");
        await page.keyboard.press("g");
        await settle(page, 1200);
        expect(await page.evaluate(() => window.scrollY)).toBeLessThan(2);
    });

    test("still renders link hints", async ({ vimkit }) => {
        const { page } = vimkit;
        await vimkit.open(PLAIN_PAGE);

        await page.keyboard.press("f");
        await settle(page, 400);

        expect((await vimkit.hints()).length).toBe(2);
    });
});
