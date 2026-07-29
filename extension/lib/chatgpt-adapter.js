import { getPlatformSelectors } from './selectors/loader.js';
import { isRecognizedSearchPayload, normalizeChatgptSearchResponse } from './results.js';
import { loginRequiredCopy, unavailableCopy, PLATFORMS } from './platforms.js';
import { MAX_RESULTS_PER_PLATFORM } from './timeouts.js';

/**
 * Extract Bearer access token from /api/auth/session JSON.
 * Token is returned for the in-flight request only — never persist.
 * @param {unknown} sessionJson
 * @returns {string|null}
 */
export function extractAccessToken(sessionJson) {
  if (!sessionJson || typeof sessionJson !== 'object') return null;
  const obj = /** @type {Record<string, unknown>} */ (sessionJson);
  const token = obj.accessToken ?? obj.access_token;
  return typeof token === 'string' && token.trim() ? token.trim() : null;
}

/**
 * Classify session endpoint outcome per S5.
 * Only successful JSON with no usable token (or positive logged-out DOM) → login_required.
 *
 * @param {{
 *   status: number,
 *   ok: boolean,
 *   contentType?: string|null,
 *   sessionJson: unknown,
 *   parseOk: boolean,
 *   isLoginButtonVisible?: boolean,
 * }} input
 * @returns {'authenticated'|'login_required'|'unavailable'}
 */
export function classifySessionOutcome(input) {
  const { status, ok, contentType, sessionJson, parseOk, isLoginButtonVisible } = input;

  if (status >= 500 || status === 0) return 'unavailable';
  if (status === 401 || status === 403) return 'login_required';

  const looksHtml =
    (typeof contentType === 'string' && contentType.toLowerCase().includes('text/html')) ||
    !parseOk;

  if (looksHtml) {
    return isLoginButtonVisible ? 'login_required' : 'unavailable';
  }

  if (!ok) {
    return isLoginButtonVisible ? 'login_required' : 'unavailable';
  }

  const token = extractAccessToken(sessionJson);
  if (token) return 'authenticated';
  return 'login_required';
}

/**
 * Map search HTTP status (S5 matrix helper — single-sourced).
 * @param {number} status
 * @param {boolean} hasToken
 * @returns {'login_required'|'unavailable'|null} null means caller continues probing
 */
export function classifyAuthFailure(status, hasToken) {
  if (!hasToken) return 'login_required';
  if (status === 401 || status === 403) return 'login_required';
  if (status >= 500) return 'unavailable';
  if (status === 0) return 'unavailable';
  return null;
}

/**
 * Build search URL candidates (S1 prefers `query`; vivim docs use `q`).
 * @param {string} origin
 * @param {string} query
 * @param {string[]} [paramNames]
 */
export function buildSearchUrls(origin, query, paramNames = ['query', 'q']) {
  const pack = getPlatformSelectors('chatgpt');
  const path = pack?.endpoints?.search ?? '/backend-api/conversations/search';
  const names = pack?.searchQueryParams?.length ? pack.searchQueryParams : paramNames;
  return names.map((name) => {
    const url = new URL(path, origin);
    url.searchParams.set(name, query);
    url.searchParams.set('limit', String(MAX_RESULTS_PER_PLATFORM));
    return url.toString();
  });
}

/**
 * @param {unknown} err
 */
function isAbortError(err) {
  return (
    !!err &&
    /** @type {{ name?: string }} */ ((err).name === 'AbortError' ||
      /** @type {{ code?: string }} */ (err).code === 'ABORT_ERR')
  );
}

/**
 * Pure orchestration of ChatGPT search given injectable fetchers.
 * Never stores tokens or message bodies.
 *
 * @param {object} deps
 * @param {string} deps.query
 * @param {string} [deps.origin]
 * @param {(input: string, init?: RequestInit) => Promise<Response>} deps.fetchImpl
 * @param {() => boolean} [deps.isLoginButtonVisible]
 * @param {number} [deps.maxResults]
 * @param {AbortSignal} [deps.signal]
 */
export async function searchChatgpt(deps) {
  const origin = deps.origin ?? PLATFORMS.chatgpt.origin;
  const fetchImpl = deps.fetchImpl;
  const maxResults = deps.maxResults ?? MAX_RESULTS_PER_PLATFORM;
  const signal = deps.signal;
  const pack = getPlatformSelectors('chatgpt');
  const sessionPath = pack?.endpoints?.session ?? '/api/auth/session';

  if (signal?.aborted) {
    const err = new Error('aborted');
    err.name = 'AbortError';
    throw err;
  }

  let sessionRes;
  try {
    sessionRes = await fetchImpl(new URL(sessionPath, origin).toString(), {
      credentials: 'include',
      headers: { Accept: 'application/json' },
      signal,
    });
  } catch (err) {
    if (isAbortError(err)) throw err;
    if (deps.isLoginButtonVisible?.()) {
      return {
        status: 'login_required',
        results: [],
        message: loginRequiredCopy('chatgpt'),
        loginUrl: PLATFORMS.chatgpt.loginUrl,
        errorCode: 'session_fetch_failed_login',
      };
    }
    return {
      status: 'unavailable',
      results: [],
      message: unavailableCopy('chatgpt'),
      errorCode: 'session_fetch_failed',
    };
  }

  const contentType = sessionRes.headers?.get?.('content-type') ?? null;
  let sessionJson = null;
  let parseOk = false;
  try {
    sessionJson = await sessionRes.json();
    parseOk = sessionJson !== null && typeof sessionJson === 'object';
  } catch {
    sessionJson = null;
    parseOk = false;
  }

  const sessionClass = classifySessionOutcome({
    status: sessionRes.status,
    ok: sessionRes.ok,
    contentType,
    sessionJson,
    parseOk,
    isLoginButtonVisible: deps.isLoginButtonVisible?.() ?? false,
  });

  if (sessionClass === 'login_required') {
    return {
      status: 'login_required',
      results: [],
      message: loginRequiredCopy('chatgpt'),
      loginUrl: PLATFORMS.chatgpt.loginUrl,
      errorCode: 'no_access_token',
    };
  }
  if (sessionClass === 'unavailable') {
    return {
      status: 'unavailable',
      results: [],
      message: unavailableCopy('chatgpt'),
      errorCode: 'session_unavailable',
    };
  }

  const accessToken = extractAccessToken(sessionJson);
  if (!accessToken) {
    return {
      status: 'login_required',
      results: [],
      message: loginRequiredCopy('chatgpt'),
      loginUrl: PLATFORMS.chatgpt.loginUrl,
      errorCode: 'no_access_token',
    };
  }

  const urls = buildSearchUrls(origin, deps.query);
  let lastError = null;
  let sawRecognizedEmpty = false;

  for (let i = 0; i < urls.length; i += 1) {
    const url = urls[i];
    const isLast = i === urls.length - 1;
    let res;
    try {
      res = await fetchImpl(url, {
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        signal,
      });
    } catch (err) {
      if (isAbortError(err)) throw err;
      lastError = err;
      continue;
    }

    const authClass = classifyAuthFailure(res.status, true);
    if (authClass === 'login_required') {
      return {
        status: 'login_required',
        results: [],
        message: loginRequiredCopy('chatgpt'),
        loginUrl: PLATFORMS.chatgpt.loginUrl,
        errorCode: `search_${res.status}`,
      };
    }
    if (authClass === 'unavailable') {
      return {
        status: 'unavailable',
        results: [],
        message: unavailableCopy('chatgpt'),
        errorCode: `search_${res.status}`,
      };
    }

    if (!res.ok) {
      lastError = new Error(`search HTTP ${res.status}`);
      continue;
    }

    let payload;
    try {
      payload = await res.json();
    } catch {
      if (!isLast) continue;
      return {
        status: 'unavailable',
        results: [],
        message: unavailableCopy('chatgpt'),
        errorCode: 'search_non_json',
      };
    }

    if (!isRecognizedSearchPayload(payload)) {
      lastError = new Error('unrecognized search payload');
      continue;
    }

    const results = normalizeChatgptSearchResponse(payload, { max: maxResults });
    if (results.length > 0) {
      return {
        status: 'ready',
        results,
        capability: 'full-text',
        errorCode: undefined,
      };
    }

    sawRecognizedEmpty = true;
    // Empty/unrecognized-empty: try alternate query param before declaring empty.
    if (!isLast) continue;
  }

  if (sawRecognizedEmpty) {
    return {
      status: 'empty',
      results: [],
      capability: 'full-text',
      errorCode: undefined,
    };
  }

  if (lastError) {
    return {
      status: 'unavailable',
      results: [],
      message: unavailableCopy('chatgpt'),
      errorCode: 'search_failed',
    };
  }

  return {
    status: 'unavailable',
    results: [],
    message: unavailableCopy('chatgpt'),
    errorCode: 'search_exhausted',
  };
}
