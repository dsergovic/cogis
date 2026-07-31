/**
 * Classic (non-module) Perplexity content script.
 * Keeps the static content_scripts entry classic (no top-level import), then
 * dynamically imports the shared ES adapter — single owner for search/normalize/
 * pack wiring under extension/lib/.
 *
 * Those modules must be listed in manifest web_accessible_resources (MV3).
 */
(function () {
  'use strict';

  const MSG = {
    PERPLEXITY_SEARCH: 'PERPLEXITY_SEARCH',
    PERPLEXITY_SEARCH_RESULT: 'PERPLEXITY_SEARCH_RESULT',
    PERPLEXITY_SEARCH_CANCEL: 'PERPLEXITY_SEARCH_CANCEL',
    COGIS_PING: 'COGIS_PING',
  };

  const DEFAULT_SIGN_IN_SEL =
    'a[href*="/signin"], button[aria-label*="Sign in" i], a[aria-label*="Sign in" i]';
  const DEFAULT_LOGIN_URL = 'https://www.perplexity.ai/';

  /** @type {Map<string, AbortController>} */
  const controllers = new Map();

  /** @type {Promise<any>|null} */
  let adapterPromise = null;
  let signInSel = DEFAULT_SIGN_IN_SEL;
  let loginUrl = DEFAULT_LOGIN_URL;

  function loadAdapter() {
    if (!adapterPromise) {
      adapterPromise = import(chrome.runtime.getURL('lib/perplexity-adapter.js'))
        .then(function (adapterMod) {
          return import(chrome.runtime.getURL('lib/selectors/loader.js')).then(
            function (loaderMod) {
              function hydrateFromPack() {
                try {
                  const pack = loaderMod.getPlatformSelectors('perplexity');
                  if (pack && pack.selectors && pack.selectors.signIn) {
                    signInSel = pack.selectors.signIn;
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
          adapterPromise = null;
          throw err;
        });
    }
    return adapterPromise;
  }

  function isVisible(el) {
    if (!el) return false;
    try {
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    } catch {
      return false;
    }
  }

  function isSignInVisible() {
    try {
      const nodes = document.querySelectorAll(signInSel);
      for (let i = 0; i < nodes.length; i += 1) {
        if (isVisible(nodes[i])) return true;
      }
      return false;
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
        location.origin.indexOf('http') === 0 ? location.origin : 'https://www.perplexity.ai';
      const outcome = await adapterMod.searchPerplexity({
        query: query,
        origin: origin,
        fetchImpl: fetch.bind(globalThis),
        isSignInVisible: isSignInVisible,
        signal: ac.signal,
        platformBudgetMs:
          typeof message.platformBudgetMs === 'number' ? message.platformBudgetMs : undefined,
      });
      return {
        type: MSG.PERPLEXITY_SEARCH_RESULT,
        requestId: requestId,
        platform: 'perplexity',
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
          type: MSG.PERPLEXITY_SEARCH_RESULT,
          requestId: requestId,
          platform: 'perplexity',
          status: 'unavailable',
          results: [],
          errorCode: 'aborted',
          message: 'Perplexity is temporarily unavailable.',
        };
      }
      return {
        type: MSG.PERPLEXITY_SEARCH_RESULT,
        requestId: requestId,
        platform: 'perplexity',
        status: 'unavailable',
        results: [],
        errorCode: isImportError(err) ? 'adapter_import_failed' : 'content_exception',
        message: 'Perplexity is temporarily unavailable.',
      };
    } finally {
      controllers.delete(requestId);
    }
  }

  chrome.runtime.onMessage.addListener(function (message, _sender, sendResponse) {
    if (!message || typeof message.type !== 'string') return false;

    if (message.type === MSG.COGIS_PING) {
      sendResponse({ ok: true, platform: 'perplexity' });
      return false;
    }

    if (message.type === MSG.PERPLEXITY_SEARCH_CANCEL) {
      abortRequest(message.requestId);
      sendResponse({ ok: true });
      return false;
    }

    if (message.type !== MSG.PERPLEXITY_SEARCH) return false;

    handleSearch(message).then(sendResponse);
    return true;
  });
})();
