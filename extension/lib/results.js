import { MAX_RESULTS_PER_PLATFORM } from './timeouts.js';

/** Fields that must never appear on Cogis pointer records. */
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
 * Convert Unix seconds (number or numeric string) to ISO-8601, or null.
 * @param {unknown} value
 * @returns {string|null}
 */
export function unixSecondsToIso(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  // Heuristic: ms vs seconds
  const ms = n > 1e12 ? n : n * 1000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
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
 * Build ChatGPT deep link from conversation id.
 * @param {string} id
 * @returns {string|null}
 */
export function chatgptDeepLink(id) {
  if (typeof id !== 'string') return null;
  const trimmed = id.trim();
  if (!trimmed) return null;
  return `https://chatgpt.com/c/${encodeURIComponent(trimmed)}`;
}

/**
 * Normalize a single ChatGPT search hit into a Cogis pointer record.
 * Accepts common field aliases from reverse-eng / live shapes.
 * @param {Record<string, unknown>} raw
 * @returns {import('./messaging.js').PointerRecord|null}
 */
export function normalizeChatgptHit(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const safe = stripForbiddenFields(raw);
  const id =
    (typeof safe.id === 'string' && safe.id) ||
    (typeof safe.conversation_id === 'string' && safe.conversation_id) ||
    (typeof safe.conversationId === 'string' && safe.conversationId) ||
    null;

  const titleRaw = safe.title ?? safe.name ?? safe.conversation_title;
  const title = typeof titleRaw === 'string' && titleRaw.trim() ? titleRaw.trim() : null;
  if (!id || !title) return null;

  const dateIso =
    unixSecondsToIso(safe.update_time) ??
    unixSecondsToIso(safe.updateTime) ??
    unixSecondsToIso(safe.create_time) ??
    unixSecondsToIso(safe.createTime);

  const pointer = {
    platform: 'chatgpt',
    title,
    dateIso,
    deepLinkUrl: chatgptDeepLink(id),
    prefillSupported: false,
  };

  if (pointerHasForbiddenFields(pointer)) {
    return null;
  }
  return pointer;
}

/**
 * Extract item array from ChatGPT search JSON (shape may drift).
 * @param {unknown} payload
 * @returns {Record<string, unknown>[]}
 */
export function extractChatgptSearchItems(payload) {
  if (!payload || typeof payload !== 'object') return [];
  const obj = /** @type {Record<string, unknown>} */ (payload);

  if (Array.isArray(obj.items)) return obj.items.filter((x) => x && typeof x === 'object');
  if (Array.isArray(obj.data)) return obj.data.filter((x) => x && typeof x === 'object');
  if (Array.isArray(obj.conversations))
    return obj.conversations.filter((x) => x && typeof x === 'object');
  if (Array.isArray(obj.results)) return obj.results.filter((x) => x && typeof x === 'object');
  if (Array.isArray(payload)) return payload.filter((x) => x && typeof x === 'object');
  return [];
}

/**
 * Normalize a full ChatGPT search response into capped pointers.
 * @param {unknown} payload
 * @param {{ max?: number }} [opts]
 * @returns {import('./messaging.js').PointerRecord[]}
 */
export function normalizeChatgptSearchResponse(payload, opts = {}) {
  const max = opts.max ?? MAX_RESULTS_PER_PLATFORM;
  const items = extractChatgptSearchItems(payload);
  const pointers = [];
  for (const item of items) {
    const p = normalizeChatgptHit(item);
    if (p) pointers.push(p);
    if (pointers.length >= max) break;
  }
  return pointers;
}
