/*
 * End-to-end tests run the real extension in Chromium. See tests/e2e/fixtures.js
 * for why, and DEVELOPERS.md for the one-time browser install.
 */
module.exports = {
    testDir: "tests/e2e",
    // Each test launches its own persistent context with the extension loaded,
    // which is heavy enough that parallel workers are not worth the flakiness.
    workers: 1,
    fullyParallel: false,
    timeout: 60000,
    reporter: [["list"]],
    use: {
        channel: "chromium",
        headless: true
    }
};
