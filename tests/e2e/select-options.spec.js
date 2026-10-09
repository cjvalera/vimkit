const { test, expect, settle } = require("./fixtures");

const PAGE = `<!doctype html><meta charset="utf-8"><title>form</title>
<select id="fruit"><option value="a">Apple</option><option value="b">Banana</option><option value="c">Cherry</option></select>
<script>
  window.__changes = [];
  document.getElementById("fruit").addEventListener("change", event => window.__changes.push(event.target.value));
</script>`;

test.describe("select boxes", () => {
    test("picks an option by filtering Vimkit's list and tells the page", async ({ vimkit }) => {
        const { page } = vimkit;
        await vimkit.open(PAGE);
        await page.keyboard.press("f");
        await settle(page, 300);
        await page.keyboard.type((await vimkit.hints())[0].hint);
        await settle(page, 300);

        await page.keyboard.type("ban");
        await page.keyboard.press("Enter");
        await settle(page, 300);

        expect(await page.evaluate(() => document.getElementById("fruit").value)).toBe("b");
        expect(await page.evaluate(() => window.__changes)).toEqual(["b"]);
        // The picker is gone and normal mode keys work again.
        expect(await page.evaluate(() => document.querySelector('[data-vimkit-overlay="tabs"]'))).toBeNull();
    });

    test("Escape leaves the select unchanged", async ({ vimkit }) => {
        const { page } = vimkit;
        await vimkit.open(PAGE);
        await page.keyboard.press("f");
        await settle(page, 300);
        await page.keyboard.type((await vimkit.hints())[0].hint);
        await settle(page, 300);
        await page.keyboard.press("Escape");
        await settle(page, 300);

        expect(await page.evaluate(() => document.getElementById("fruit").value)).toBe("a");
        expect(await page.evaluate(() => window.__changes)).toEqual([]);
    });
});
