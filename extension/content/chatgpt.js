/**
 * Classic (non-module) ChatGPT content script.
 * Keeps the static content_scripts entry classic (no top-level import), then
 * dynamically imports the shared ES adapter — single owner for search/normalize/
 * pack wiring under extension/lib/.
 */
(function () {
  'use strict';

  const MSG = {
    CHATGPT_SEARCH: 'CHATGPT_SEARCH',
    CHATGPT_SEARCH_RESULT: 'CHATGPT_SEARCH_RESULT',
    CHATGPT_SEARCH_CANCEL: 'CHATGPT_SEARCH_CANCEL',
  };

  const LOGIN_BUTTON_SEL = '[data-testid="login-button"]';
  const LOGIN_URL = 'https://chatgpt.com/';

  /** @type {Map<string, AbortController>} */
  const controllers = new Map();

  /** @type {Promise<typeof import('../lib/chatgpt-adapter.js')>|null} */
  let adapterPromise = null;

  function loadAdapter() {
    if (!adapterPromise) {
      adapterPromise = import(chrome.runtime.getURL('lib/chatgpt-adapter.js'));
    }
    return adapterPromise;
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

  async function handleSearch(message) {
    const requestId = message.requestId;
    const query = message.query;
    abortRequest(requestId);
    const ac = new AbortController();
    controllers.set(requestId, ac);

    try {
      const { searchChatgpt } = await loadAdapter();
      const origin =
        location.origin.indexOf('http') === 0 ? location.origin : 'https://chatgpt.com';
      const outcome = await searchChatgpt({
        query: query,
        origin: origin,
        fetchImpl: fetch.bind(globalThis),
        isLoginButtonVisible: isLoginButtonVisible,
        signal: ac.signal,
      });
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
          message: 'ChatGPT is temporarily unavailable.',
        };
      }
      return {
        type: MSG.CHATGPT_SEARCH_RESULT,
        requestId: requestId,
        platform: 'chatgpt',
        status: 'unavailable',
        results: [],
        errorCode: 'content_exception',
        message: 'ChatGPT is temporarily unavailable.',
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
