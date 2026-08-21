/** @typedef {'full-text' | 'title-match'} Capability */

/**
 * @typedef {object} PlatformDef
 * @property {string} id
 * @property {string} label
 * @property {Capability} capability
 * @property {string} origin
 * @property {string} loginUrl
 * @property {string[]} hostPatterns
 */

/**
 * Registered lab adapters. Empty until each lab's live contract is verified
 * and its adapter lands — see the restart plan. Populated one lab at a time.
 * @type {Record<string, PlatformDef>}
 */
export const PLATFORMS = {};

/** UI group order for implemented platforms, filled in as adapters land. */
export const PLATFORM_ORDER = [];

export const FOOTNOTE_TEXT = 'Some AIs do not support full-text search.';

/**
 * @param {string} id
 * @returns {PlatformDef|null}
 */
export function getPlatform(id) {
  return PLATFORMS[id] ?? null;
}

/**
 * @param {string} platformId
 */
export function loginRequiredCopy(platformId) {
  const platform = getPlatform(platformId);
  const name = platform?.label ?? platformId;
  return `Please log in to ${name}`;
}

/**
 * @param {string} platformId
 */
export function unavailableCopy(platformId) {
  const platform = getPlatform(platformId);
  const name = platform?.label ?? platformId;
  return `${name} is temporarily unavailable.`;
}
