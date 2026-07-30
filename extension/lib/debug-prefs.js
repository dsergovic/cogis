import { DEFAULT_PING_OPT_IN } from './ping.js';

export const DEBUG_PREFS_STORAGE_KEY = 'cogisDebugPrefs';

/**
 * Tiny UI prefs only — never query text, titles, results, or message bodies.
 * @typedef {{ pingOptIn: boolean }} DebugPrefs
 */

/**
 * @returns {DebugPrefs}
 */
export function defaultDebugPrefs() {
  return { pingOptIn: DEFAULT_PING_OPT_IN };
}

/**
 * Strip unknown keys and coerce pingOptIn. Rejects any attempt to persist query-like fields.
 *
 * @param {unknown} raw
 * @returns {DebugPrefs}
 */
export function sanitizeDebugPrefs(raw) {
  const defaults = defaultDebugPrefs();
  if (!raw || typeof raw !== 'object') {
    return defaults;
  }
  const obj = /** @type {Record<string, unknown>} */ (raw);
  return {
    pingOptIn: obj.pingOptIn === true,
  };
}

/**
 * @param {{ get: (keys: string|string[]|object) => Promise<object> }} [storageArea]
 * @returns {Promise<DebugPrefs>}
 */
export async function loadDebugPrefs(storageArea) {
  const area = storageArea ?? globalThis.chrome?.storage?.local;
  if (!area?.get) {
    return defaultDebugPrefs();
  }
  const bag = await area.get(DEBUG_PREFS_STORAGE_KEY);
  return sanitizeDebugPrefs(bag?.[DEBUG_PREFS_STORAGE_KEY]);
}

/**
 * Persist only the opt-in flag. Never writes query text.
 *
 * @param {boolean} pingOptIn
 * @param {{ set: (items: object) => Promise<void> }} [storageArea]
 * @returns {Promise<DebugPrefs>}
 */
export async function savePingOptIn(pingOptIn, storageArea) {
  const area = storageArea ?? globalThis.chrome?.storage?.local;
  const prefs = sanitizeDebugPrefs({ pingOptIn: pingOptIn === true });
  if (!area?.set) {
    return prefs;
  }
  await area.set({ [DEBUG_PREFS_STORAGE_KEY]: prefs });
  return prefs;
}
