/**
 * Generic pointer-record helpers shared by every lab adapter. Platform-specific
 * parsing (field aliases, deep-link formats) lives in each lab's own
 * `lib/<lab>-adapter.js`, not here — this file only knows the common shape
 * and the privacy backstop.
 */

/** Fields that must never appear on a Cogis pointer record. */
export const FORBIDDEN_BODY_KEYS = Object.freeze([
  'mapping',
  'message',
  'messages',
  'content',
  'parts',
  'snippet',
  'body',
  'accessToken',
  'access_token',
  'authorization',
  'cookie',
  'cookies',
  'token',
]);

/**
 * Convert Unix seconds or milliseconds (number or numeric string) to
 * ISO-8601, or null.
 * @param {unknown} value
 * @returns {string|null}
 */
export function unixTimeToIso(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  const ms = n > 1e12 ? n : n * 1000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * Parse an ISO-string-or-unix value into ISO-8601, or null.
 * @param {unknown} value
 * @returns {string|null}
 */
export function anyDateToIso(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' || (typeof value === 'string' && /^\d+(\.\d+)?$/.test(value))) {
    return unixTimeToIso(value);
  }
  if (typeof value === 'string') {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  }
  return null;
}

/**
 * Strip forbidden body/token fields from a shallow object (does not mutate input).
 * @param {Record<string, unknown>|null|undefined} raw
 * @returns {Record<string, unknown>}
 */
export function stripForbiddenFields(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (FORBIDDEN_BODY_KEYS.includes(key)) continue;
    out[key] = value;
  }
  return out;
}

/**
 * True if a normalized pointer accidentally retained a forbidden key.
 * @param {Record<string, unknown>} pointer
 */
export function pointerHasForbiddenFields(pointer) {
  if (!pointer || typeof pointer !== 'object') return false;
  return FORBIDDEN_BODY_KEYS.some((k) => Object.prototype.hasOwnProperty.call(pointer, k));
}

/**
 * Client-side title substring filter, for title-match platforms.
 * @param {import('./messaging.js').PointerRecord[]} pointers
 * @param {string} query
 */
export function filterPointersByTitle(pointers, query) {
  const q = String(query || '')
    .trim()
    .toLowerCase();
  if (!q) return pointers;
  return pointers.filter((p) => typeof p.title === 'string' && p.title.toLowerCase().includes(q));
}

/**
 * Deduplicate pointers by deepLinkUrl (or title fallback), preserving order.
 * @param {import('./messaging.js').PointerRecord[]} pointers
 * @param {number} max
 */
export function dedupePointers(pointers, max) {
  const seen = new Set();
  const out = [];
  for (const p of pointers) {
    if (!p) continue;
    const key = p.deepLinkUrl || `title:${p.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
    if (typeof max === 'number' && out.length >= max) break;
  }
  return out;
}

/**
 * Click cascade href: deep link → prefill URL (if supported) → lab home.
 * @param {import('./messaging.js').PointerRecord|null|undefined} hit
 * @param {string|null|undefined} prefillUrl
 * @param {string} homeUrl
 */
export function resolveResultHref(hit, prefillUrl, homeUrl) {
  if (hit?.deepLinkUrl) return hit.deepLinkUrl;
  if (hit?.prefillSupported && prefillUrl) return prefillUrl;
  return homeUrl;
}
