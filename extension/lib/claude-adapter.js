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

/**
 * Soft page cap for root chat_conversations pagination.
 * History scanned ≈ ROOT_CONVERSATION_MAX_PAGES × pageSize (default ~100).
 * Hitting this ceiling is intentional: unread older history may remain, and
 * zero title matches still report `empty` (not truncated). See BL-024.
 */
export const ROOT_CONVERSATION_MAX_PAGES = 5;

/**
 * Soft page cap per project conversation list (S6).
 * ≈ PROJECT_CONVERSATION_MAX_PAGES × pageSize (~60). Soft cap still allows
 * `empty` when the scanned window has no match — distinct from failure/budget
 * truncation. See BL-024.
 */
export const PROJECT_CONVERSATION_MAX_PAGES = 3;

/**
 * HTTP call budget for Projects ladder: directory (1) + page-1 for each project
 * + one deepen round. Breadth-first ordering spends page-1 before deepen (N3).
 */
export const PROJECTS_MAX_FETCHES = 1 + PROJECTS_MAX_PROJECTS + PROJECTS_MAX_PROJECTS;

/** Minimum remaining platform budget (ms) before spending Projects supplement fetches. */
export const PROJECTS_MIN_REMAINING_MS = 1200;

/** Bail out of sequential loops when remaining budget cannot afford another RTT. */
export const MIN_RTT_BUDGET_MS = 400;

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
 * Classify organizations / conversations HTTP outcome per S5 + S2.
 * S2: 403/5xx on org or conversations → unavailable; DOM login shell may upgrade.
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

  if (status === 401) return 'login_required';
  // S2: 403 → unavailable unless login shell confirms logged-out.
  if (status === 403) return isLoginShell ? 'login_required' : 'unavailable';
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
 * Normalize a page uncapped, title-filter, then apply match budget.
 * Cap is applied *after* filter so Project-only matches at the end of a page
 * are still examined (I-1).
 *
 * @param {unknown} payload
 * @param {string} query
 * @param {number} maxMatches
 */
export function matchClaudePage(payload, query, maxMatches) {
  return filterPointersByTitle(normalizeClaudeListResponse(payload), query).slice(0, maxMatches);
}

/**
 * Whether to spend remaining budget on Projects enumeration.
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
  return input.rootHitCount < input.maxResults;
}

/**
 * True when Projects coverage was established enough to trust an `empty` chip.
 * `skipped_budget` / `truncated` / failures are NOT established (false empty).
 * `skipped_full` is established only because root already filled the match cap
 * (caller returns `ready` with hits — empty path is unreachable).
 *
 * @param {string|undefined} coverage
 */
export function projectsCoverageEstablished(coverage) {
  return coverage === 'ok' || coverage === 'empty_directory' || coverage === 'skipped_full';
}

/**
 * @param {{ deadlineAt?: number, now?: () => number }} deps
 */
function remainingMs(deps) {
  if (deps.deadlineAt == null) return Number.POSITIVE_INFINITY;
  const now = deps.now ?? Date.now;
  return deps.deadlineAt - now();
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
 * Keeps partial hits on later-page failure (S6 rule #2 / Perplexity sawAuth).
 *
 * @param {object} deps
 * @returns {Promise<{
 *   auth: 'authenticated'|'login_required'|'unavailable',
 *   pointers: import('./messaging.js').PointerRecord[],
 *   errorCode?: string,
 *   pageCount: number,
 *   truncated?: boolean,
 *   partialErrorCode?: string,
 * }>}
 */
async function listRootConversations(deps) {
  /** @type {import('./messaging.js').PointerRecord[]} */
  const collected = [];
  let offset = 0;
  let pageCount = 0;
  let sawAuth = false;
  let truncated = false;
  /** @type {string|undefined} */
  let partialErrorCode;
  const pageSize = deps.pageSize;
  const maxPages = deps.maxPages ?? ROOT_CONVERSATION_MAX_PAGES;

  while (collected.length < deps.maxResults) {
    if (deps.signal?.aborted) {
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    }
    if (remainingMs(deps) < MIN_RTT_BUDGET_MS) {
      if (sawAuth) truncated = true;
      break;
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
      if (sawAuth) {
        truncated = true;
        partialErrorCode = result.errorCode ?? 'conversations_page_failed';
        if (typeof console !== 'undefined' && console.debug) {
          console.debug('[cogis:claude] root page truncated', partialErrorCode);
        }
        break;
      }
      return {
        auth: result.auth,
        pointers: [],
        errorCode: result.errorCode ?? 'conversations_failed',
        pageCount,
      };
    }

    if (!isRecognizedClaudeListPayload(result.payload)) {
      if (sawAuth) {
        truncated = true;
        partialErrorCode = 'conversations_unrecognized';
        if (typeof console !== 'undefined' && console.debug) {
          console.debug('[cogis:claude] root page truncated', partialErrorCode);
        }
        break;
      }
      return {
        auth: 'unavailable',
        pointers: [],
        errorCode: 'conversations_unrecognized',
        pageCount,
      };
    }

    sawAuth = true;
    pageCount += 1;
    const pageItems = extractClaudeConversationItems(result.payload);
    const room = deps.maxResults - collected.length;
    const pagePointers = matchClaudePage(result.payload, deps.query, room);
    collected.push(...pagePointers);

    if (pageItems.length < pageSize) break;
    offset += pageSize;
    if (pageCount >= maxPages) break;
  }

  return {
    auth: 'authenticated',
    pointers: dedupePointers(collected, deps.maxResults),
    pageCount,
    truncated,
    partialErrorCode,
  };
}

/**
 * Enumerate Projects then project conversations (S2 required scope).
 * Breadth-first: page 1 for every project before deepen rounds (N3).
 * Routes are inferred (S2 residual risk #2) — failures/truncation are
 * observable via `coverage` / `errorCode`.
 *
 * @param {object} deps
 * @returns {Promise<{
 *   pointers: import('./messaging.js').PointerRecord[],
 *   fetchCount: number,
 *   coverage: 'ok'|'truncated'|'directory_failed'|'all_fetches_failed'|'empty_directory',
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
  // Plain limit only — include_harmony_projects dropped until live-confirmed (I-7).
  const projectQuery = pack?.projectListQuery ?? { limit: PROJECTS_MAX_PROJECTS };
  const projectsUrl = buildClaudeUrl(deps.origin, projectsPath, projectQuery);

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
      fetchCount,
      coverage: 'directory_failed',
      auth: 'login_required',
      errorCode: projectsResult.errorCode,
    };
  }
  if (projectsResult.auth !== 'authenticated') {
    if (typeof console !== 'undefined' && console.debug) {
      console.debug('[cogis:claude] projects directory failed', projectsResult.errorCode);
    }
    return {
      pointers: [],
      fetchCount,
      coverage: 'directory_failed',
      errorCode: projectsResult.errorCode ?? 'projects_directory_failed',
    };
  }

  const projects = extractProjects(projectsResult.payload).slice(0, PROJECTS_MAX_PROJECTS);
  if (projects.length === 0) {
    return {
      pointers: [],
      fetchCount,
      coverage: 'empty_directory',
    };
  }

  const template =
    pack?.endpoints?.projectConversations ??
    `/api/organizations/{orgId}/projects/{projectId}/conversations`;

  /** @type {import('./messaging.js').PointerRecord[]} */
  const collected = [];
  let attemptedFetches = 0;
  let successfulFetches = 0;
  let truncated = false;
  const maxPages = deps.projectMaxPages ?? PROJECT_CONVERSATION_MAX_PAGES;

  /** @type {{ uuid: string, offset: number, pageCount: number, hasMore: boolean, attempted: boolean, failed: boolean }[]} */
  const states = projects.map((p) => ({
    uuid: p.uuid,
    offset: 0,
    pageCount: 0,
    hasMore: true,
    attempted: false,
    failed: false,
  }));

  // Breadth-first rounds: round 0 = page 1 for every project, then deepen.
  outer: for (let round = 0; round < maxPages; round += 1) {
    for (const state of states) {
      if (!state.hasMore) continue;
      if (collected.length >= deps.maxResults) break outer;
      if (fetchCount >= PROJECTS_MAX_FETCHES || remainingMs(deps) < MIN_RTT_BUDGET_MS) {
        truncated = true;
        break outer;
      }
      if (deps.signal?.aborted) {
        const err = new Error('aborted');
        err.name = 'AbortError';
        throw err;
      }

      const path = template
        .replace('{orgId}', encodeURIComponent(deps.orgId))
        .replace('{projectId}', encodeURIComponent(state.uuid));
      const url = buildClaudeUrl(deps.origin, path, {
        limit: deps.pageSize,
        offset: state.offset,
      });

      try {
        const result = await fetchJson({
          fetchImpl: deps.fetchImpl,
          signal: deps.signal,
          url,
          isLoginShell: deps.isLoginShell,
        });
        fetchCount += 1;
        attemptedFetches += 1;
        state.attempted = true;

        if (result.auth !== 'authenticated' || !isRecognizedClaudeListPayload(result.payload)) {
          // Mixed-success must not look like a fully scanned project (N-1).
          state.failed = true;
          state.hasMore = false;
          continue;
        }

        successfulFetches += 1;
        state.pageCount += 1;
        const pageItems = extractClaudeConversationItems(result.payload);
        const room = deps.maxResults - collected.length;
        const pagePointers = matchClaudePage(result.payload, deps.query, room);
        collected.push(...pagePointers);

        if (pageItems.length < deps.pageSize) {
          state.hasMore = false;
        } else {
          state.offset += deps.pageSize;
        }
      } catch (err) {
        if (isAbortError(err)) throw err;
        state.attempted = true;
        state.failed = true;
        state.hasMore = false;
      }
    }
    if (!states.some((s) => s.hasMore)) break;
  }

  // Unattempted or failed projects mean the set was not fully readable (N-1).
  if (states.some((s) => !s.attempted || s.failed)) {
    truncated = true;
  }

  if (attemptedFetches > 0 && successfulFetches === 0) {
    if (typeof console !== 'undefined' && console.debug) {
      console.debug('[cogis:claude] all project conversation fetches failed');
    }
    return {
      pointers: [],
      fetchCount,
      coverage: 'all_fetches_failed',
      errorCode: 'projects_fetches_failed',
    };
  }

  if (truncated) {
    if (typeof console !== 'undefined' && console.debug) {
      console.debug('[cogis:claude] projects scan truncated', {
        attempted: states.filter((s) => s.attempted).length,
        failed: states.filter((s) => s.failed).length,
        total: states.length,
        fetchCount,
      });
    }
    return {
      pointers: dedupePointers(collected, deps.maxResults),
      fetchCount,
      coverage: 'truncated',
      errorCode: 'projects_truncated',
    };
  }

  return {
    pointers: dedupePointers(collected, deps.maxResults),
    fetchCount,
    coverage: 'ok',
  };
}

/**
 * Pure orchestration of Claude search given injectable fetchers.
 * Endpoint-first per S2 (DOM Recents search fallback deferred — BL-023; M1/M2
 * precedent). Never stores cookies/bodies.
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
  const deadlineAt = startedAt + platformBudgetMs;

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
    now,
    deadlineAt,
  });

  if (root.auth === 'login_required' && root.pointers.length === 0) {
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
  /** @type {string} */
  let projectsCoverage = 'skipped_budget';
  /** @type {string|undefined} */
  let projectsErrorCode;

  const rem = remainingMs({ deadlineAt, now });
  if (merged.length >= maxResults) {
    // Root already filled the match cap — Projects not needed for empty honesty.
    projectsCoverage = 'skipped_full';
  } else if (
    shouldAttemptProjectsSupplement({
      rootHitCount: merged.length,
      remainingMs: rem,
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
      // Match budget only — normalize/filter examines full pages (I-1).
      maxResults: maxResults - merged.length,
      isLoginShell: deps.isLoginShell,
      now,
      deadlineAt,
    });

    projectsCoverage = projectsEnum.coverage;
    projectsErrorCode = projectsEnum.errorCode;

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
  } else {
    // Time/fetch budget too low to attempt Projects with zero-or-partial root hits.
    projectsCoverage = 'skipped_budget';
    projectsErrorCode = 'projects_skipped_budget';
  }

  if (merged.length > 0) {
    return {
      status: 'ready',
      results: merged,
      capability: CAPABILITY,
      errorCode: root.truncated ? root.partialErrorCode : undefined,
    };
  }

  // Do not report US-3 empty when root or Projects coverage is incomplete (N-1/N-2).
  if (root.truncated || !projectsCoverageEstablished(projectsCoverage)) {
    return {
      status: projectsCoverage === 'skipped_budget' ? 'timeout' : 'unavailable',
      results: [],
      message: unavailableCopy('claude'),
      errorCode: root.truncated
        ? (root.partialErrorCode ?? 'root_coverage_unproven')
        : (projectsErrorCode ?? 'projects_coverage_unproven'),
    };
  }

  return {
    status: 'empty',
    results: [],
    capability: CAPABILITY,
    errorCode: undefined,
  };
}
