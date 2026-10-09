const { test, expect, settle } = require("./fixtures");

// `rounded-full` in Tailwind is border-radius: 9999px. The computed style keeps
// the raw 9999px even though CSS shrinks it to half the box when drawing.
const PAGE = `<!doctype html><meta charset="utf-8"><title>pills</title>
<style>
  body { margin: 40px; font: 16px system-ui }
  .pill { border: 0; border-radius: 9999px; padding: 0 24px; height: 48px; background: #ddd }
  .circle { border: 0; border-radius: 50%; width: 56px; height: 56px; background: #ddd }
</style>
<button class="pill" id="pill">Subscribe</button>
<button class="circle" id="circle">+</button>`;

const markerBoxes = page => page.evaluate(() =>
    Array.from(document.querySelectorAll("#vimiumHintMarkerContainer > div")).map(marker => {
        const rect = marker.getBoundingClientRect();
        // clickableItem lives in the content script's isolated world, so match on hintText.
        return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, text: marker.getAttribute("hintText") };
    }));

const elementBox = (page, id) => page.evaluate(id => {
    const rect = document.getElementById(id).getBoundingClientRect();
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
}, id);

test.describe("hint placement", () => {
    test("hints a pill-shaped button and starts its marker on the visible edge", async ({ vimkit }) => {
        const { page } = vimkit;
        await vimkit.open(PAGE);
        await page.keyboard.press("f");
        await settle(page, 400);

        const pill = (await markerBoxes(page)).find(box => box.text === "subscribe");
        expect(pill).toBeDefined();
        const button = await elementBox(page, "pill");
        // A 48px pill has a 24px corner; the arc's 45° point is ~7px in.
        expect(pill.left).toBeGreaterThanOrEqual(button.left + 6);
        expect(pill.top).toBeGreaterThanOrEqual(button.top + 6);
    });

    test("keeps a circle's marker inside the circle", async ({ vimkit }) => {
        const { page } = vimkit;
        await vimkit.open(PAGE);
        await page.keyboard.press("f");
        await settle(page, 400);

        const circle = (await markerBoxes(page)).find(box => box.text === "+");
        const button = await elementBox(page, "circle");
        expect(circle.left).toBeGreaterThanOrEqual(button.left + 8);
        expect(circle.top).toBeGreaterThanOrEqual(button.top + 8);
    });
});
