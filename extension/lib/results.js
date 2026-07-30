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
 * True when payload looks like a ChatGPT search response we know how to read.
 * @param {unknown} payload
 */
export function isRecognizedSearchPayload(payload) {
  if (Array.isArray(payload)) return true;
  if (!payload || typeof payload !== 'object') return false;
  const obj = /** @type {Record<string, unknown>} */ (payload);
  return (
    Array.isArray(obj.items) ||
    Array.isArray(obj.data) ||
    Array.isArray(obj.conversations) ||
    Array.isArray(obj.results)
  );
}

/**
 * Extract item array from ChatGPT search JSON (shape may drift).
 * @param {unknown} payload
 * @returns {Record<string, unknown>[]}
 */
export function extractChatgptSearchItems(payload) {
  if (!isRecognizedSearchPayload(payload)) return [];
  if (Array.isArray(payload)) return payload.filter((x) => x && typeof x === 'object');
  const obj = /** @type {Record<string, unknown>} */ (payload);

  if (Array.isArray(obj.items)) return obj.items.filter((x) => x && typeof x === 'object');
  if (Array.isArray(obj.data)) return obj.data.filter((x) => x && typeof x === 'object');
  if (Array.isArray(obj.conversations))
    return obj.conversations.filter((x) => x && typeof x === 'object');
  if (Array.isArray(obj.results)) return obj.results.filter((x) => x && typeof x === 'object');
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

/**
 * Build Perplexity deep link from thread slug.
 * @param {string} slug
 * @returns {string|null}
 */
export function perplexityDeepLink(slug) {
  if (typeof slug !== 'string') return null;
  const trimmed = slug.trim().replace(/^\/+/, '');
  if (!trimmed) return null;
  return `https://www.perplexity.ai/search/${encodeURIComponent(trimmed)}`;
}

/**
 * Build Perplexity URL prefill.
 * @param {string} query
 * @returns {string|null}
 */
export function perplexityPrefillUrl(query) {
  if (typeof query !== 'string') return null;
  const trimmed = query.trim();
  if (!trimmed) return null;
  const url = new URL('https://www.perplexity.ai/search');
  url.searchParams.set('q', trimmed);
  return url.toString();
}

/**
 * Parse Perplexity last_query_datetime (ISO string or unix) to ISO-8601.
 * @param {unknown} value
 * @returns {string|null}
 */
export function perplexityDateToIso(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' || (typeof value === 'string' && /^\d+(\.\d+)?$/.test(value))) {
    return unixSecondsToIso(value);
  }
  if (typeof value === 'string') {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  }
  return null;
}

/**
 * True when payload looks like a Perplexity list_ask_threads response.
 * @param {unknown} payload
 */
export function isRecognizedPerplexityListPayload(payload) {
  if (Array.isArray(payload)) return true;
  if (!payload || typeof payload !== 'object') return false;
  const obj = /** @type {Record<string, unknown>} */ (payload);
  return (
    Array.isArray(obj.threads) ||
    Array.isArray(obj.items) ||
    Array.isArray(obj.data) ||
    Array.isArray(obj.results)
  );
}

/**
 * Extract item array from Perplexity list_ask_threads JSON.
 * @param {unknown} payload
 * @returns {Record<string, unknown>[]}
 */
export function extractPerplexityListItems(payload) {
  if (!isRecognizedPerplexityListPayload(payload)) return [];
  if (Array.isArray(payload)) return payload.filter((x) => x && typeof x === 'object');
  const obj = /** @type {Record<string, unknown>} */ (payload);
  if (Array.isArray(obj.threads)) return obj.threads.filter((x) => x && typeof x === 'object');
  if (Array.isArray(obj.items)) return obj.items.filter((x) => x && typeof x === 'object');
  if (Array.isArray(obj.data)) return obj.data.filter((x) => x && typeof x === 'object');
  if (Array.isArray(obj.results)) return obj.results.filter((x) => x && typeof x === 'object');
  return [];
}

/**
 * Normalize a single Perplexity thread list item into a Cogis pointer.
 * @param {Record<string, unknown>} raw
 * @returns {import('./messaging.js').PointerRecord|null}
 */
export function normalizePerplexityHit(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const safe = stripForbiddenFields(raw);
  const slug =
    (typeof safe.slug === 'string' && safe.slug) ||
    (typeof safe.url_slug === 'string' && safe.url_slug) ||
    (typeof safe.thread_slug === 'string' && safe.thread_slug) ||
    null;

  const titleRaw = safe.title ?? safe.name ?? safe.query_str;
  const title = typeof titleRaw === 'string' && titleRaw.trim() ? titleRaw.trim() : null;
  if (!slug || !title) return null;

  const dateIso =
    perplexityDateToIso(safe.last_query_datetime) ??
    perplexityDateToIso(safe.lastQueryDatetime) ??
    perplexityDateToIso(safe.updated) ??
    perplexityDateToIso(safe.updated_at);

  const pointer = {
    platform: 'perplexity',
    title,
    dateIso,
    deepLinkUrl: perplexityDeepLink(slug),
    prefillSupported: true,
  };

  if (pointerHasForbiddenFields(pointer)) {
    return null;
  }
  return pointer;
}

/**
 * Normalize a Perplexity list_ask_threads response into capped pointers.
 * @param {unknown} payload
 * @param {{ max?: number }} [opts]
 * @returns {import('./messaging.js').PointerRecord[]}
 */
export function normalizePerplexityListResponse(payload, opts = {}) {
  const max = opts.max ?? MAX_RESULTS_PER_PLATFORM;
  const items = extractPerplexityListItems(payload);
  const pointers = [];
  for (const item of items) {
    const p = normalizePerplexityHit(item);
    if (p) pointers.push(p);
    if (pointers.length >= max) break;
  }
  return pointers;
}

/**
 * Client-side title substring filter (title-match platforms).
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
 * Build Claude deep link from conversation uuid.
 * @param {string} uuid
 * @returns {string|null}
 */
export function claudeDeepLink(uuid) {
  if (typeof uuid !== 'string') return null;
  const trimmed = uuid.trim();
  if (!trimmed) return null;
  return `https://claude.ai/chat/${encodeURIComponent(trimmed)}`;
}

/**
 * Parse Claude created_at / updated_at (ISO string or unix) to ISO-8601.
 * @param {unknown} value
 * @returns {string|null}
 */
export function claudeDateToIso(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' || (typeof value === 'string' && /^\d+(\.\d+)?$/.test(value))) {
    return unixSecondsToIso(value);
  }
  if (typeof value === 'string') {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  }
  return null;
}

/**
 * True when payload looks like a Claude conversations / projects list.
 * @param {unknown} payload
 */
export function isRecognizedClaudeListPayload(payload) {
  if (Array.isArray(payload)) return true;
  if (!payload || typeof payload !== 'object') return false;
  const obj = /** @type {Record<string, unknown>} */ (payload);
  return (
    Array.isArray(obj.chat_conversations) ||
    Array.isArray(obj.conversations) ||
    Array.isArray(obj.items) ||
    Array.isArray(obj.data) ||
    Array.isArray(obj.results)
  );
}

/**
 * Extract conversation items from Claude list JSON.
 * @param {unknown} payload
 * @returns {Record<string, unknown>[]}
 */
export function extractClaudeConversationItems(payload) {
  if (!isRecognizedClaudeListPayload(payload)) return [];
  if (Array.isArray(payload)) return payload.filter((x) => x && typeof x === 'object');
  const obj = /** @type {Record<string, unknown>} */ (payload);
  if (Array.isArray(obj.chat_conversations)) {
    return obj.chat_conversations.filter((x) => x && typeof x === 'object');
  }
  if (Array.isArray(obj.conversations)) {
    return obj.conversations.filter((x) => x && typeof x === 'object');
  }
  if (Array.isArray(obj.items)) return obj.items.filter((x) => x && typeof x === 'object');
  if (Array.isArray(obj.data)) return obj.data.filter((x) => x && typeof x === 'object');
  if (Array.isArray(obj.results)) return obj.results.filter((x) => x && typeof x === 'object');
  return [];
}

/**
 * Normalize a single Claude conversation list item into a Cogis pointer.
 * @param {Record<string, unknown>} raw
 * @returns {import('./messaging.js').PointerRecord|null}
 */
export function normalizeClaudeHit(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const safe = stripForbiddenFields(raw);
  const uuid =
    (typeof safe.uuid === 'string' && safe.uuid) ||
    (typeof safe.id === 'string' && safe.id) ||
    (typeof safe.conversation_uuid === 'string' && safe.conversation_uuid) ||
    (typeof safe.chat_conversation_uuid === 'string' && safe.chat_conversation_uuid) ||
    null;

  const titleRaw = safe.name ?? safe.title ?? safe.conversation_name;
  const title = typeof titleRaw === 'string' && titleRaw.trim() ? titleRaw.trim() : null;
  if (!uuid || !title) return null;

  const dateIso =
    claudeDateToIso(safe.updated_at) ??
    claudeDateToIso(safe.updatedAt) ??
    claudeDateToIso(safe.created_at) ??
    claudeDateToIso(safe.createdAt);

  const pointer = {
    platform: 'claude',
    title,
    dateIso,
    deepLinkUrl: claudeDeepLink(uuid),
    prefillSupported: false,
  };

  if (pointerHasForbiddenFields(pointer)) {
    return null;
  }
  return pointer;
}

/**
 * Normalize a Claude conversations list response into pointers.
 * When `max` is omitted, returns all valid pointers (caller title-filters then
 * caps — required for Claude client-side title-match). Pass `max` only when the
 * caller already has a server-filtered or intentionally truncated set.
 *
 * @param {unknown} payload
 * @param {{ max?: number }} [opts]
 * @returns {import('./messaging.js').PointerRecord[]}
 */
export function normalizeClaudeListResponse(payload, opts = {}) {
  const max = opts.max;
  const items = extractClaudeConversationItems(payload);
  const pointers = [];
  for (const item of items) {
    const p = normalizeClaudeHit(item);
    if (p) pointers.push(p);
    if (typeof max === 'number' && pointers.length >= max) break;
  }
  return pointers;
}

/**
 * Deduplicate pointers by deepLinkUrl (or title fallback), preserving order.
 * @param {import('./messaging.js').PointerRecord[]} pointers
 * @param {number} [max]
 */
export function dedupePointers(pointers, max = MAX_RESULTS_PER_PLATFORM) {
  const seen = new Set();
  const out = [];
  for (const p of pointers) {
    if (!p) continue;
    const key = p.deepLinkUrl || `title:${p.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Click cascade href: deep link → prefill (?q=) → lab home.
 * @param {import('./messaging.js').PointerRecord|null|undefined} hit
 * @param {string} platformId
 * @param {string|null|undefined} query
 * @param {string} [homeFallback]
 */
export function resolveResultHref(hit, platformId, query, homeFallback = '#') {
  if (hit?.deepLinkUrl) return hit.deepLinkUrl;
  if (hit?.prefillSupported && platformId === 'perplexity') {
    const prefill = perplexityPrefillUrl(query ?? '');
    if (prefill) return prefill;
  }
  if (platformId === 'perplexity') return 'https://www.perplexity.ai';
  if (platformId === 'chatgpt') return 'https://chatgpt.com';
  if (platformId === 'claude') return 'https://claude.ai';
  return homeFallback;
}
