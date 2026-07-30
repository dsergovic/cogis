/**
 * Classic (non-module) Gemini content script.
 * Keeps the static content_scripts entry classic (no top-level import), then
 * dynamically imports the shared ES adapter — single owner for DOM-first
 * history scan / title-match under extension/lib/.
 *
 * Those modules must be listed in manifest web_accessible_resources (MV3).
 *
 * Search is DOM-first per S4 (no stable first-party history search endpoint).
 */
(function () {
  'use strict';

  const MSG = {
    GEMINI_SEARCH: 'GEMINI_SEARCH',
    GEMINI_SEARCH_RESULT: 'GEMINI_SEARCH_RESULT',
    GEMINI_SEARCH_CANCEL: 'GEMINI_SEARCH_CANCEL',
    COGIS_PING: 'COGIS_PING',
  };

  const DEFAULT_LOGIN_URL = 'https://gemini.google.com/app';

  /** @type {Map<string, AbortController>} */
  const controllers = new Map();

  /** @type {Promise<any>|null} */
  let adapterPromise = null;
  let loginUrl = DEFAULT_LOGIN_URL;

  function loadAdapter() {
    if (!adapterPromise) {
      adapterPromise = import(chrome.runtime.getURL('lib/gemini-adapter.js'))
        .then(function (adapterMod) {
          return import(chrome.runtime.getURL('lib/selectors/loader.js')).then(
            function (loaderMod) {
              function hydrateFromPack() {
                try {
                  const pack = loaderMod.getPlatformSelectors('gemini');
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
          adapterPromise = null;
          throw err;
        });
    }
    return adapterPromise;
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
      const outcome = await adapterMod.searchGemini({
        query: query,
        document: document,
        signal: ac.signal,
        platformBudgetMs:
          typeof message.platformBudgetMs === 'number' ? message.platformBudgetMs : undefined,
      });
      return {
        type: MSG.GEMINI_SEARCH_RESULT,
        requestId: requestId,
        platform: 'gemini',
        capability: outcome.capability || 'title-match',
        status: outcome.status,
        results: outcome.results || [],
        errorCode: outcome.errorCode,
        message: outcome.message,
        loginUrl: outcome.loginUrl || loginUrl,
      };
    } catch (err) {
      if (isAbortError(err)) {
        return {
          type: MSG.GEMINI_SEARCH_RESULT,
          requestId: requestId,
          platform: 'gemini',
          status: 'unavailable',
          results: [],
          errorCode: 'aborted',
          message: 'Gemini is temporarily unavailable.',
        };
      }
      return {
        type: MSG.GEMINI_SEARCH_RESULT,
        requestId: requestId,
        platform: 'gemini',
        status: 'unavailable',
        results: [],
        errorCode: isImportError(err) ? 'adapter_import_failed' : 'content_exception',
        message: 'Gemini is temporarily unavailable.',
      };
    } finally {
      controllers.delete(requestId);
    }
  }

  chrome.runtime.onMessage.addListener(function (message, _sender, sendResponse) {
    if (!message || typeof message.type !== 'string') return false;

    if (message.type === MSG.COGIS_PING) {
      sendResponse({ ok: true, platform: 'gemini' });
      return false;
    }

    if (message.type === MSG.GEMINI_SEARCH_CANCEL) {
      abortRequest(message.requestId);
      sendResponse({ ok: true });
      return false;
    }

    if (message.type !== MSG.GEMINI_SEARCH) return false;

    handleSearch(message).then(sendResponse);
    return true;
  });
})();
