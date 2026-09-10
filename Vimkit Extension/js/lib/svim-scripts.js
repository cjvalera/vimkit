/*
 * Code in this file is taken from sVim, it has been adjusted to
 * work with Vimkit.
 * Assumes global variable: settings.
 */

let animationFrame = null;

// `target` is the nested scroller resolved at keypress time, or null/undefined
// for the document.
function currentSettings() {
    if (typeof settings !== "undefined" && settings) return settings;
    return (typeof globalThis !== "undefined" && globalThis.settings) || undefined;
}

function customScrollBy(x, y, target) {
    const active = currentSettings();

    function scrollBy(dx, dy) {
        if (target) {
            if (dx) target.scrollLeft += dx;
            if (dy) target.scrollTop += dy;
            return;
        }
        window.scrollBy(dx, dy);
    }

    // If smooth scroll is off then use regular scroll
    if (active == undefined || active.smoothScroll === undefined || !active.smoothScroll) {
        scrollBy(x, y);
        return;
    }
    window.cancelAnimationFrame(animationFrame);

    // Smooth scroll
    let i = 0;
    let delta = 0;

    // Ease function
    function easeOutExpo(t, b, c, d) {
        return c * (-Math.pow(2, -10 * t / d) + 1) + b;
    }

    // Animate the scroll
    function animLoop() {
        const toScroll = Math.round(easeOutExpo(i, 0, y, active.scrollDuration) - delta);
        if (toScroll !== 0) {
            if (y) {
                scrollBy(0, toScroll);
            } else {
                scrollBy(toScroll, 0);
            }
        }

        if (i < active.scrollDuration) {
            animationFrame = window.requestAnimationFrame(animLoop);
        }

        delta = easeOutExpo(i, 0, (x || y), active.scrollDuration);
        i += 1;
    }

    // Start scroll
    animLoop();
}

if (typeof module !== "undefined") {
    module.exports = { customScrollBy: customScrollBy };
    global.customScrollBy = customScrollBy;
}
