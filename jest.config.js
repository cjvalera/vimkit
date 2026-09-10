module.exports = {
  testEnvironment: "jsdom",
  setupFiles: [
    "./Vimkit Extension/js/mocks.js",
    "./Vimkit Extension/js/lib/svim-scripts.js",
    "./Vimkit Extension/js/settings.js",
    "./Vimkit Extension/js/WebExtensionCommunicator.js",
    "./Vimkit Extension/js/command-dispatcher.js",
    "./Vimkit Extension/js/content-features.js",
    "./Vimkit Extension/js/keyboard-utils.js",
    "./Vimkit Extension/js/link-hints.js",
    "./Vimkit Extension/js/injected.js"
  ]
};
