import { getPlatformSelectors } from './selectors/loader.js';
import {
  dedupePointers,
  extractPerplexityListItems,
  isRecognizedPerplexityListPayload,
  normalizePerplexityHit,
  normalizePerplexityListResponse,
} from './results.js';
import { loginRequiredCopy, unavailableCopy, PLATFORMS } from './platforms.js';
import { MAX_RESULTS_PER_PLATFORM } from './timeouts.js';

const CAPABILITY = 'title-match';

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
 * Client-side title filter for Space-enumerated threads (title-match).
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
 * @param {object} deps
 * @param {string} deps.origin
 * @param {(input: string, init?: RequestInit) => Promise<Response>} deps.fetchImpl
 * @param {AbortSignal} [deps.signal]
 * @param {object} [deps.pack]
 * @param {string} deps.query
 * @param {number} deps.pageSize
 * @param {number} deps.maxResults
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
 * Spaces ladder A: discover spaces then try per-space thread list candidates.
 * Failures are soft — never override a successful C result with unavailable.
 *
 * @param {object} deps
 */
async function enumerateSpacesThreads(deps) {
  const pack = deps.pack;
  const spacesPath = pack?.endpoints?.spaces ?? '/rest/spaces';
  const version = pack?.apiVersion ?? '2.18';
  const source = pack?.apiClient ?? 'default';
  const spacesUrl = new URL(spacesPath, deps.origin);
  spacesUrl.searchParams.set('version', version);
  spacesUrl.searchParams.set('source', source);

  let spacesRes;
  try {
    spacesRes = await deps.fetchImpl(spacesUrl.toString(), {
      method: 'GET',
      credentials: 'include',
      headers: buildPerplexityHeaders(pack),
      signal: deps.signal,
    });
  } catch (err) {
    if (isAbortError(err)) throw err;
    return { pointers: [], used: false };
  }

  if (spacesRes.status === 401 || spacesRes.status === 403) {
    return { pointers: [], used: false, loginRequired: true };
  }
  if (!spacesRes.ok) {
    return { pointers: [], used: false };
  }

  let spacesPayload;
  try {
    spacesPayload = await spacesRes.json();
  } catch {
    return { pointers: [], used: false };
  }

  const spaces = extractSpaces(spacesPayload);
  if (spaces.length === 0) {
    return { pointers: [], used: true };
  }

  const candidates = pack?.endpoints?.spaceThreadsCandidates ?? [
    '/rest/spaces/{uuid}/threads',
    '/rest/collection/{uuid}/threads',
    '/rest/thread/list_ask_threads',
  ];
  const headers = buildPerplexityHeaders(pack);
  /** @type {import('./messaging.js').PointerRecord[]} */
  const collected = [];

  for (const space of spaces) {
    if (collected.length >= deps.maxResults) break;
    if (deps.signal?.aborted) {
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    }

    for (const template of candidates) {
      let pagePointers = [];
      try {
        if (template.includes('list_ask_threads')) {
          const listUrl = buildListAskThreadsUrl(deps.origin, pack);
          const res = await deps.fetchImpl(listUrl, {
            method: 'POST',
            credentials: 'include',
            headers,
            body: JSON.stringify({
              limit: deps.pageSize,
              ascending: false,
              offset: 0,
              search_term: deps.query,
              collection_uuid: space.uuid,
              filter_collection_uuid: space.uuid,
              space_uuid: space.uuid,
            }),
            signal: deps.signal,
          });
          if (!res.ok) continue;
          const payload = await res.json();
          if (!isRecognizedPerplexityListPayload(payload)) continue;
          pagePointers = normalizePerplexityListResponse(payload, { max: deps.maxResults });
        } else {
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
          if (!res.ok) continue;
          const payload = await res.json();
          if (!isRecognizedPerplexityListPayload(payload)) continue;
          pagePointers = filterPointersByTitle(
            normalizePerplexityListResponse(payload, { max: deps.maxResults }),
            deps.query,
          );
        }
      } catch (err) {
        if (isAbortError(err)) throw err;
        continue;
      }

      if (pagePointers.length > 0) {
        collected.push(...pagePointers);
        break;
      }
    }
  }

  return {
    pointers: dedupePointers(collected, deps.maxResults),
    used: true,
  };
}

/**
 * Spaces ladder B: collect /search/{slug} links from DOM when provided.
 * @param {() => { slug: string, title: string }[]} [getDomSpaceThreadLinks]
 * @param {string} query
 * @param {number} max
 */
export function collectDomSpacePointers(getDomSpaceThreadLinks, query, max) {
  if (typeof getDomSpaceThreadLinks !== 'function') return [];
  let links;
  try {
    links = getDomSpaceThreadLinks() ?? [];
  } catch {
    return [];
  }
  /** @type {import('./messaging.js').PointerRecord[]} */
  const pointers = [];
  for (const link of links) {
    if (!link || typeof link.slug !== 'string' || typeof link.title !== 'string') continue;
    const p = normalizePerplexityHit({ slug: link.slug, title: link.title });
    if (p) pointers.push(p);
  }
  return filterPointersByTitle(dedupePointers(pointers, max), query);
}

/**
 * Pure orchestration of Perplexity search given injectable fetchers.
 * Endpoint-first per S3; Spaces ladder C → A → B. Never stores cookies/bodies.
 *
 * @param {object} deps
 * @param {string} deps.query
 * @param {string} [deps.origin]
 * @param {(input: string, init?: RequestInit) => Promise<Response>} deps.fetchImpl
 * @param {() => boolean} [deps.isSignInVisible]
 * @param {() => { slug: string, title: string }[]} [deps.getDomSpaceThreadLinks]
 * @param {number} [deps.maxResults]
 * @param {AbortSignal} [deps.signal]
 */
export async function searchPerplexity(deps) {
  const origin = deps.origin ?? PLATFORMS.perplexity.origin;
  const fetchImpl = deps.fetchImpl;
  const maxResults = deps.maxResults ?? MAX_RESULTS_PER_PLATFORM;
  const signal = deps.signal;
  const pack = getPlatformSelectors('perplexity');
  const pageSize = pack?.pageSize ?? MAX_RESULTS_PER_PLATFORM;

  if (signal?.aborted) {
    const err = new Error('aborted');
    err.name = 'AbortError';
    throw err;
  }

  // Ladder C: list_ask_threads with search_term (covers Library; Deplexity notes
  // collection/space metadata is embedded on list items when present).
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
  let merged = [...primary.pointers];

  // Ladder A: GET /rest/spaces + per-space thread candidates (soft merge).
  if (merged.length < maxResults) {
    const spaceEnum = await enumerateSpacesThreads({
      origin,
      fetchImpl,
      signal,
      pack,
      query: deps.query,
      pageSize,
      maxResults,
    });
    // Do not override a successful C auth with Spaces 401 — empty C + Spaces 401
    // still means "authenticated, no hits" (or Spaces endpoint drift), not logout.
    merged = dedupePointers([...merged, ...(spaceEnum.pointers ?? [])], maxResults);
  }

  // Ladder B: DOM Spaces links (soft merge when still short).
  if (merged.length < maxResults) {
    const domPointers = collectDomSpacePointers(
      deps.getDomSpaceThreadLinks,
      deps.query,
      maxResults,
    );
    merged = dedupePointers([...merged, ...domPointers], maxResults);
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
