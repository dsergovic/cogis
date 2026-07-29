import localPack from './local-pack.js';

/**
 * Load the bundled data-only selector pack.
 * M5 will merge optional remote data; V1 returns local only.
 * @returns {typeof localPack}
 */
export function loadSelectorPack() {
  return localPack;
}

/**
 * @param {string} platformId
 */
export function getPlatformSelectors(platformId) {
  const pack = loadSelectorPack();
  return pack.platforms?.[platformId] ?? null;
}

/**
 * Reject remote-looking executable payloads (M5 safeguard skeleton).
 * @param {unknown} payload
 * @returns {boolean} true if safe data-only shape
 */
export function isDataOnlyPack(payload) {
  if (!payload || typeof payload !== 'object') return false;
  const forbidden = ['script', 'scripts', 'eval', 'module', 'wasm', 'javascript'];
  const json = JSON.stringify(payload).toLowerCase();
  for (const key of forbidden) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) return false;
    if (json.includes(`"${key}":`)) return false;
  }
  return typeof (/** @type {{ version?: unknown }} */ (payload).version) === 'string';
}

export { localPack };
