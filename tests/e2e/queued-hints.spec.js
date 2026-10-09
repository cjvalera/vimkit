const { test, expect, settle } = require("./fixtures");

// The menu only exists after its button is clicked, the way YouTube's quality
// menu does, so walking it needs hints that come back after an in-place click.
const PAGE = `<!doctype html><meta charset="utf-8"><title>menu</title>
<button id="open">Settings</button>
<div id="menu"></div>
<script>
  window.__picked = [];
  document.getElementById("open").addEventListener("click", () => {
    const item = document.createElement("button");
    item.textContent = "Quality";
    item.addEventListener("click", () => window.__picked.push("Quality"));
    document.getElementById("menu").appendChild(item);
  });
</script>`;

const hintFor = async (vimkit, text) => (await vimkit.hints()).find(hint => hint.text === text).hint;

test("⌥f clicks buttons in place and keeps hinting what they reveal", async ({ vimkit }) => {
    const { page } = vimkit;
    await vimkit.open(PAGE);
    await page.keyboard.press("Alt+f");
    await settle(page, 300);
    await page.keyboard.type(await hintFor(vimkit, "settings"));
    await settle(page, 300);

    await page.keyboard.type(await hintFor(vimkit, "quality"));
    await settle(page, 300);
    expect(await page.evaluate(() => window.__picked)).toEqual(["Quality"]);
    // Still in hint mode until Escape.
    expect((await vimkit.hints()).length).toBeGreaterThan(0);
    await page.keyboard.press("Escape");
    expect(await vimkit.hints()).toEqual([]);
});
