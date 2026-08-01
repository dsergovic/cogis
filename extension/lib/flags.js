/**
 * Default-off feature flags. A flag that reads `false` must leave zero
 * observable effect behind (hand-off §3.2 SD-1).
 */

/**
 * M8 web surface on cogis.ai. Off for M8a: the bridge content script loads,
 * registers nothing, and never posts to the page.
 *
 * Mirrored as an inline literal in `extension/content/web-bridge.js` — that
 * file is a flat classic content script with no imports, so it cannot read
 * this module. `tests/unit/web-bridge-flag-sync.test.js` keeps the two equal.
 */
export const WEB_SEARCH_SURFACE_ENABLED = true;
