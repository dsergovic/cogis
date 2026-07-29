import { getPlatformSelectors } from './selectors/loader.js';
import {
  dedupePointers,
  extractPerplexityListItems,
  isRecognizedPerplexityListPayload,
  normalizePerplexityListResponse,
} from './results.js';
import { loginRequiredCopy, unavailableCopy, PLATFORMS } from './platforms.js';
import { MAX_RESULTS_PER_PLATFORM, PLATFORM_TIMEOUT_MS } from './timeouts.js';

const CAPABILITY = 'title-match';

/**
 * Unproven per-Space thread list routes are gated off until a live Network
 * capture pins one shape (S3 ladder A). Do not shotgun candidate POSTs/GETs.
 * Spaces-only recovery then relies on ladder C (`list_ask_threads` +
 * `search_term`), which third-party clients report may embed collection metadata
 * on Library list items when present.
 */
export const SPACE_THREAD_ENUMERATION_ENABLED = false;

/** Minimum remaining platform budget (ms) before spending a Spaces supplement fetch. */
export const SPACES_MIN_REMAINING_MS = 1500;

/** Hard cap on Space-related fetches when enumeration is later enabled (1 path × K spaces). */
export const SPACES_MAX_SPACES = 5;

/** Hard cap on total Space-related HTTP calls per search (directory + thread probes). */
export const SPACES_MAX_FETCHES = 6;

/**
 * @param {any} err
 */
function isAbortError(err) {
  return !!err && (err.name === 'AbortError' || err.code === 'ABORT_ERR');
}

/**
 * Build list_ask_threads URL with version/source query params from pack.
 * @param {string} origin
 * @param {{ apiVersion?: string, apiClient?: string, endpoints?: { listAskThreads?: string } }} [pack]
 */
export function buildListAskThreadsUrl(origin, pack) {
  const path = pack?.endpoints?.listAskThreads ?? '/rest/thread/list_ask_threads';
  const url = new URL(path, origin);
  const version = pack?.apiVersion ?? '2.18';
  const source = pack?.apiClient ?? 'default';
  url.searchParams.set('version', version);
  url.searchParams.set('source', source);
  return url.toString();
}

/**
 * Headers used by the Perplexity web client for /rest calls.
 * @param {{ apiVersion?: string, apiClient?: string }} [pack]
 */
export function buildPerplexityHeaders(pack) {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'x-app-apiclient': pack?.apiClient ?? 'default',
    'x-app-apiversion': pack?.apiVersion ?? '2.18',
  };
}

/**
 * Classify list_ask_threads HTTP outcome per S5.
 * @param {{
 *   status: number,
 *   ok: boolean,
 *   contentType?: string|null,
 *   parseOk: boolean,
 *   isSignInVisible?: boolean,
 * }} input
 * @returns {'authenticated'|'login_required'|'unavailable'|null}
 *   null = caller continues (e.g. empty recognized array still authenticated)
 */
export function classifyListAskThreadsOutcome(input) {
  const { status, ok, contentType, parseOk, isSignInVisible } = input;

  if (status === 401 || status === 403) return 'login_required';
  if (status >= 500 || status === 0) return 'unavailable';

  const looksHtml =
    (typeof contentType === 'string' && contentType.toLowerCase().includes('text/html')) ||
    !parseOk;

  if (looksHtml) {
    return isSignInVisible ? 'login_required' : 'unavailable';
  }

  if (!ok) {
    return isSignInVisible ? 'login_required' : 'unavailable';
  }

  return 'authenticated';
}

/**
 * Client-side title filter helper (kept for a future proven Spaces path).
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
 * Extract Space/collection descriptors from GET /rest/spaces payload.
 * @param {unknown} payload
 * @returns {{ uuid: string, slug?: string, title?: string }[]}
 */
export function extractSpaces(payload) {
  if (!payload || typeof payload !== 'object') return [];
  const obj = /** @type {Record<string, unknown>} */ (payload);
  const buckets = [
    obj.private_spaces,
    obj.PrivateSpaces,
    obj.shared_spaces,
    obj.SharedSpaces,
    obj.invited_spaces,
    obj.InvitedSpaces,
    obj.saved_spaces,
    obj.SavedSpaces,
    obj.organization_spaces,
    obj.OrganizationSpaces,
    obj.spaces,
    obj.items,
    obj.data,
  ];

  /** @type {Record<string, unknown>[]} */
  const items = [];
  for (const bucket of buckets) {
    if (Array.isArray(bucket)) {
      for (const item of bucket) {
        if (item && typeof item === 'object')
          items.push(/** @type {Record<string, unknown>} */ (item));
      }
    }
  }
  if (Array.isArray(payload)) {
    for (const item of payload) {
      if (item && typeof item === 'object')
        items.push(/** @type {Record<string, unknown>} */ (item));
    }
  }

  const out = [];
  const seen = new Set();
  for (const item of items) {
    const uuid =
      (typeof item.uuid === 'string' && item.uuid) ||
      (typeof item.id === 'string' && item.id) ||
      (typeof item.collection_uuid === 'string' && item.collection_uuid) ||
      null;
    if (!uuid || seen.has(uuid)) continue;
    seen.add(uuid);
    out.push({
      uuid,
      slug: typeof item.slug === 'string' ? item.slug : undefined,
      title:
        typeof item.title === 'string'
          ? item.title
          : typeof item.name === 'string'
            ? item.name
            : undefined,
    });
  }
  return out;
}

/**
 * Enter Spaces supplement only when ladder C found nothing and budget remains.
 * If C already filled results (including a full cap of 20), do not pretend Spaces
 * was searched — prefer returning C over spending the 8s budget.
 *
 * @param {{
 *   cHitCount: number,
 *   remainingMs: number,
 *   enumerationEnabled?: boolean,
 *   minRemainingMs?: number,
 * }} input
 */
export function shouldAttemptSpacesSupplement(input) {
  const enumerationEnabled = input.enumerationEnabled ?? SPACE_THREAD_ENUMERATION_ENABLED;
  if (!enumerationEnabled) return false;
  if (input.cHitCount > 0) return false;
  const minRemaining = input.minRemainingMs ?? SPACES_MIN_REMAINING_MS;
  return input.remainingMs >= minRemaining;
}

/**
 * @param {object} deps
 * @param {string} deps.origin
 * @param {(input: string, init?: RequestInit) => Promise<Response>} deps.fetchImpl
 * @param {AbortSignal} [deps.signal]
 * @param {object} [deps.pack]
 * @param {string} deps.query
 * @param {number} deps.pageSize
 * @param {number} deps.maxResults
 * @param {() => boolean} [deps.isSignInVisible]
 * @returns {Promise<{ auth: 'authenticated'|'login_required'|'unavailable', pointers: import('./messaging.js').PointerRecord[], errorCode?: string, pageCount: number }>}
 */
async function listAskThreadsSearch(deps) {
  const listUrl = buildListAskThreadsUrl(deps.origin, deps.pack);
  const headers = buildPerplexityHeaders(deps.pack);
  /** @type {import('./messaging.js').PointerRecord[]} */
  const collected = [];
  let offset = 0;
  let pageCount = 0;
  let sawAuth = false;

  while (collected.length < deps.maxResults) {
    if (deps.signal?.aborted) {
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    }

    let res;
    try {
      res = await deps.fetchImpl(listUrl, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({
          limit: deps.pageSize,
          ascending: false,
          offset,
          search_term: deps.query,
        }),
        signal: deps.signal,
      });
    } catch (err) {
      if (isAbortError(err)) throw err;
      if (!sawAuth) {
        return {
          auth: 'unavailable',
          pointers: [],
          errorCode: 'list_fetch_failed',
          pageCount,
        };
      }
      break;
    }

    pageCount += 1;
    const contentType = res.headers?.get?.('content-type') ?? null;
    let payload = null;
    let parseOk = false;
    try {
      payload = await res.json();
      parseOk = true;
    } catch {
      payload = null;
      parseOk = false;
    }

    const outcome = classifyListAskThreadsOutcome({
      status: res.status,
      ok: res.ok,
      contentType,
      parseOk,
      isSignInVisible: deps.isSignInVisible?.() ?? false,
    });

    if (outcome === 'login_required') {
      return { auth: 'login_required', pointers: [], errorCode: `list_${res.status}`, pageCount };
    }
    if (outcome === 'unavailable') {
      return { auth: 'unavailable', pointers: [], errorCode: `list_${res.status}`, pageCount };
    }

    if (!isRecognizedPerplexityListPayload(payload)) {
      return { auth: 'unavailable', pointers: [], errorCode: 'list_unrecognized', pageCount };
    }

    sawAuth = true;
    const pageItems = extractPerplexityListItems(payload);
    const pagePointers = normalizePerplexityListResponse(payload, {
      max: deps.maxResults - collected.length,
    });
    collected.push(...pagePointers);

    if (pageItems.length < deps.pageSize) break;
    offset += deps.pageSize;
    // Soft page cap inside the 8s budget (S6: page until empty / cap / timeout).
    if (pageCount >= 5) break;
  }

  return {
    auth: 'authenticated',
    pointers: dedupePointers(collected, deps.maxResults),
    pageCount,
  };
}

/**
 * Spaces ladder A (gated): optional directory peek only when enumeration is enabled.
 * Per-Space thread candidate routes are intentionally NOT probed — they were
 * inferred and caused multi-key / multi-path storms. Until one path is live-
 * proven, this returns an empty soft no-op so C results win the 8s budget.
 *
 * Cap when re-enabled: ≤1 candidate template × SPACES_MAX_SPACES, total fetches
 * ≤ SPACES_MAX_FETCHES (including the directory GET).
 *
 * @param {object} deps
 * @returns {Promise<{ pointers: import('./messaging.js').PointerRecord[], used: boolean, gated: boolean, fetchCount: number }>}
 */
async function enumerateSpacesThreads(deps) {
  // Honest no-op while candidates are gated. Prefer fail-soft over inventing routes.
  if (!SPACE_THREAD_ENUMERATION_ENABLED) {
    return { pointers: [], used: false, gated: true, fetchCount: 0 };
  }

  const pack = deps.pack;
  const spacesPath = pack?.endpoints?.spaces ?? '/rest/spaces';
  const version = pack?.apiVersion ?? '2.18';
  const source = pack?.apiClient ?? 'default';
  const spacesUrl = new URL(spacesPath, deps.origin);
  spacesUrl.searchParams.set('version', version);
  spacesUrl.searchParams.set('source', source);

  let fetchCount = 0;
  let spacesRes;
  try {
    spacesRes = await deps.fetchImpl(spacesUrl.toString(), {
      method: 'GET',
      credentials: 'include',
      headers: buildPerplexityHeaders(pack),
      signal: deps.signal,
    });
    fetchCount += 1;
  } catch (err) {
    if (isAbortError(err)) throw err;
    return { pointers: [], used: false, gated: false, fetchCount };
  }

  if (!spacesRes.ok) {
    return { pointers: [], used: false, gated: false, fetchCount };
  }

  let spacesPayload;
  try {
    spacesPayload = await spacesRes.json();
  } catch {
    return { pointers: [], used: false, gated: false, fetchCount };
  }

  const spaces = extractSpaces(spacesPayload).slice(0, SPACES_MAX_SPACES);
  if (spaces.length === 0) {
    return { pointers: [], used: true, gated: false, fetchCount };
  }

  // Single proven candidate only (pack may list one path after live capture).
  // No multi-key body probes (collection_uuid + space_uuid + …).
  const candidates = pack?.endpoints?.spaceThreadsCandidates;
  const template =
    Array.isArray(candidates) && typeof candidates[0] === 'string' ? candidates[0] : null;
  if (!template) {
    return { pointers: [], used: true, gated: false, fetchCount };
  }

  const headers = buildPerplexityHeaders(pack);
  /** @type {import('./messaging.js').PointerRecord[]} */
  const collected = [];

  for (const space of spaces) {
    if (fetchCount >= SPACES_MAX_FETCHES) break;
    if (collected.length >= deps.maxResults) break;
    if (deps.signal?.aborted) {
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    }

    try {
      const path = template.replace('{uuid}', encodeURIComponent(space.uuid));
      const url = new URL(path, deps.origin);
      url.searchParams.set('version', version);
      url.searchParams.set('source', source);
      const res = await deps.fetchImpl(url.toString(), {
        method: 'GET',
        credentials: 'include',
        headers,
        signal: deps.signal,
      });
      fetchCount += 1;
      if (!res.ok) continue;
      const payload = await res.json();
      if (!isRecognizedPerplexityListPayload(payload)) continue;
      const pagePointers = filterPointersByTitle(
        normalizePerplexityListResponse(payload, { max: deps.maxResults }),
        deps.query,
      );
      collected.push(...pagePointers);
    } catch (err) {
      if (isAbortError(err)) throw err;
    }
  }

  return {
    pointers: dedupePointers(collected, deps.maxResults),
    used: true,
    gated: false,
    fetchCount,
  };
}

/**
 * Pure orchestration of Perplexity search given injectable fetchers.
 * Endpoint-first per S3 ladder C (`list_ask_threads`). Spaces A is gated until
 * a live-proven thread route exists; former ladder B (page `/search/` scrape)
 * is not Spaces recovery and is omitted.
 *
 * Never stores cookies/bodies.
 *
 * @param {object} deps
 * @param {string} deps.query
 * @param {string} [deps.origin]
 * @param {(input: string, init?: RequestInit) => Promise<Response>} deps.fetchImpl
 * @param {() => boolean} [deps.isSignInVisible]
 * @param {number} [deps.maxResults]
 * @param {AbortSignal} [deps.signal]
 * @param {() => number} [deps.now] injectable clock for budget tests
 * @param {number} [deps.platformBudgetMs]
 */
export async function searchPerplexity(deps) {
  const origin = deps.origin ?? PLATFORMS.perplexity.origin;
  const fetchImpl = deps.fetchImpl;
  const maxResults = deps.maxResults ?? MAX_RESULTS_PER_PLATFORM;
  const signal = deps.signal;
  const pack = getPlatformSelectors('perplexity');
  const pageSize = pack?.pageSize ?? MAX_RESULTS_PER_PLATFORM;
  const now = deps.now ?? Date.now;
  const platformBudgetMs = deps.platformBudgetMs ?? PLATFORM_TIMEOUT_MS;
  const startedAt = now();

  if (signal?.aborted) {
    const err = new Error('aborted');
    err.name = 'AbortError';
    throw err;
  }

  // Ladder C: list_ask_threads with search_term (Library/History; may include
  // threads that also live in Spaces when the lab returns them for search_term).
  const primary = await listAskThreadsSearch({
    origin,
    fetchImpl,
    signal,
    pack,
    query: deps.query,
    pageSize,
    maxResults,
    isSignInVisible: deps.isSignInVisible,
  });

  if (primary.auth === 'login_required') {
    return {
      status: 'login_required',
      results: [],
      message: loginRequiredCopy('perplexity'),
      loginUrl: PLATFORMS.perplexity.loginUrl,
      errorCode: primary.errorCode ?? 'list_unauthorized',
    };
  }

  if (primary.auth === 'unavailable' && primary.pointers.length === 0) {
    // If network predicate failed, still allow DOM Sign In to flip to login_required.
    if (deps.isSignInVisible?.()) {
      return {
        status: 'login_required',
        results: [],
        message: loginRequiredCopy('perplexity'),
        loginUrl: PLATFORMS.perplexity.loginUrl,
        errorCode: primary.errorCode ?? 'list_unavailable_login',
      };
    }
    return {
      status: 'unavailable',
      results: [],
      message: unavailableCopy('perplexity'),
      errorCode: primary.errorCode ?? 'list_unavailable',
    };
  }

  /** @type {import('./messaging.js').PointerRecord[]} */
  const merged = [...primary.pointers];
  const remainingMs = platformBudgetMs - (now() - startedAt);

  // Ladder A: only when C returned 0 hits and budget remains. Currently gated to
  // a soft no-op (no unproven candidate storm). If C already has hits — including
  // a full cap of 20 — we do not pretend Spaces was separately searched.
  if (
    shouldAttemptSpacesSupplement({
      cHitCount: merged.length,
      remainingMs,
    })
  ) {
    const spaceEnum = await enumerateSpacesThreads({
      origin,
      fetchImpl,
      signal,
      pack,
      query: deps.query,
      pageSize,
      maxResults,
    });
    if (spaceEnum.pointers?.length) {
      return {
        status: 'ready',
        results: dedupePointers([...merged, ...spaceEnum.pointers], maxResults),
        capability: CAPABILITY,
        errorCode: undefined,
      };
    }
  }

  if (merged.length > 0) {
    return {
      status: 'ready',
      results: merged,
      capability: CAPABILITY,
      errorCode: undefined,
    };
  }

  return {
    status: 'empty',
    results: [],
    capability: CAPABILITY,
    errorCode: undefined,
  };
}
