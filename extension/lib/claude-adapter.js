import { getPlatformSelectors } from './selectors/loader.js';
import {
  dedupePointers,
  extractClaudeConversationItems,
  filterPointersByTitle,
  isRecognizedClaudeListPayload,
  normalizeClaudeListResponse,
} from './results.js';
import { loginRequiredCopy, unavailableCopy, PLATFORMS } from './platforms.js';
import { MAX_RESULTS_PER_PLATFORM, PLATFORM_TIMEOUT_MS } from './timeouts.js';

const CAPABILITY = 'title-match';

/** Hard cap on Projects fetched when supplementing root recents (S2 + S6). */
export const PROJECTS_MAX_PROJECTS = 8;

/** Hard cap on Project conversation list HTTP calls per search. */
export const PROJECTS_MAX_FETCHES = 10;

/** Minimum remaining platform budget (ms) before spending Projects supplement fetches. */
export const PROJECTS_MIN_REMAINING_MS = 1200;

/**
 * @param {any} err
 */
function isAbortError(err) {
  return !!err && (err.name === 'AbortError' || err.code === 'ABORT_ERR');
}

/**
 * Headers for Claude.ai first-party JSON GETs (session cookies via credentials).
 */
export function buildClaudeHeaders() {
  return {
    Accept: 'application/json',
  };
}

/**
 * Classify organizations / conversations HTTP outcome per S5.
 * @param {{
 *   status: number,
 *   ok: boolean,
 *   contentType?: string|null,
 *   parseOk: boolean,
 *   isLoginShell?: boolean,
 * }} input
 * @returns {'authenticated'|'login_required'|'unavailable'}
 */
export function classifyClaudeApiOutcome(input) {
  const { status, ok, contentType, parseOk, isLoginShell } = input;

  if (status === 401 || status === 403) return 'login_required';
  if (status >= 500 || status === 0) return 'unavailable';

  const looksHtml =
    (typeof contentType === 'string' && contentType.toLowerCase().includes('text/html')) ||
    !parseOk;

  if (looksHtml) {
    return isLoginShell ? 'login_required' : 'unavailable';
  }

  if (!ok) {
    return isLoginShell ? 'login_required' : 'unavailable';
  }

  return 'authenticated';
}

/**
 * Pick an org uuid that can chat. Prefers orgs advertising chat / claude capabilities.
 * @param {unknown} payload
 * @returns {string|null}
 */
export function pickOrganizationId(payload) {
  const orgs = extractOrganizations(payload);
  if (orgs.length === 0) return null;

  const preferred = orgs.find((o) => {
    const caps = o.capabilities;
    if (!Array.isArray(caps)) return false;
    return caps.some(
      (c) => typeof c === 'string' && (c === 'chat' || c.includes('chat') || c.includes('claude')),
    );
  });
  return preferred?.uuid ?? orgs[0].uuid ?? null;
}

/**
 * Normalize organizations list from GET /api/organizations (array or wrapped).
 * @param {unknown} payload
 * @returns {{ uuid: string, name?: string, capabilities?: unknown[] }[]}
 */
export function extractOrganizations(payload) {
  /** @type {Record<string, unknown>[]} */
  let items = [];
  if (Array.isArray(payload)) {
    items = payload.filter((x) => x && typeof x === 'object');
  } else if (payload && typeof payload === 'object') {
    const obj = /** @type {Record<string, unknown>} */ (payload);
    const buckets = [obj.organizations, obj.data, obj.items, obj.memberships];
    for (const bucket of buckets) {
      if (!Array.isArray(bucket)) continue;
      for (const item of bucket) {
        if (!item || typeof item !== 'object') continue;
        const rec = /** @type {Record<string, unknown>} */ (item);
        // memberships[] may nest organization
        if (rec.organization && typeof rec.organization === 'object') {
          items.push(/** @type {Record<string, unknown>} */ (rec.organization));
        } else {
          items.push(rec);
        }
      }
    }
  }

  const out = [];
  const seen = new Set();
  for (const item of items) {
    const uuid =
      (typeof item.uuid === 'string' && item.uuid) ||
      (typeof item.id === 'string' && item.id) ||
      (typeof item.organization_uuid === 'string' && item.organization_uuid) ||
      null;
    if (!uuid || seen.has(uuid)) continue;
    seen.add(uuid);
    out.push({
      uuid,
      name: typeof item.name === 'string' ? item.name : undefined,
      capabilities: Array.isArray(item.capabilities) ? item.capabilities : undefined,
    });
  }
  return out;
}

/**
 * Extract project descriptors from GET .../projects payload.
 * @param {unknown} payload
 * @returns {{ uuid: string, name?: string }[]}
 */
export function extractProjects(payload) {
  /** @type {Record<string, unknown>[]} */
  let items = [];
  if (Array.isArray(payload)) {
    items = payload.filter((x) => x && typeof x === 'object');
  } else if (payload && typeof payload === 'object') {
    const obj = /** @type {Record<string, unknown>} */ (payload);
    for (const key of ['projects', 'data', 'items', 'results']) {
      if (Array.isArray(obj[key])) {
        items = obj[key].filter((x) => x && typeof x === 'object');
        break;
      }
    }
  }

  const out = [];
  const seen = new Set();
  for (const item of items) {
    const uuid =
      (typeof item.uuid === 'string' && item.uuid) ||
      (typeof item.id === 'string' && item.id) ||
      null;
    if (!uuid || seen.has(uuid)) continue;
    seen.add(uuid);
    out.push({
      uuid,
      name: typeof item.name === 'string' ? item.name : undefined,
    });
  }
  return out;
}

/**
 * @param {string} origin
 * @param {string} path
 * @param {Record<string, string|number|boolean|undefined>} [params]
 */
export function buildClaudeUrl(origin, path, params = {}) {
  const url = new URL(path, origin);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/**
 * Whether to spend remaining budget on Projects enumeration.
 * Always preferred when zero root hits; also when under max and budget remains
 * so Project-only chats are still findable (S2).
 *
 * @param {{
 *   rootHitCount: number,
 *   remainingMs: number,
 *   maxResults: number,
 *   minRemainingMs?: number,
 * }} input
 */
export function shouldAttemptProjectsSupplement(input) {
  const minRemaining = input.minRemainingMs ?? PROJECTS_MIN_REMAINING_MS;
  if (input.remainingMs < minRemaining) return false;
  // Still look for Project-only chats even when root already has some hits,
  // unless the result cap is already full.
  return input.rootHitCount < input.maxResults;
}

/**
 * @param {object} deps
 * @param {(input: string, init?: RequestInit) => Promise<Response>} deps.fetchImpl
 * @param {AbortSignal} [deps.signal]
 * @param {string} deps.url
 * @param {() => boolean} [deps.isLoginShell]
 * @returns {Promise<{
 *   auth: 'authenticated'|'login_required'|'unavailable',
 *   payload: unknown,
 *   status: number,
 *   errorCode?: string,
 * }>}
 */
async function fetchJson(deps) {
  let res;
  try {
    res = await deps.fetchImpl(deps.url, {
      method: 'GET',
      credentials: 'include',
      headers: buildClaudeHeaders(),
      signal: deps.signal,
    });
  } catch (err) {
    if (isAbortError(err)) throw err;
    return {
      auth: 'unavailable',
      payload: null,
      status: 0,
      errorCode: 'fetch_failed',
    };
  }

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

  const auth = classifyClaudeApiOutcome({
    status: res.status,
    ok: res.ok,
    contentType,
    parseOk,
    isLoginShell: deps.isLoginShell?.() ?? false,
  });

  if (auth !== 'authenticated') {
    return {
      auth,
      payload: null,
      status: res.status,
      errorCode: `http_${res.status}`,
    };
  }

  return { auth: 'authenticated', payload, status: res.status };
}

/**
 * Paginate root chat_conversations and title-filter (S2 title-match + S6 paging).
 * @param {object} deps
 * @returns {Promise<{
 *   auth: 'authenticated'|'login_required'|'unavailable',
 *   pointers: import('./messaging.js').PointerRecord[],
 *   errorCode?: string,
 *   pageCount: number,
 * }>}
 */
async function listRootConversations(deps) {
  /** @type {import('./messaging.js').PointerRecord[]} */
  const collected = [];
  let offset = 0;
  let pageCount = 0;
  const pageSize = deps.pageSize;

  while (collected.length < deps.maxResults) {
    if (deps.signal?.aborted) {
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    }

    const conversationsPath = (
      deps.pack?.endpoints?.chatConversations ?? `/api/organizations/{orgId}/chat_conversations`
    ).replace('{orgId}', encodeURIComponent(deps.orgId));

    const url = buildClaudeUrl(deps.origin, conversationsPath, {
      limit: pageSize,
      offset,
    });

    const result = await fetchJson({
      fetchImpl: deps.fetchImpl,
      signal: deps.signal,
      url,
      isLoginShell: deps.isLoginShell,
    });

    if (result.auth !== 'authenticated') {
      return {
        auth: result.auth,
        pointers: [],
        errorCode: result.errorCode ?? 'conversations_failed',
        pageCount,
      };
    }

    if (!isRecognizedClaudeListPayload(result.payload)) {
      return {
        auth: 'unavailable',
        pointers: [],
        errorCode: 'conversations_unrecognized',
        pageCount,
      };
    }

    pageCount += 1;
    const pageItems = extractClaudeConversationItems(result.payload);
    const pagePointers = filterPointersByTitle(
      normalizeClaudeListResponse(result.payload, { max: deps.maxResults }),
      deps.query,
    );
    collected.push(...pagePointers);

    if (pageItems.length < pageSize) break;
    offset += pageSize;
    if (pageCount >= 5) break;
  }

  return {
    auth: 'authenticated',
    pointers: dedupePointers(collected, deps.maxResults),
    pageCount,
  };
}

/**
 * Enumerate Projects then project conversations (S2 required scope).
 * Soft-fails individual project fetches; never stores bodies.
 *
 * @param {object} deps
 * @returns {Promise<{
 *   pointers: import('./messaging.js').PointerRecord[],
 *   used: boolean,
 *   fetchCount: number,
 *   auth?: 'login_required'|'unavailable',
 *   errorCode?: string,
 * }>}
 */
async function enumerateProjectConversations(deps) {
  const pack = deps.pack;
  const projectsPath = (pack?.endpoints?.projects ?? `/api/organizations/{orgId}/projects`).replace(
    '{orgId}',
    encodeURIComponent(deps.orgId),
  );
  const projectsUrl = buildClaudeUrl(deps.origin, projectsPath, {
    include_harmony_projects: true,
    limit: PROJECTS_MAX_PROJECTS,
  });

  let fetchCount = 0;
  const projectsResult = await fetchJson({
    fetchImpl: deps.fetchImpl,
    signal: deps.signal,
    url: projectsUrl,
    isLoginShell: deps.isLoginShell,
  });
  fetchCount += 1;

  if (projectsResult.auth === 'login_required') {
    return {
      pointers: [],
      used: false,
      fetchCount,
      auth: 'login_required',
      errorCode: projectsResult.errorCode,
    };
  }
  // Soft-fail Projects directory: root list may still have hits.
  if (projectsResult.auth !== 'authenticated') {
    return { pointers: [], used: false, fetchCount };
  }

  const projects = extractProjects(projectsResult.payload).slice(0, PROJECTS_MAX_PROJECTS);
  if (projects.length === 0) {
    return { pointers: [], used: true, fetchCount };
  }

  const template =
    pack?.endpoints?.projectConversations ??
    `/api/organizations/{orgId}/projects/{projectId}/conversations`;

  /** @type {import('./messaging.js').PointerRecord[]} */
  const collected = [];

  for (const project of projects) {
    if (fetchCount >= PROJECTS_MAX_FETCHES) break;
    if (collected.length >= deps.maxResults) break;
    if (deps.signal?.aborted) {
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    }

    const path = template
      .replace('{orgId}', encodeURIComponent(deps.orgId))
      .replace('{projectId}', encodeURIComponent(project.uuid));
    const url = buildClaudeUrl(deps.origin, path, { limit: deps.pageSize });

    try {
      const result = await fetchJson({
        fetchImpl: deps.fetchImpl,
        signal: deps.signal,
        url,
        isLoginShell: deps.isLoginShell,
      });
      fetchCount += 1;
      if (result.auth !== 'authenticated') continue;
      if (!isRecognizedClaudeListPayload(result.payload)) continue;
      const pagePointers = filterPointersByTitle(
        normalizeClaudeListResponse(result.payload, { max: deps.maxResults }),
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
    fetchCount,
  };
}

/**
 * Pure orchestration of Claude search given injectable fetchers.
 * Endpoint-first per S2: organizations → chat_conversations (paginated title
 * filter) → Projects enumeration. Never stores cookies/bodies.
 *
 * @param {object} deps
 * @param {string} deps.query
 * @param {string} [deps.origin]
 * @param {(input: string, init?: RequestInit) => Promise<Response>} deps.fetchImpl
 * @param {() => boolean} [deps.isLoginShell]
 * @param {number} [deps.maxResults]
 * @param {AbortSignal} [deps.signal]
 * @param {() => number} [deps.now]
 * @param {number} [deps.platformBudgetMs]
 */
export async function searchClaude(deps) {
  const origin = deps.origin ?? PLATFORMS.claude.origin;
  const fetchImpl = deps.fetchImpl;
  const maxResults = deps.maxResults ?? MAX_RESULTS_PER_PLATFORM;
  const signal = deps.signal;
  const pack = getPlatformSelectors('claude');
  const pageSize = pack?.pageSize ?? MAX_RESULTS_PER_PLATFORM;
  const now = deps.now ?? Date.now;
  const platformBudgetMs = deps.platformBudgetMs ?? PLATFORM_TIMEOUT_MS;
  const startedAt = now();

  if (signal?.aborted) {
    const err = new Error('aborted');
    err.name = 'AbortError';
    throw err;
  }

  // Soft DOM login shell before spending network (S5).
  if (deps.isLoginShell?.()) {
    return {
      status: 'login_required',
      results: [],
      message: loginRequiredCopy('claude'),
      loginUrl: PLATFORMS.claude.loginUrl,
      errorCode: 'login_shell',
    };
  }

  const orgsPath = pack?.endpoints?.organizations ?? '/api/organizations';
  const orgsUrl = buildClaudeUrl(origin, orgsPath);
  const orgsResult = await fetchJson({
    fetchImpl,
    signal,
    url: orgsUrl,
    isLoginShell: deps.isLoginShell,
  });

  if (orgsResult.auth === 'login_required') {
    return {
      status: 'login_required',
      results: [],
      message: loginRequiredCopy('claude'),
      loginUrl: PLATFORMS.claude.loginUrl,
      errorCode: orgsResult.errorCode ?? 'orgs_unauthorized',
    };
  }

  if (orgsResult.auth === 'unavailable') {
    if (deps.isLoginShell?.()) {
      return {
        status: 'login_required',
        results: [],
        message: loginRequiredCopy('claude'),
        loginUrl: PLATFORMS.claude.loginUrl,
        errorCode: orgsResult.errorCode ?? 'orgs_unavailable_login',
      };
    }
    return {
      status: 'unavailable',
      results: [],
      message: unavailableCopy('claude'),
      errorCode: orgsResult.errorCode ?? 'orgs_unavailable',
    };
  }

  const orgId = pickOrganizationId(orgsResult.payload);
  if (!orgId) {
    // Empty org list with 200 is unusual — treat as login/unavailable via DOM hint.
    if (deps.isLoginShell?.()) {
      return {
        status: 'login_required',
        results: [],
        message: loginRequiredCopy('claude'),
        loginUrl: PLATFORMS.claude.loginUrl,
        errorCode: 'orgs_empty_login',
      };
    }
    return {
      status: 'unavailable',
      results: [],
      message: unavailableCopy('claude'),
      errorCode: 'orgs_empty',
    };
  }

  const root = await listRootConversations({
    origin,
    orgId,
    fetchImpl,
    signal,
    pack,
    query: deps.query,
    pageSize,
    maxResults,
    isLoginShell: deps.isLoginShell,
  });

  if (root.auth === 'login_required') {
    return {
      status: 'login_required',
      results: [],
      message: loginRequiredCopy('claude'),
      loginUrl: PLATFORMS.claude.loginUrl,
      errorCode: root.errorCode ?? 'conversations_unauthorized',
    };
  }

  if (root.auth === 'unavailable' && root.pointers.length === 0) {
    if (deps.isLoginShell?.()) {
      return {
        status: 'login_required',
        results: [],
        message: loginRequiredCopy('claude'),
        loginUrl: PLATFORMS.claude.loginUrl,
        errorCode: root.errorCode ?? 'conversations_unavailable_login',
      };
    }
    return {
      status: 'unavailable',
      results: [],
      message: unavailableCopy('claude'),
      errorCode: root.errorCode ?? 'conversations_unavailable',
    };
  }

  /** @type {import('./messaging.js').PointerRecord[]} */
  let merged = [...root.pointers];
  const remainingMs = platformBudgetMs - (now() - startedAt);

  if (
    shouldAttemptProjectsSupplement({
      rootHitCount: merged.length,
      remainingMs,
      maxResults,
    })
  ) {
    const projectsEnum = await enumerateProjectConversations({
      origin,
      orgId,
      fetchImpl,
      signal,
      pack,
      query: deps.query,
      pageSize,
      maxResults: maxResults - merged.length,
      isLoginShell: deps.isLoginShell,
    });

    if (projectsEnum.auth === 'login_required' && merged.length === 0) {
      return {
        status: 'login_required',
        results: [],
        message: loginRequiredCopy('claude'),
        loginUrl: PLATFORMS.claude.loginUrl,
        errorCode: projectsEnum.errorCode ?? 'projects_unauthorized',
      };
    }

    if (projectsEnum.pointers?.length) {
      merged = dedupePointers([...merged, ...projectsEnum.pointers], maxResults);
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
