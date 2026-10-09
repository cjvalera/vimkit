const { test, expect, settle } = require("./fixtures");

const PAGE = `<!doctype html><meta charset="utf-8"><title>long</title>
<style>body { margin: 0 } .tall { height: 6000px }</style><div class="tall"></div>`;

test("a matching site rule overrides the global scroll size", async ({ vimkit }) => {
    const { page } = vimkit;
    await vimkit.open(PAGE);
    await vimkit.setSettings({
        smoothScroll: false,
        sites: [
            { pattern: "example.invalid", settings: { scrollSize: 50 } },
            { pattern: "127.0.0.1", settings: { scrollSize: 700 } }
        ]
    });

    await page.keyboard.press("j");
    await settle(page, 300);
    expect(await page.evaluate(() => window.scrollY)).toBe(700);
});
