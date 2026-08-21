/**
 * Perplexity adapter.
 *
 * Live contract, verified 2026-08-21 against perplexity.ai with a logged-in
 * session (via Claude-in-Chrome network inspection — not the old blueprint's
 * `list_ask_threads` REST call or its gated-off Spaces handling; both are
 * superseded by a single unified endpoint):
 *
 *   POST /rest/perplexity_ask/graphql
 *   {
 *     operationName: "CommandPaletteTypeaheadSearchRelayQuery",
 *     variables: { query: <q> },
 *     extensions: { persistedQuery: { version: 1, sha256Hash: <hash> } }
 *   }
 *   -> { data: { viewer: { typeaheadSearch: { edges: [
 *        { highlightQuery, node: { title, subtitle, type, object: {...} } }
 *      ] } } } }
 *
 * This is the sidebar command-palette search (⌘/Ctrl-K equivalent) — one
 * request covers regular search threads, "computer" (agentic) task threads,
 * *and* Project/Space name matches, in one unified result set. `node.type`
 * is one of `SEARCH_THREAD` / `COMPUTER_TASK` / `PROJECT` (there may be
 * others); every conversation-like entry carries `object.__typename ===
 * "Thread"` with a `threadSlug` and `updatedAt`, regardless of which `type`
 * tag it has — filtering on `__typename` instead of the `type` enum is more
 * robust to new type tags Perplexity might add. `PROJECT` entries
 * (`__typename: "ThreadSpace"`) are containers, not conversations, and are
 * skipped — no separate Spaces enumeration needed, unlike the old gated
 * `SPACE_THREAD_ENUMERATION_ENABLED` approach.
 *
 * `subtitle` holds an assistant-response snippet (proof this is genuine
 * full-text search, not title-match) and must never leave this file.
 *
 * This is a GraphQL *persisted* query — the sha256 hash is derived from the
 * exact query text baked into Perplexity's current frontend bundle and can
 * change on any Perplexity deploy. If this adapter starts failing outright,
 * re-capture the hash from a live session before assuming anything else is
 * wrong.
 *
 * Cookie-authenticated only (no bearer token). Runs from the background
 * service worker directly via `host_permissions` — no content script or tab
 * needed.
 *
 * Auth mapping: 401 -> login_required. Other non-ok -> unavailable. Network
 * error/abort -> timeout. Generic S5-style mapping, no Perplexity-specific
 * rule.
 */

import { anyDateToIso, stripForbiddenFields, pointerHasForbiddenFields } from './results.js';
import { PLATFORM_TIMEOUT_MS, MAX_RESULTS_PER_PLATFORM } from './timeouts.js';

const ORIGIN = 'https://www.perplexity.ai';
const PERSISTED_QUERY_HASH = 'b70669aa090081047346576e89fe68bbc5269c3c2c0de084b980820fee9426a0';

/**
 * @param {string} threadSlug
 * @returns {string|null}
 */
export function perplexityDeepLink(threadSlug) {
  if (typeof threadSlug !== 'string' || !threadSlug.trim()) return null;
  return `${ORIGIN}/search/${encodeURIComponent(threadSlug.trim())}`;
}

/**
 * @param {string} query
 * @returns {string}
 */
export function perplexityPrefillUrl(query) {
  const url = new URL(`${ORIGIN}/search`);
  url.searchParams.set('q', query);
  return url.toString();
}

/**
 * @param {Record<string, unknown>} raw one `edges[]` entry from typeaheadSearch
 * @returns {import('./messaging.js').PointerRecord|null}
 */
export function normalizePerplexityHit(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const node = raw.node && typeof raw.node === 'object' ? stripForbiddenFields(raw.node) : null;
  if (!node) return null;

  const object =
    node.object && typeof node.object === 'object' ? stripForbiddenFields(node.object) : null;
  if (!object || object.__typename !== 'Thread') return null;

  const threadSlug = typeof object.threadSlug === 'string' ? object.threadSlug : null;
  const title = typeof node.title === 'string' && node.title.trim() ? node.title.trim() : null;
  if (!threadSlug || !title) return null;

  const pointer = {
    platform: 'perplexity',
    title,
    dateIso: anyDateToIso(object.updatedAt),
    deepLinkUrl: perplexityDeepLink(threadSlug),
    prefillSupported: true,
  };

  if (pointerHasForbiddenFields(pointer)) return null;
  return pointer;
}

/**
 * Run a Perplexity search. Returns a result descriptor the service worker
 * turns into a SEARCH_RESULT_CHUNK — never throws.
 * @param {string} query
 * @returns {Promise<{ status: import('./messaging.js').GroupStatus, results?: import('./messaging.js').PointerRecord[], message?: string, loginUrl?: string }>}
 */
export async function searchPerplexity(query) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PLATFORM_TIMEOUT_MS);

  try {
    let res;
    try {
      res = await fetch(`${ORIGIN}/rest/perplexity_ask/graphql`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operationName: 'CommandPaletteTypeaheadSearchRelayQuery',
          variables: { query },
          extensions: { persistedQuery: { version: 1, sha256Hash: PERSISTED_QUERY_HASH } },
        }),
        signal: controller.signal,
      });
    } catch (err) {
      if (err?.name === 'AbortError') return { status: 'timeout' };
      return { status: 'unavailable', message: 'Could not reach Perplexity.' };
    }

    if (res.status === 401) {
      return { status: 'login_required', loginUrl: `${ORIGIN}/` };
    }
    if (!res.ok) {
      return { status: 'unavailable', message: `Perplexity search failed (${res.status}).` };
    }

    let payload;
    try {
      payload = await res.json();
    } catch {
      return { status: 'unavailable', message: 'Perplexity returned an unexpected response.' };
    }

    const edges = payload?.data?.viewer?.typeaheadSearch?.edges;
    if (!Array.isArray(edges)) {
      return { status: 'unavailable', message: 'Perplexity returned an unexpected response.' };
    }

    const seen = new Set();
    const pointers = [];
    for (const edge of edges) {
      const pointer = normalizePerplexityHit(edge);
      if (!pointer) continue;
      const key = pointer.deepLinkUrl;
      if (seen.has(key)) continue;
      seen.add(key);
      pointers.push(pointer);
      if (pointers.length >= MAX_RESULTS_PER_PLATFORM) break;
    }

    return { status: pointers.length ? 'ready' : 'empty', results: pointers };
  } finally {
    clearTimeout(timer);
  }
}
