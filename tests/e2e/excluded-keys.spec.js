const { test, expect, settle } = require("./fixtures");

// The page records what actually reaches it, which is the whole point of the
// feature: an excluded key must arrive here rather than being swallowed.
const PAGE = `<!doctype html><meta charset="utf-8"><title>keys</title>
<style>body { margin: 0 } .tall { height: 5000px }</style>
<div class="tall">page</div>
<script>
  window.__keys = [];
  document.addEventListener("keydown", event => window.__keys.push(event.key));
</script>`;

const pageKeys = page => page.evaluate(() => window.__keys);
const clear = page => page.evaluate(() => { window.__keys = []; window.scrollTo(0, 0); });

test.describe("excludedKeys", () => {
    test("hands the excluded key to the site and keeps the rest bound", async ({ vimkit }) => {
        const { page } = vimkit;
        await vimkit.open(PAGE);
        await vimkit.setSettings({ excludedKeys: [{ pattern: "127.0.0.1", keys: ["j"] }] });
        await clear(page);

        await page.keyboard.press("j");
        await settle(page);
        expect(await pageKeys(page)).toContain("j");
        expect(await page.evaluate(() => window.scrollY)).toBe(0);

        await page.evaluate(() => window.scrollTo(0, 400));
        await page.keyboard.press("k");
        await settle(page);
        expect(await page.evaluate(() => window.scrollY)).toBeLessThan(400);
    });

    test("still hands the key over with transparentBindings off", async ({ vimkit }) => {
        const { page } = vimkit;
        await vimkit.open(PAGE);
        await vimkit.setSettings({
            transparentBindings: false,
            excludedKeys: [{ pattern: "127.0.0.1", keys: ["j"] }]
        });
        await clear(page);

        await page.keyboard.press("j");
        await settle(page);
        expect(await pageKeys(page)).toContain("j");
        expect(await page.evaluate(() => window.scrollY)).toBe(0);

        // An ordinary unbound key must stay isolated from the page — that is
        // what transparentBindings: false is for.
        await clear(page);
        await page.keyboard.press("z");
        await settle(page, 400);
        expect(await pageKeys(page)).not.toContain("z");
    });

    test("does not apply on a site the pattern does not match", async ({ vimkit }) => {
        const { page } = vimkit;
        await vimkit.open(PAGE);
        await vimkit.setSettings({ excludedKeys: [{ pattern: "example.invalid", keys: ["j"] }] });
        await clear(page);

        await page.keyboard.press("j");
        await settle(page);
        expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    });
});
