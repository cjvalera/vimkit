/*
 * Loads Vimkit into a real browser engine.
 *
 * Jest runs the content scripts in jsdom, which has no layout and no real key
 * delivery, so anything that depends on geometry, focus or event propagation
 * has to be exercised here instead. Playwright cannot load extensions into
 * WebKit, so this runs in Chromium: it is a real engine, but it is not Safari
 * or Orion, and a release still needs the manual pass in DEVELOPERS.md.
 */

const { test: base, chromium, expect } = require("@playwright/test");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const SOURCE_ROOT = path.join(__dirname, "..", "..", "Vimkit Extension");

/*
 * Xcode copies every resource to the bundle root, so the manifest refers to
 * bare filenames. Reproduce that layout in a temporary directory rather than
 * pointing Chromium at the source tree, which is nested.
 */
function flattenBundle() {
    const target = fs.mkdtempSync(path.join(os.tmpdir(), "vimkit-bundle-"));
    const sources = ["js", "js/lib", "css", "json"].flatMap(function (directory) {
        const absolute = path.join(SOURCE_ROOT, directory);
        return fs.readdirSync(absolute)
            .filter(function (name) { return fs.statSync(path.join(absolute, name)).isFile(); })
            .map(function (name) { return path.join(absolute, name); });
    });
    sources.concat(["manifest.json", "options.html", "options.js", "options.css"]
        .map(function (name) { return path.join(SOURCE_ROOT, name); }))
        .forEach(function (source) {
            const name = path.basename(source);
            // mocks.js is test-only and is not shipped in the real bundle either.
            if (name === "mocks.js" || !fs.existsSync(source)) return;
            fs.copyFileSync(source, path.join(target, name));
        });

    // Chromium rejects Safari's browser_specific_settings, and the icon files
    // the manifest names are produced by Xcode rather than checked in.
    const manifestPath = path.join(target, "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    delete manifest.browser_specific_settings;
    delete manifest.icons;
    delete manifest.action;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    return target;
}

/*
 * Content scripts do not run on data: URLs, so every fixture needs an origin.
 */
async function startServer(html) {
    const server = http.createServer(function (_request, response) {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(html);
    });
    await new Promise(function (resolve) { server.listen(0, "127.0.0.1", resolve); });
    return {
        url: `http://127.0.0.1:${server.address().port}/`,
        close: function () { return new Promise(function (resolve) { server.close(resolve); }); }
    };
}

/*
 * `vimkit` gives a test a page with the extension loaded and settled, the
 * service worker for driving settings and tabs, and `setSettings` for
 * overriding the defaults the way the options page would.
 */
const test = base.extend({
    // eslint-disable-next-line no-empty-pattern
    vimkit: async ({}, use) => {
        const bundle = flattenBundle();
        const profile = fs.mkdtempSync(path.join(os.tmpdir(), "vimkit-profile-"));
        const context = await chromium.launchPersistentContext(profile, {
            channel: "chromium",
            headless: true,
            args: [`--disable-extensions-except=${bundle}`, `--load-extension=${bundle}`]
        });

        const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
        const page = context.pages()[0] || await context.newPage();
        let server = null;

        const helpers = {
            context: context,
            page: page,
            worker: worker,

            async open(html) {
                if (server) await server.close();
                server = await startServer(html);
                await page.goto(server.url);
                await settle(page);
                return server.url;
            },

            // Writes a full settings object the way VimkitSettings.save would,
            // then waits for the content script's storage listener to rebind.
            async setSettings(overrides) {
                await worker.evaluate(async (values) => {
                    const defaults = await (await fetch(chrome.runtime.getURL("defaultSettings.json"))).json();
                    await chrome.storage.local.set({ settings: Object.assign(defaults, values) });
                }, overrides);
                await settle(page);
            },

            hints() {
                return page.evaluate(() => Array.from(document.querySelectorAll("#vimiumHintMarkerContainer > div"))
                    .filter(marker => marker.style.display !== "none")
                    .map(marker => ({
                        hint: marker.getAttribute("hintString"),
                        text: marker.getAttribute("hintText")
                    })));
            }
        };

        await use(helpers);

        if (server) await server.close();
        await context.close();
        fs.rmSync(bundle, { recursive: true, force: true });
        fs.rmSync(profile, { recursive: true, force: true });
    }
});

/*
 * Smooth scrolling animates over `scrollDuration` frames and the settings
 * listener rebinds asynchronously, so tests wait rather than assert instantly.
 */
async function settle(page, ms = 600) {
    await page.waitForTimeout(ms);
}

module.exports = { test, expect, settle, flattenBundle };
