/**
 * Classic (non-module) ChatGPT content script.
 * Keeps the static content_scripts entry classic (no top-level import), then
 * dynamically imports the shared ES adapter — single owner for search/normalize/
 * pack wiring under extension/lib/.
 *
 * Those modules must be listed in manifest web_accessible_resources (MV3).
 */
(function () {
  'use strict';

  const MSG = {
    CHATGPT_SEARCH: 'CHATGPT_SEARCH',
    CHATGPT_SEARCH_RESULT: 'CHATGPT_SEARCH_RESULT',
    CHATGPT_SEARCH_CANCEL: 'CHATGPT_SEARCH_CANCEL',
    COGIS_PING: 'COGIS_PING',
  };

  const DEFAULT_LOGIN_BUTTON_SEL = '[data-testid="login-button"]';
  const DEFAULT_LOGIN_URL = 'https://chatgpt.com/';

  /** @type {Map<string, AbortController>} */
  const controllers = new Map();

  /** @type {Promise<any>|null} */
  let adapterPromise = null;
  let loginButtonSel = DEFAULT_LOGIN_BUTTON_SEL;
  let loginUrl = DEFAULT_LOGIN_URL;

  function loadAdapter() {
    if (!adapterPromise) {
      adapterPromise = import(chrome.runtime.getURL('lib/chatgpt-adapter.js'))
        .then(function (adapterMod) {
          return import(chrome.runtime.getURL('lib/selectors/loader.js')).then(
            function (loaderMod) {
              function hydrateFromPack() {
                try {
                  const pack = loaderMod.getPlatformSelectors('chatgpt');
                  if (pack && pack.selectors && pack.selectors.loginButton) {
                    loginButtonSel = pack.selectors.loginButton;
                  }
                  if (pack && pack.loginUrl) {
                    loginUrl = pack.loginUrl;
                  }
                } catch (_e) {
                  // Keep defaults if pack hydrate fails.
                }
                return adapterMod;
              }
              // Local pack first — never block search on a hung remote pack fetch (B2).
              hydrateFromPack();
              var refreshOpts = {
                fetchImpl:
                  typeof fetch === 'function'
                    ? fetch.bind(globalThis)
                    : function () {
                        return Promise.reject(new TypeError('fetch unavailable'));
                      },
              };
              loaderMod.refreshSelectorPack(refreshOpts).then(hydrateFromPack, function () {});
              return adapterMod;
            },
          );
        })
        .catch(function (err) {
          // Allow a later search to retry the import (e.g. after reload).
          adapterPromise = null;
          throw err;
        });
    }
    return adapterPromise;
  }

  function isLoginButtonVisible() {
    try {
      const el = document.querySelector(loginButtonSel);
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

  function isImportError(err) {
    if (!err) return false;
    const name = String(err.name || '');
    const message = String(err.message || '');
    return (
      name === 'TypeError' ||
      /Failed to fetch/i.test(message) ||
      /error loading dynamically imported module/i.test(message) ||
      /Importing a module script failed/i.test(message)
    );
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
      const adapterMod = await loadAdapter();
      const origin =
        location.origin.indexOf('http') === 0 ? location.origin : 'https://chatgpt.com';
      const outcome = await adapterMod.searchChatgpt({
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
        loginUrl: outcome.loginUrl || loginUrl,
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
        errorCode: isImportError(err) ? 'adapter_import_failed' : 'content_exception',
        message: 'ChatGPT is temporarily unavailable.',
      };
    } finally {
      controllers.delete(requestId);
    }
  }

  chrome.runtime.onMessage.addListener(function (message, _sender, sendResponse) {
    if (!message || typeof message.type !== 'string') return false;

    if (message.type === MSG.COGIS_PING) {
      sendResponse({ ok: true, platform: 'chatgpt' });
      return false;
    }

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
