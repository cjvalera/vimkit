const { test, expect, settle } = require("./fixtures");
const defaults = require("../../Vimkit Extension/json/defaultSettings.json");

// Real typing matters here: the first "j" genuinely lands in the field before
// the second one arrives, which jsdom cannot reproduce.
const PAGE = `<!doctype html><meta charset="utf-8"><title>fields</title>
<style>.tall { height: 4000px }</style>
<input id="field"><div id="editor" contenteditable="true">x</div><div class="tall"></div>`;

const state = page => page.evaluate(() => ({
    value: document.getElementById("field").value,
    editor: document.getElementById("editor").textContent,
    focused: document.activeElement && document.activeElement.id
}));

test.describe("leaving insert mode with jj", () => {
    // exitInsertMode is opt-in; setSettings is shallow, so pass every binding.
    const bindJj = vimkit => vimkit.setSettings({ bindings: Object.assign({}, defaults.bindings, { exitInsertMode: "jj" }) });

    test("is off by default", async ({ vimkit }) => {
        const { page } = vimkit;
        await vimkit.open(PAGE);
        await page.click("#field");
        await page.keyboard.type("hajj", { delay: 40 });
        await settle(page, 300);

        expect(await state(page)).toMatchObject({ value: "hajj", focused: "field" });
    });

    test("removes the first j and blurs the field", async ({ vimkit }) => {
        const { page } = vimkit;
        await vimkit.open(PAGE);
        await bindJj(vimkit);
        await page.click("#field");
        await page.keyboard.type("hajj", { delay: 40 });
        await settle(page, 300);

        expect(await state(page)).toMatchObject({ value: "ha", focused: "" });
        // Back in normal mode, j scrolls again.
        await page.keyboard.press("j");
        await settle(page);
        expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    });

    test("keeps a slow jj as text", async ({ vimkit }) => {
        const { page } = vimkit;
        await vimkit.open(PAGE);
        await bindJj(vimkit);
        await page.click("#field");
        await page.keyboard.press("j");
        await page.waitForTimeout(400);
        await page.keyboard.press("j");
        await settle(page, 300);

        expect(await state(page)).toMatchObject({ value: "jj", focused: "field" });
    });

    test("works in a contenteditable editor", async ({ vimkit }) => {
        const { page } = vimkit;
        await vimkit.open(PAGE);
        await bindJj(vimkit);
        await page.click("#editor");
        await page.keyboard.press("End");
        await page.keyboard.type("yjj", { delay: 40 });
        await settle(page, 300);

        expect(await state(page)).toMatchObject({ editor: "xy", focused: "" });
    });
});
