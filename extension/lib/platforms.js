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

/** @type {Record<string, PlatformDef>} */
export const PLATFORMS = {
  chatgpt: {
    id: 'chatgpt',
    label: 'ChatGPT',
    capability: 'full-text',
    origin: 'https://chatgpt.com',
    loginUrl: 'https://chatgpt.com/',
    hostPatterns: ['https://chatgpt.com/*', 'https://chat.openai.com/*'],
  },
};

/** UI group order for implemented platforms (M1: ChatGPT only). */
export const PLATFORM_ORDER = ['chatgpt'];

export const FOOTNOTE_TEXT = 'Some AIs do not support full-text search.';

export function getPlatform(id) {
  return PLATFORMS[id] ?? null;
}

export function loginRequiredCopy(platformId) {
  const platform = getPlatform(platformId);
  const name = platform?.label ?? platformId;
  return `Please log in to ${name}`;
}

export function unavailableCopy(platformId) {
  const platform = getPlatform(platformId);
  const name = platform?.label ?? platformId;
  return `${name} is temporarily unavailable.`;
}
