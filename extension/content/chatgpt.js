/**
 * Classic (non-module) ChatGPT content script.
 * Same-origin session + search fetches only; tokens stay in memory for the request.
 * Keep logic aligned with extension/lib/chatgpt-adapter.js + results.js.
 */
(function () {
  'use strict';

  const MSG = {
    CHATGPT_SEARCH: 'CHATGPT_SEARCH',
    CHATGPT_SEARCH_RESULT: 'CHATGPT_SEARCH_RESULT',
    CHATGPT_SEARCH_CANCEL: 'CHATGPT_SEARCH_CANCEL',
  };

  const MAX_RESULTS = 20;
  const LOGIN_URL = 'https://chatgpt.com/';
  const SESSION_PATH = '/api/auth/session';
  const SEARCH_PATH = '/backend-api/conversations/search';
  const SEARCH_PARAMS = ['query', 'q'];
  const LOGIN_BUTTON_SEL = '[data-testid="login-button"]';

  /** @type {Map<string, AbortController>} */
  const controllers = new Map();

  function loginRequiredCopy() {
    return 'Please log in to ChatGPT';
  }

  function unavailableCopy() {
    return 'ChatGPT is temporarily unavailable.';
  }

  function isLoginButtonVisible() {
    try {
      const el = document.querySelector(LOGIN_BUTTON_SEL);
      if (!el) return false;
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    } catch {
      return false;
    }
  }

  function extractAccessToken(sessionJson) {
    if (!sessionJson || typeof sessionJson !== 'object') return null;
    const token = sessionJson.accessToken || sessionJson.access_token;
    return typeof token === 'string' && token.trim() ? token.trim() : null;
  }

  function classifySessionOutcome(input) {
    const { status, ok, contentType, sessionJson, parseOk, loginVisible } = input;
    if (status >= 500 || status === 0) return 'unavailable';
    if (status === 401 || status === 403) return 'login_required';
    const looksHtml =
      (typeof contentType === 'string' && contentType.toLowerCase().includes('text/html')) ||
      !parseOk;
    if (looksHtml) return loginVisible ? 'login_required' : 'unavailable';
    if (!ok) return loginVisible ? 'login_required' : 'unavailable';
    return extractAccessToken(sessionJson) ? 'authenticated' : 'login_required';
  }

  function isRecognizedSearchPayload(payload) {
    if (Array.isArray(payload)) return true;
    if (!payload || typeof payload !== 'object') return false;
    return (
      Array.isArray(payload.items) ||
      Array.isArray(payload.data) ||
      Array.isArray(payload.conversations) ||
      Array.isArray(payload.results)
    );
  }

  function extractItems(payload) {
    if (!isRecognizedSearchPayload(payload)) return [];
    if (Array.isArray(payload)) return payload.filter((x) => x && typeof x === 'object');
    if (Array.isArray(payload.items))
      return payload.items.filter((x) => x && typeof x === 'object');
    if (Array.isArray(payload.data)) return payload.data.filter((x) => x && typeof x === 'object');
    if (Array.isArray(payload.conversations))
      return payload.conversations.filter((x) => x && typeof x === 'object');
    if (Array.isArray(payload.results))
      return payload.results.filter((x) => x && typeof x === 'object');
    return [];
  }

  function unixSecondsToIso(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n) || n <= 0) return null;
    const ms = n > 1e12 ? n : n * 1000;
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  function normalizeHit(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = raw.id || raw.conversation_id || raw.conversationId;
    const titleRaw = raw.title || raw.name || raw.conversation_title;
    const title = typeof titleRaw === 'string' && titleRaw.trim() ? titleRaw.trim() : null;
    if (typeof id !== 'string' || !id.trim() || !title) return null;
    return {
      platform: 'chatgpt',
      title: title,
      dateIso:
        unixSecondsToIso(raw.update_time) ||
        unixSecondsToIso(raw.updateTime) ||
        unixSecondsToIso(raw.create_time) ||
        unixSecondsToIso(raw.createTime),
      deepLinkUrl: 'https://chatgpt.com/c/' + encodeURIComponent(id.trim()),
      prefillSupported: false,
    };
  }

  function normalizeResponse(payload) {
    const items = extractItems(payload);
    const pointers = [];
    for (let i = 0; i < items.length; i += 1) {
      const p = normalizeHit(items[i]);
      if (p) pointers.push(p);
      if (pointers.length >= MAX_RESULTS) break;
    }
    return pointers;
  }

  function buildSearchUrls(origin, query) {
    return SEARCH_PARAMS.map(function (name) {
      const url = new URL(SEARCH_PATH, origin);
      url.searchParams.set(name, query);
      url.searchParams.set('limit', String(MAX_RESULTS));
      return url.toString();
    });
  }

  function isAbortError(err) {
    return !!err && (err.name === 'AbortError' || err.code === 'ABORT_ERR');
  }

  function abortRequest(requestId) {
    const existing = controllers.get(requestId);
    if (existing) {
      existing.abort();
      controllers.delete(requestId);
    }
  }

  async function searchChatgpt(query, signal) {
    const origin = location.origin.indexOf('http') === 0 ? location.origin : 'https://chatgpt.com';

    let sessionRes;
    try {
      sessionRes = await fetch(new URL(SESSION_PATH, origin).toString(), {
        credentials: 'include',
        headers: { Accept: 'application/json' },
        signal: signal,
      });
    } catch (err) {
      if (isAbortError(err)) throw err;
      if (isLoginButtonVisible()) {
        return {
          status: 'login_required',
          results: [],
          message: loginRequiredCopy(),
          loginUrl: LOGIN_URL,
          errorCode: 'session_fetch_failed_login',
        };
      }
      return {
        status: 'unavailable',
        results: [],
        message: unavailableCopy(),
        errorCode: 'session_fetch_failed',
      };
    }

    const contentType = sessionRes.headers.get('content-type');
    let sessionJson = null;
    let parseOk = false;
    try {
      sessionJson = await sessionRes.json();
      parseOk = sessionJson !== null && typeof sessionJson === 'object';
    } catch (_e) {
      sessionJson = null;
      parseOk = false;
    }

    const sessionClass = classifySessionOutcome({
      status: sessionRes.status,
      ok: sessionRes.ok,
      contentType: contentType,
      sessionJson: sessionJson,
      parseOk: parseOk,
      loginVisible: isLoginButtonVisible(),
    });

    if (sessionClass === 'login_required') {
      return {
        status: 'login_required',
        results: [],
        message: loginRequiredCopy(),
        loginUrl: LOGIN_URL,
        errorCode: 'no_access_token',
      };
    }
    if (sessionClass === 'unavailable') {
      return {
        status: 'unavailable',
        results: [],
        message: unavailableCopy(),
        errorCode: 'session_unavailable',
      };
    }

    const accessToken = extractAccessToken(sessionJson);
    if (!accessToken) {
      return {
        status: 'login_required',
        results: [],
        message: loginRequiredCopy(),
        loginUrl: LOGIN_URL,
        errorCode: 'no_access_token',
      };
    }

    const urls = buildSearchUrls(origin, query);
    let lastError = null;
    let sawRecognizedEmpty = false;

    for (let i = 0; i < urls.length; i += 1) {
      const url = urls[i];
      const isLast = i === urls.length - 1;
      let res;
      try {
        res = await fetch(url, {
          credentials: 'include',
          headers: {
            Accept: 'application/json',
            Authorization: 'Bearer ' + accessToken,
          },
          signal: signal,
        });
      } catch (err) {
        if (isAbortError(err)) throw err;
        lastError = err;
        continue;
      }

      if (res.status === 401 || res.status === 403) {
        return {
          status: 'login_required',
          results: [],
          message: loginRequiredCopy(),
          loginUrl: LOGIN_URL,
          errorCode: 'search_' + res.status,
        };
      }
      if (res.status >= 500) {
        return {
          status: 'unavailable',
          results: [],
          message: unavailableCopy(),
          errorCode: 'search_' + res.status,
        };
      }
      if (!res.ok) {
        lastError = new Error('search HTTP ' + res.status);
        continue;
      }

      let payload;
      try {
        payload = await res.json();
      } catch (_e) {
        if (!isLast) continue;
        return {
          status: 'unavailable',
          results: [],
          message: unavailableCopy(),
          errorCode: 'search_non_json',
        };
      }

      if (!isRecognizedSearchPayload(payload)) {
        lastError = new Error('unrecognized search payload');
        continue;
      }

      const results = normalizeResponse(payload);
      if (results.length > 0) {
        return {
          status: 'ready',
          results: results,
          capability: 'full-text',
        };
      }

      sawRecognizedEmpty = true;
      if (!isLast) continue;
    }

    if (sawRecognizedEmpty) {
      return { status: 'empty', results: [], capability: 'full-text' };
    }
    return {
      status: 'unavailable',
      results: [],
      message: unavailableCopy(),
      errorCode: lastError ? 'search_failed' : 'search_exhausted',
    };
  }

  async function handleSearch(message) {
    const requestId = message.requestId;
    const query = message.query;
    abortRequest(requestId);
    const ac = new AbortController();
    controllers.set(requestId, ac);
    try {
      const outcome = await searchChatgpt(query, ac.signal);
      return {
        type: MSG.CHATGPT_SEARCH_RESULT,
        requestId: requestId,
        platform: 'chatgpt',
        capability: outcome.capability || 'full-text',
        status: outcome.status,
        results: outcome.results || [],
        errorCode: outcome.errorCode,
        message: outcome.message,
        loginUrl: outcome.loginUrl || LOGIN_URL,
      };
    } catch (err) {
      if (isAbortError(err)) {
        return {
          type: MSG.CHATGPT_SEARCH_RESULT,
          requestId: requestId,
          platform: 'chatgpt',
          status: 'unavailable',
          results: [],
          errorCode: 'aborted',
          message: unavailableCopy(),
        };
      }
      return {
        type: MSG.CHATGPT_SEARCH_RESULT,
        requestId: requestId,
        platform: 'chatgpt',
        status: 'unavailable',
        results: [],
        errorCode: 'content_exception',
        message: unavailableCopy(),
      };
    } finally {
      controllers.delete(requestId);
    }
  }

  chrome.runtime.onMessage.addListener(function (message, _sender, sendResponse) {
    if (!message || typeof message.type !== 'string') return false;

    if (message.type === MSG.CHATGPT_SEARCH_CANCEL) {
      abortRequest(message.requestId);
      sendResponse({ ok: true });
      return false;
    }

    if (message.type !== MSG.CHATGPT_SEARCH) return false;

    handleSearch(message).then(sendResponse);
    return true;
  });
})();
