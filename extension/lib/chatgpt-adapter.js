import { getPlatformSelectors } from './selectors/loader.js';
import { normalizeChatgptSearchResponse } from './results.js';
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
 * Map HTTP / parse outcomes to adapter status.
 * @param {number} status
 * @param {boolean} hasToken
 */
export function classifyAuthFailure(status, hasToken) {
  if (!hasToken) return 'login_required';
  if (status === 401 || status === 403) return 'login_required';
  if (status >= 500) return 'unavailable';
  if (status === 0) return 'unavailable';
  return 'unavailable';
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
 * Pure orchestration of ChatGPT search given injectable fetchers.
 * Never stores tokens or message bodies.
 *
 * @param {object} deps
 * @param {string} deps.query
 * @param {string} [deps.origin]
 * @param {(input: string, init?: RequestInit) => Promise<Response>} deps.fetchImpl
 * @param {() => boolean} [deps.isLoginButtonVisible]
 * @param {number} [deps.maxResults]
 */
export async function searchChatgpt(deps) {
  const origin = deps.origin ?? PLATFORMS.chatgpt.origin;
  const fetchImpl = deps.fetchImpl;
  const maxResults = deps.maxResults ?? MAX_RESULTS_PER_PLATFORM;
  const pack = getPlatformSelectors('chatgpt');
  const sessionPath = pack?.endpoints?.session ?? '/api/auth/session';

  let sessionRes;
  try {
    sessionRes = await fetchImpl(new URL(sessionPath, origin).toString(), {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
  } catch {
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

  let sessionJson = null;
  try {
    sessionJson = await sessionRes.json();
  } catch {
    sessionJson = null;
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

  for (const url of urls) {
    let res;
    try {
      res = await fetchImpl(url, {
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      });
    } catch (err) {
      lastError = err;
      continue;
    }

    if (res.status === 401 || res.status === 403) {
      return {
        status: 'login_required',
        results: [],
        message: loginRequiredCopy('chatgpt'),
        loginUrl: PLATFORMS.chatgpt.loginUrl,
        errorCode: `search_${res.status}`,
      };
    }

    if (res.status >= 500) {
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
      return {
        status: 'unavailable',
        results: [],
        message: unavailableCopy('chatgpt'),
        errorCode: 'search_non_json',
      };
    }

    const results = normalizeChatgptSearchResponse(payload, { max: maxResults });
    return {
      status: results.length === 0 ? 'empty' : 'ready',
      results,
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
