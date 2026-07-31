// Cogis page-side bridge client — the `cogis.ai` half of addendum §3.9.
//
// Mirror file: extension/content/web-bridge.js (bridge side). Addendum §3.3
// requires any envelope-shape change to land in the same PR on both sides;
// tests/unit/bridge-client-contract-sync.test.js fails if the literals drift.
//
// Flat classic script, no imports, no exports — same posture as the bridge.
// Two reasons: (1) a `type="module"` script is deferred, which would move the
// COGIS_HELLO emit off the `DOMContentLoaded` tick that S8.1 locked
// (s8-1-postmessage-handshake-contract.md, "document_idle timing" row), and
// (2) the page ships with `script-src 'self'` and no bundler (§3.7, §10).
//
// The debug/timing path exists for S8.2: it records performance.now() at HELLO
// emit and at COGIS_READY receive so the install-gate budget can be picked from
// a measured distribution instead of a whiteboard. It is inert unless a
// `debug` sink is passed in.
(function (global) {
  'use strict';

  /** Locked page origin (§3.4): string equality, no trailing slash, apex only. */
  const PAGE_ORIGIN = 'https://cogis.ai';

  /** Locked nonce shape (§3.9): 128-bit lowercase hex. */
  const NONCE_PATTERN = /^[0-9a-f]{32}$/;
  const NONCE_BYTES = 16;

  /** Locked protocol version (§3.9). */
  const PROTOCOL_VERSION = 1;

  const TYPE_HELLO = 'COGIS_HELLO';
  const TYPE_READY = 'COGIS_READY';
  const TYPE_SEARCH = 'WEB_BRIDGE_SEARCH';
  const TYPE_CANCEL = 'WEB_BRIDGE_CANCEL';
  const TYPE_RESULT_CHUNK = 'WEB_BRIDGE_RESULT_CHUNK';
  const TYPE_PLATFORM_DONE = 'WEB_BRIDGE_PLATFORM_DONE';

  /** Inbound allowlist: everything the bridge is allowed to say to us. */
  const ALLOWED_TYPES = new Set([TYPE_READY, TYPE_RESULT_CHUNK, TYPE_PLATFORM_DONE]);

  /**
   * Types this client posts. `window.postMessage` delivers to the sending
   * window's own listeners with `event.source === window`, so our own HELLO
   * comes straight back at us and would otherwise be counted as an unknown
   * type — the page-side twin of the bridge's STEP 0 filter (S8.1 Round 1
   * Bug 1, observed at s8-1-observation-log.md line 79-80).
   */
  const PAGE_ORIGINATED_TYPES = new Set([TYPE_HELLO, TYPE_SEARCH, TYPE_CANCEL]);

  /** When the page emits its first HELLO. */
  const HELLO_TIMINGS = new Set(['immediate', 'dom-content-loaded', 'load']);

  const STATE_IDLE = 'idle';
  const STATE_CHECKING = 'checking';
  const STATE_CONNECTED = 'connected';
  const STATE_GATED = 'gated';

  function hexNonce(cryptoImpl) {
    const bytes = cryptoImpl.getRandomValues(new Uint8Array(NONCE_BYTES));
    let out = '';
    for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
    return out;
  }

  function isNonEmptyString(value) {
    return typeof value === 'string' && value.length > 0;
  }

  /**
   * @param {object} options
   * @param {number} options.budgetMs Install-gate budget. Required on purpose:
   *   S8.2 has not picked the number yet, so no default may exist in code.
   * @param {'immediate'|'dom-content-loaded'|'load'} [options.helloAt]
   * @param {number|null} [options.reemitEveryMs] Re-emit cadence while waiting.
   *   Off by default — §3.9 specifies a single HELLO and says nothing about
   *   re-emission, so a cadence is a measurement knob, not a contract change.
   * @param {object} [options.win] Injected window (tests).
   * @param {object} [options.doc] Injected document (tests).
   * @param {() => number} [options.now] Injected clock (tests).
   * @param {object} [options.cryptoImpl] Injected crypto (tests).
   * @param {(event: object) => void} [options.debug] Timing/observation sink.
   */
  function createBridgeClient(options) {
    const opts = options ?? {};
    const budgetMs = opts.budgetMs;
    if (typeof budgetMs !== 'number' || !Number.isFinite(budgetMs) || budgetMs <= 0) {
      // Fail loudly rather than shipping a guessed budget: the number is the
      // whole point of S8.2 (docs/spikes/s8-2-install-gate-latency.md).
      throw new TypeError('createBridgeClient: budgetMs is required (S8.2 install-gate budget)');
    }

    const helloAt = opts.helloAt ?? 'dom-content-loaded';
    if (!HELLO_TIMINGS.has(helloAt)) {
      throw new TypeError(`createBridgeClient: unknown helloAt "${helloAt}"`);
    }

    const reemitEveryMs =
      typeof opts.reemitEveryMs === 'number' && opts.reemitEveryMs > 0 ? opts.reemitEveryMs : null;

    const win = opts.win ?? global;
    const doc = opts.doc ?? win.document;
    const now = opts.now ?? (() => win.performance.now());
    const cryptoImpl = opts.cryptoImpl ?? win.crypto;
    const debug = typeof opts.debug === 'function' ? opts.debug : null;

    const listeners = {
      ready: [],
      gate: [],
      lateReady: [],
      chunk: [],
      done: [],
      drop: [],
    };

    const drops = {
      originDropCount: 0,
      sourceDropCount: 0,
      nonceDropCount: 0,
      malformedDropCount: 0,
    };

    /** Session-lifetime nonce (§3.9). Minted at start, never persisted. */
    let nonce = null;
    let state = STATE_IDLE;
    let helloCount = 0;
    /** performance.now() at the FIRST hello — the instant the user starts waiting. */
    let firstHelloAt = null;
    let lastHelloAt = null;
    let readyAt = null;
    let gateAt = null;
    let budgetTimer = null;
    let reemitTimer = null;

    function emit(name, payload) {
      for (const fn of [...listeners[name]]) fn(payload);
    }

    function trace(event, detail) {
      if (!debug) return;
      debug({ event, at: now(), readyState: doc?.readyState ?? null, ...detail });
    }

    function countDrop(counter, reason, detail) {
      drops[counter] += 1;
      trace('drop', { counter, reason, ...detail });
      emit('drop', { counter, reason, drops: { ...drops } });
    }

    function post(envelope) {
      // Explicit target origin on every send. Never '*' (§3.9).
      win.postMessage(envelope, PAGE_ORIGIN);
    }

    function sendHello() {
      const at = now();
      helloCount += 1;
      if (firstHelloAt === null) firstHelloAt = at;
      lastHelloAt = at;
      post({ type: TYPE_HELLO, nonce, v: PROTOCOL_VERSION });
      trace('hello_sent', { attempt: helloCount, nonce });
    }

    function clearTimers() {
      if (budgetTimer !== null) {
        win.clearTimeout(budgetTimer);
        budgetTimer = null;
      }
      if (reemitTimer !== null) {
        win.clearInterval(reemitTimer);
        reemitTimer = null;
      }
    }

    function onBudgetElapsed() {
      budgetTimer = null;
      if (state !== STATE_CHECKING) return;
      state = STATE_GATED;
      gateAt = now();
      clearTimers();
      trace('gate_rendered', { budgetMs, sinceFirstHelloMs: gateAt - firstHelloAt });
      emit('gate', { budgetMs, gateAt, sinceFirstHelloMs: gateAt - firstHelloAt });
    }

    function acceptReady(data) {
      const at = now();
      if (state === STATE_GATED) {
        // Locked default (addendum via S8.2 stub, "t > budget and late reply
        // arrives" row): ignore. The gate is honest either way and un-rendering
        // it would reward exactly the slow-machine case we do not want to
        // encourage. Confirmation of this UX is an S8.2 observation.
        trace('late_ready', {
          sinceFirstHelloMs: at - firstHelloAt,
          afterGateMs: at - gateAt,
          extVersion: data.extVersion,
        });
        emit('lateReady', {
          at,
          sinceFirstHelloMs: at - firstHelloAt,
          afterGateMs: at - gateAt,
          extVersion: data.extVersion,
        });
        return;
      }
      if (state !== STATE_CHECKING) return;

      state = STATE_CONNECTED;
      readyAt = at;
      clearTimers();
      const timing = {
        handshakeMs: at - firstHelloAt,
        sinceLastHelloMs: at - lastHelloAt,
        firstHelloAt,
        lastHelloAt,
        readyAt: at,
        helloCount,
      };
      trace('ready', { ...timing, extVersion: data.extVersion });
      emit('ready', {
        ...timing,
        extVersion: data.extVersion,
        capabilities: data.capabilities,
      });
    }

    function handleMessage(event) {
      const data = event.data;

      // STEP 0 — our own outbound envelope echoing back. Ahead of every
      // counter so it cannot pollute the drop tallies.
      if (data && typeof data === 'object' && PAGE_ORIGINATED_TYPES.has(data.type)) return;

      // STEP 1 — origin lock, string equality.
      if (event.origin !== PAGE_ORIGIN) {
        countDrop('originDropCount', 'origin_mismatch', { origin: event.origin });
        return;
      }

      // STEP 2 — the bridge posts into this window; a subframe must not drive us.
      if (event.source !== win) {
        countDrop('sourceDropCount', 'source_mismatch');
        return;
      }

      // STEPS 3-4 — type presence, then the allowlist.
      if (data === null || typeof data !== 'object') {
        countDrop('malformedDropCount', 'not_object');
        return;
      }
      if (!isNonEmptyString(data.type)) {
        countDrop('malformedDropCount', 'missing_type');
        return;
      }
      if (!ALLOWED_TYPES.has(data.type)) {
        countDrop('malformedDropCount', 'unknown_type', { type: data.type });
        return;
      }

      // STEP 5 — nonce gate. `nonce` is null before start(), so an unsolicited
      // COGIS_READY cannot be accepted (S8.2 "reply arrives before page emit").
      if (!isNonEmptyString(data.nonce) || data.nonce !== nonce) {
        countDrop('nonceDropCount', 'nonce_mismatch');
        return;
      }

      // STEP 6 — per-type field validity.
      if (data.type === TYPE_READY) {
        if (data.v !== PROTOCOL_VERSION) {
          countDrop('malformedDropCount', 'ready_bad_v', { v: data.v });
          return;
        }
        if (data.capabilities === null || typeof data.capabilities !== 'object') {
          countDrop('malformedDropCount', 'ready_bad_capabilities');
          return;
        }
        acceptReady(data);
        return;
      }

      if (!isNonEmptyString(data.requestId)) {
        countDrop('malformedDropCount', 'missing_requestId', { type: data.type });
        return;
      }
      trace(data.type === TYPE_RESULT_CHUNK ? 'chunk' : 'platform_done', {
        requestId: data.requestId,
        platform: data.platform,
        status: data.status,
      });
      emit(data.type === TYPE_RESULT_CHUNK ? 'chunk' : 'done', data);
    }

    return {
      /** Mint the nonce, arm the budget, and schedule the first HELLO. */
      start() {
        if (state !== STATE_IDLE) return;
        nonce = hexNonce(cryptoImpl);
        state = STATE_CHECKING;
        win.addEventListener('message', handleMessage);
        trace('start', { budgetMs, helloAt, reemitEveryMs, nonce });

        const fire = () => {
          if (state !== STATE_CHECKING) return;
          sendHello();
          // Budget is measured from the first emit, because that is when the
          // user starts waiting (S8.2 "Measurement fixture" row).
          budgetTimer = win.setTimeout(onBudgetElapsed, budgetMs);
          if (reemitEveryMs !== null) {
            reemitTimer = win.setInterval(() => {
              if (state !== STATE_CHECKING) return;
              // Same nonce: the bridge treats a repeat as idempotent and
              // re-replies READY (extension/content/web-bridge.js line 151).
              sendHello();
            }, reemitEveryMs);
          }
        };

        if (helloAt === 'immediate' || doc.readyState === 'complete') {
          fire();
        } else if (helloAt === 'load') {
          win.addEventListener('load', fire, { once: true });
        } else if (doc.readyState === 'loading') {
          doc.addEventListener('DOMContentLoaded', fire, { once: true });
        } else {
          fire();
        }
      },

      /** @param {{ requestId: string, query: string, platforms: string[] }} input */
      search(input) {
        if (state !== STATE_CONNECTED) return false;
        post({
          type: TYPE_SEARCH,
          nonce,
          requestId: input.requestId,
          query: input.query,
          platforms: input.platforms,
        });
        trace('search_sent', { requestId: input.requestId, platforms: input.platforms });
        return true;
      },

      /** @param {string} requestId */
      cancel(requestId) {
        if (state !== STATE_CONNECTED) return false;
        post({ type: TYPE_CANCEL, nonce, requestId });
        trace('cancel_sent', { requestId });
        return true;
      },

      /** @param {'ready'|'gate'|'lateReady'|'chunk'|'done'|'drop'} name */
      on(name, fn) {
        if (Object.hasOwn(listeners, name) && typeof fn === 'function') listeners[name].push(fn);
        return this;
      },

      /** Timing + counter snapshot for the S8.2 readout. Never includes a query. */
      snapshot() {
        return {
          state,
          budgetMs,
          helloAt,
          reemitEveryMs,
          helloCount,
          firstHelloAt,
          lastHelloAt,
          readyAt,
          gateAt,
          handshakeMs: readyAt === null || firstHelloAt === null ? null : readyAt - firstHelloAt,
          sinceLastHelloMs: readyAt === null || lastHelloAt === null ? null : readyAt - lastHelloAt,
          drops: { ...drops },
        };
      },

      /** Test-only teardown; the shipped page runs one client per page load. */
      stop() {
        clearTimers();
        win.removeEventListener('message', handleMessage);
      },
    };
  }

  global.CogisBridgeClient = {
    PAGE_ORIGIN,
    NONCE_PATTERN,
    PROTOCOL_VERSION,
    TYPES: {
      HELLO: TYPE_HELLO,
      READY: TYPE_READY,
      SEARCH: TYPE_SEARCH,
      CANCEL: TYPE_CANCEL,
      RESULT_CHUNK: TYPE_RESULT_CHUNK,
      PLATFORM_DONE: TYPE_PLATFORM_DONE,
    },
    create: createBridgeClient,
  };
})(globalThis);
