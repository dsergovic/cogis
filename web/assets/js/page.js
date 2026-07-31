// Cogis page wiring — searchbox, install-gate, and the ChatGPT loop (§6 M8b).
//
// Built ON web/assets/js/bridge-client.js: this file owns page state and input
// handling only, and never re-implements an envelope, an origin check, or a
// nonce. Flat classic script for the same reasons the client is one (§3.7).
//
// Load order in index.html is bridge-client.js → render.js → page.js, all
// without `defer`, so the DOMContentLoaded emit point S8.1 locked still holds.
(function (global) {
  'use strict';

  /**
   * LOCKED by S8.2 (docs/spikes/s8-2-install-gate-latency.md, CLOSED
   * 2026-07-31): 900 ms install-gate budget, measured from the FIRST HELLO,
   * against a worst observed handshake of 665.3 ms over 24 installed runs with
   * zero false gates. The budget is only valid together with the 100 ms
   * re-emission cadence it was measured with (residual risk R5) — the two
   * constants ship as a pair and neither may be changed alone.
   */
  const INSTALL_GATE_BUDGET_MS = 900;
  const HELLO_REEMIT_EVERY_MS = 100;

  /**
   * Mirror of POPUP_WATCHDOG_MS (extension/lib/timeouts.js): the service worker
   * enforces the 8 s / 15 s budgets, and this is the page's belt-and-braces so
   * a group cannot spin forever if a chunk never arrives. Same number, same
   * reason as the popup; parity is asserted in tests.
   */
  const RESULT_WATCHDOG_MS = 15500;

  /** @param {string} raw Mirror of normalizeQuery (extension/lib/messaging.js). */
  function normalizeQuery(raw) {
    if (typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  function newRequestId(cryptoImpl) {
    if (typeof cryptoImpl?.randomUUID === 'function') return cryptoImpl.randomUUID();
    return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  /**
   * @param {object} options
   * @param {object} options.view A CogisRender view.
   * @param {object} [options.win] Injected window (tests).
   * @param {object} [options.doc] Injected document (tests).
   * @param {(opts: object) => object} [options.createClient] Injected client factory (tests).
   * @param {object} [options.cryptoImpl] Injected crypto (tests).
   */
  function createPage(options) {
    const view = options.view;
    const win = options.win ?? global;
    const doc = options.doc ?? win.document;
    const cryptoImpl = options.cryptoImpl ?? win.crypto;
    const createClient = options.createClient ?? global.CogisBridgeClient.create;

    const client = createClient({
      budgetMs: INSTALL_GATE_BUDGET_MS,
      reemitEveryMs: HELLO_REEMIT_EVERY_MS,
      win,
      doc,
    });

    /** @type {string|null} */
    let activeRequestId = null;
    /** @type {Map<string, unknown>} */
    const watchdogs = new Map();

    function clearWatchdog(platformId) {
      if (platformId === undefined) {
        for (const timer of watchdogs.values()) win.clearTimeout(timer);
        watchdogs.clear();
        return;
      }
      const timer = watchdogs.get(platformId);
      if (timer !== undefined) {
        win.clearTimeout(timer);
        watchdogs.delete(platformId);
      }
    }

    function armWatchdog(requestId, platformId) {
      clearWatchdog(platformId);
      const timer = win.setTimeout(() => {
        watchdogs.delete(platformId);
        if (activeRequestId !== requestId) return;
        view.setGroup(platformId, 'timeout');
      }, RESULT_WATCHDOG_MS);
      watchdogs.set(platformId, timer);
    }

    /** A chunk only renders while its request is the live one (§6 M8b AC #5). */
    function isActive(message) {
      return activeRequestId !== null && message?.requestId === activeRequestId;
    }

    function cancelActive() {
      if (activeRequestId === null) return;
      const requestId = activeRequestId;
      activeRequestId = null;
      clearWatchdog();
      client.cancel(requestId);
    }

    /** @param {string} rawQuery */
    function submit(rawQuery) {
      const query = normalizeQuery(rawQuery);
      if (query === null) {
        // Empty / whitespace submit: cancel, clear, hint (§6 M8b AC #4).
        cancelActive();
        view.setAllGroups('idle');
        view.showHint(true);
        return;
      }

      view.showHint(false);
      cancelActive();

      const requestId = newRequestId(cryptoImpl);
      activeRequestId = requestId;

      // Reserve the group layout before the first chunk lands (AC #8).
      for (const platformId of view.platforms) {
        view.setGroup(platformId, 'loading');
        armWatchdog(requestId, platformId);
      }

      if (!client.search({ requestId, query, platforms: [...view.platforms] })) {
        clearWatchdog();
        view.setAllGroups('unavailable');
      }
    }

    client.on('ready', () => view.setConnection('connected'));
    client.on('gate', () => view.setConnection('gated'));
    // A READY after the gate is deliberately inert: the gate is honest either
    // way, and un-rendering it under a user who has started reading is worse
    // than asking for a reload (S8.2 behavior table, `t > budget` row).
    client.on('lateReady', () => {});

    client.on('chunk', (message) => {
      if (!isActive(message)) return;
      clearWatchdog(message.platform);
      view.setGroup(message.platform, message.status, { results: message.results ?? [] });
    });

    client.on('done', (message) => {
      if (!isActive(message)) return;
      clearWatchdog(message.platform === 'all' ? undefined : message.platform);
      if (message.platform === 'all') activeRequestId = null;
    });

    return {
      start() {
        view.setConnection('checking');
        view.showHint(false);
        view.onSubmit(submit);
        // `/` focuses the searchbox unless the user is already typing (§6 M8b).
        doc.addEventListener('keydown', (event) => {
          if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
          const tag = event.target?.tagName;
          if (tag === 'INPUT' || tag === 'TEXTAREA' || event.target?.isContentEditable) return;
          event.preventDefault();
          view.focusInput();
        });
        client.start();
      },
      submit,
      snapshot() {
        return { activeRequestId, ...client.snapshot() };
      },
    };
  }

  global.CogisPage = {
    INSTALL_GATE_BUDGET_MS,
    HELLO_REEMIT_EVERY_MS,
    RESULT_WATCHDOG_MS,
    normalizeQuery,
    create: createPage,
  };

  // Auto-boot only in a real document; the unit tests load this file into a vm
  // sandbox that has no `document` and drive `create()` directly.
  if (global.document && global.CogisRender && global.CogisBridgeClient) {
    createPage({ view: global.CogisRender.createView({ doc: global.document }) }).start();
  }
})(globalThis);
