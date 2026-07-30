/**
 * Classic (non-module) Claude content script.
 * Keeps the static content_scripts entry classic (no top-level import), then
 * dynamically imports the shared ES adapter — single owner for search/normalize/
 * pack wiring under extension/lib/.
 *
 * Those modules must be listed in manifest web_accessible_resources (MV3).
 *
 * Search is endpoint-only (S2 preferred path). DOM Recents/search fallback is
 * deferred (BL-023) pending human choice; DOM is used for login-shell auth
 * signals only — consistent with M1/M2 endpoint-only precedent.
 */
(function () {
  'use strict';

  const MSG = {
    CLAUDE_SEARCH: 'CLAUDE_SEARCH',
    CLAUDE_SEARCH_RESULT: 'CLAUDE_SEARCH_RESULT',
    CLAUDE_SEARCH_CANCEL: 'CLAUDE_SEARCH_CANCEL',
    COGIS_PING: 'COGIS_PING',
  };

  const DEFAULT_LOGIN_SHELL_SEL =
    'a[href*="/login"], button[aria-label*="Continue with Google" i], a[aria-label*="Continue with Google" i], button[aria-label*="Continue with email" i]';
  const DEFAULT_LOGIN_URL = 'https://claude.ai/login';

  /** @type {Map<string, AbortController>} */
  const controllers = new Map();

  /** @type {Promise<any>|null} */
  let adapterPromise = null;
  let loginShellSel = DEFAULT_LOGIN_SHELL_SEL;
  let loginUrl = DEFAULT_LOGIN_URL;

  function loadAdapter() {
    if (!adapterPromise) {
      adapterPromise = import(chrome.runtime.getURL('lib/claude-adapter.js'))
        .then(function (adapterMod) {
          return import(chrome.runtime.getURL('lib/selectors/loader.js')).then(
            function (loaderMod) {
              function hydrateFromPack() {
                try {
                  const pack = loaderMod.getPlatformSelectors('claude');
                  if (pack && pack.selectors && pack.selectors.loginShell) {
                    loginShellSel = pack.selectors.loginShell;
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

  function isLoginShell() {
    try {
      const path = String(location.pathname || '');
      if (path.indexOf('/login') !== -1) return true;
      const nodes = document.querySelectorAll(loginShellSel);
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
      const origin = location.origin.indexOf('http') === 0 ? location.origin : 'https://claude.ai';
      const outcome = await adapterMod.searchClaude({
        query: query,
        origin: origin,
        fetchImpl: fetch.bind(globalThis),
        isLoginShell: isLoginShell,
        signal: ac.signal,
        platformBudgetMs:
          typeof message.platformBudgetMs === 'number' ? message.platformBudgetMs : undefined,
      });
      return {
        type: MSG.CLAUDE_SEARCH_RESULT,
        requestId: requestId,
        platform: 'claude',
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
          type: MSG.CLAUDE_SEARCH_RESULT,
          requestId: requestId,
          platform: 'claude',
          status: 'unavailable',
          results: [],
          errorCode: 'aborted',
          message: 'Claude is temporarily unavailable.',
        };
      }
      return {
        type: MSG.CLAUDE_SEARCH_RESULT,
        requestId: requestId,
        platform: 'claude',
        status: 'unavailable',
        results: [],
        errorCode: isImportError(err) ? 'adapter_import_failed' : 'content_exception',
        message: 'Claude is temporarily unavailable.',
      };
    } finally {
      controllers.delete(requestId);
    }
  }

  chrome.runtime.onMessage.addListener(function (message, _sender, sendResponse) {
    if (!message || typeof message.type !== 'string') return false;

    if (message.type === MSG.COGIS_PING) {
      sendResponse({ ok: true, platform: 'claude' });
      return false;
    }

    if (message.type === MSG.CLAUDE_SEARCH_CANCEL) {
      abortRequest(message.requestId);
      sendResponse({ ok: true });
      return false;
    }

    if (message.type !== MSG.CLAUDE_SEARCH) return false;

    handleSearch(message).then(sendResponse);
    return true;
  });
})();
