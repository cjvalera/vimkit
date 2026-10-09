const { test, expect, settle } = require("./fixtures");

const PAGE = `<!doctype html><meta charset="utf-8"><title>style</title>
<a href="/one">One</a>`;

const markerStyle = page => page.evaluate(() => {
    const marker = document.querySelector("#vimiumHintMarkerContainer > div");
    const style = getComputedStyle(marker);
    return {
        fontSize: style.fontSize,
        background: style.backgroundColor,
        text: getComputedStyle(marker.firstChild).color,
        shadow: style.boxShadow
    };
});

test.describe("hint marker style", () => {
    test("keeps the stylesheet's look with the default settings", async ({ vimkit }) => {
        const { page } = vimkit;
        await vimkit.open(PAGE);
        await page.keyboard.press("f");
        await settle(page, 300);

        const style = await markerStyle(page);
        expect(style.fontSize).toBe("11px");
        expect(style.background).toBe("rgb(254, 218, 49)");
        expect(style.text).toBe("rgb(74, 64, 14)");
    });

    test("applies font size, colours and border from settings", async ({ vimkit }) => {
        const { page } = vimkit;
        await vimkit.open(PAGE);
        await vimkit.setSettings({
            hintFontSize: 20, hintTextColor: "#ffffff", hintBackgroundColor: "#000000", hintBorderColor: "#ff0000"
        });
        await page.keyboard.press("f");
        await settle(page, 300);

        const style = await markerStyle(page);
        expect(style.fontSize).toBe("20px");
        expect(style.background).toBe("rgb(0, 0, 0)");
        expect(style.text).toBe("rgb(255, 255, 255)");
        expect(style.shadow).toContain("rgb(255, 0, 0)");
    });
});
