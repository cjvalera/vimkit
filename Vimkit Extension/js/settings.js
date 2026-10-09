var VimkitSettings = (function () {
    "use strict";

    var defaultSettingsPromise;

    function isPlainObject(value) {
        return value !== null && typeof value === "object" && !Array.isArray(value);
    }

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function merge(defaults, candidate) {
        var supplied = isPlainObject(candidate) ? candidate : {};
        var merged = Object.assign({}, clone(defaults), supplied);
        merged.bindings = Object.assign({}, defaults.bindings, isPlainObject(supplied.bindings) ? supplied.bindings : {});
        merged.excludedKeys = clone(Array.isArray(merged.excludedKeys) ? merged.excludedKeys : (defaults.excludedKeys || []));
        return merged;
    }

    function validate(candidate, defaults) {
        if (!isPlainObject(candidate)) {
            return { valid: false, errors: ["Settings must be a JSON object."] };
        }

        var value = merge(defaults, candidate);
        var errors = [];
        var stringKeys = ["excludedUrls", "linkHintCharacters", "openTabUrl", "modifier"];
        var booleanKeys = ["detectByCursorStyle", "filterLinkHints", "smoothScroll", "transparentBindings"];
        var numberKeys = ["scrollSize", "scrollDuration"];

        if (Object.prototype.hasOwnProperty.call(candidate, "bindings") && !isPlainObject(candidate.bindings)) {
            errors.push("bindings must be a JSON object.");
        }

        stringKeys.forEach(function (key) {
            if (typeof value[key] !== "string") {
                errors.push(`${key} must be a string.`);
            }
        });

        booleanKeys.forEach(function (key) {
            if (typeof value[key] !== "boolean") {
                errors.push(`${key} must be true or false.`);
            }
        });

        numberKeys.forEach(function (key) {
            if (typeof value[key] !== "number" || !Number.isFinite(value[key]) || value[key] < 0) {
                errors.push(`${key} must be a non-negative number.`);
            }
        });

        if (typeof value.hintFontSize !== "number" || !(value.hintFontSize >= 6 && value.hintFontSize <= 72)) {
            errors.push("hintFontSize must be a number from 6 to 72.");
        }

        // These become CSS custom properties on every page, so they are typed
        // values rather than free-form CSS.
        ["hintTextColor", "hintBackgroundColor", "hintBorderColor"].forEach(function (key) {
            if (typeof value[key] !== "string" || !/^(#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8}))?$/i.test(value[key])) {
                errors.push(`${key} must be a hex colour such as #feda31, or empty.`);
            }
        });

        if (typeof value.linkHintCharacters === "string" && value.linkHintCharacters.length < 2) {
            errors.push("linkHintCharacters must contain at least two characters.");
        }

        if (Object.prototype.hasOwnProperty.call(candidate, "excludedKeys") && !Array.isArray(candidate.excludedKeys)) {
            errors.push("excludedKeys must be an array.");
        } else if (Array.isArray(value.excludedKeys)) {
            value.excludedKeys.forEach(function (rule, index) {
                if (!isPlainObject(rule)) {
                    errors.push(`excludedKeys[${index}] must be a JSON object.`);
                    return;
                }
                if (typeof rule.pattern !== "string" || !rule.pattern.trim()) {
                    errors.push(`excludedKeys[${index}].pattern must be a non-empty string.`);
                }
                var validKeys = Array.isArray(rule.keys) && rule.keys.length > 0 && rule.keys.every(function (key) {
                    return typeof key === "string" && key.trim().length > 0;
                });
                if (!validKeys) {
                    errors.push(`excludedKeys[${index}].keys must be a non-empty array of non-empty strings.`);
                }
            });
        }

        if (Object.prototype.hasOwnProperty.call(candidate, "sites") && !Array.isArray(candidate.sites)) {
            errors.push("sites must be an array.");
        } else if (Array.isArray(value.sites)) {
            value.sites.forEach(function (site, index) {
                var where = `sites[${index}]`;
                if (!isPlainObject(site)) {
                    errors.push(`${where} must be a JSON object.`);
                    return;
                }
                if (typeof site.pattern !== "string" || !site.pattern.trim()) {
                    errors.push(`${where}.pattern must be a non-empty string.`);
                }
                if (!isPlainObject(site.settings)) {
                    errors.push(`${where}.settings must be a JSON object.`);
                    return;
                }
                Object.keys(site.settings).forEach(function (key) {
                    if (key === "sites" || !Object.prototype.hasOwnProperty.call(defaults, key)) {
                        errors.push(`${where}.settings.${key} is not a setting a site can override.`);
                    }
                });
                // A site's overrides follow the same type rules as the globals.
                validate(site.settings, defaults).errors.forEach(function (error) {
                    errors.push(`${where}.settings: ${error}`);
                });
            });
        }

        if (isPlainObject(value.bindings)) {
            Object.keys(value.bindings).forEach(function (action) {
                var binding = value.bindings[action];
                var validString = typeof binding === "string" && binding.trim().length > 0;
                var validArray = Array.isArray(binding) && binding.length > 0 && binding.every(function (item) {
                    return typeof item === "string" && item.trim().length > 0;
                });

                if (!validString && !validArray) {
                    errors.push(`bindings.${action} must be a non-empty string or array of non-empty strings.`);
                }
            });
        }

        return { valid: errors.length === 0, errors: errors, value: value };
    }

    function loadDefaults() {
        if (!defaultSettingsPromise) {
            defaultSettingsPromise = fetch(browser.runtime.getURL("defaultSettings.json"))
                .then(function (response) {
                    if (!response.ok) {
                        throw new Error(`Unable to load default settings (${response.status}).`);
                    }
                    return response.json();
                });
        }

        return defaultSettingsPromise.then(clone);
    }

    async function load() {
        var defaults = await loadDefaults();
        var stored = await browser.storage.local.get("settings");
        return merge(defaults, stored.settings);
    }

    async function save(candidate) {
        var defaults = await loadDefaults();
        var result = validate(candidate, defaults);
        if (!result.valid) {
            throw new Error(result.errors.join("\n"));
        }

        await browser.storage.local.set({ settings: result.value });
        return clone(result.value);
    }

    async function reset() {
        var defaults = await loadDefaults();
        await browser.storage.local.set({ settings: defaults });
        return clone(defaults);
    }

    function subscribe(listener) {
        var handler = function (changes, areaName) {
            if (areaName === "local" && changes.settings) {
                load().then(listener).catch(function (error) {
                    console.error("Unable to reload Vimkit settings:", error);
                });
            }
        };

        browser.storage.onChanged.addListener(handler);
        return function () {
            browser.storage.onChanged.removeListener(handler);
        };
    }

    return {
        load: load,
        loadDefaults: loadDefaults,
        merge: merge,
        reset: reset,
        save: save,
        subscribe: subscribe,
        validate: validate
    };
})();

if (typeof module !== "undefined") {
    module.exports = VimkitSettings;
    global.VimkitSettings = VimkitSettings;
}
