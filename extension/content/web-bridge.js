// M8a — Cogis web-surface bridge. Injected only into https://cogis.ai/*.
//
// The page-facing protocol is locked by
// docs/spikes/s8-1-postmessage-handshake-contract.md. Read that before
// touching anything below; the validation ordering in particular is load
// bearing and was observed, not guessed.
//
// Flat classic script with zero imports on purpose. The locked
// "listener is live before the page's first COGIS_HELLO at document_idle"
// timing was observed against a flat single-file bridge, and the finding
// explicitly defers the isolated-world module import graph. Awaiting a dynamic
// import would move listener registration past the first task turn and put
// that lock at risk, so the few shared literals are mirrored here instead.
(function () {
  'use strict';

  // Mirror of WEB_SEARCH_SURFACE_ENABLED in lib/flags.js.
  // tests/unit/web-bridge-flag-sync.test.js fails if the two drift.
  const WEB_SEARCH_SURFACE_ENABLED = true;

  // Flag off ⇒ no listeners, no counters, no page traffic (§3.2 SD-1).
  if (!WEB_SEARCH_SURFACE_ENABLED) return;

  // Mirrors of lib/web-bridge.js.
  const PAGE_ORIGIN = 'https://cogis.ai';
  const NONCE_PATTERN = /^[0-9a-f]{32}$/;
  const MAX_ENVELOPE_BYTES = 8192;

  const TYPE_HELLO = 'COGIS_HELLO';
  const TYPE_READY = 'COGIS_READY';
  const TYPE_SEARCH = 'WEB_BRIDGE_SEARCH';
  const TYPE_CANCEL = 'WEB_BRIDGE_CANCEL';
  const TYPE_RESULT_CHUNK = 'WEB_BRIDGE_RESULT_CHUNK';
  const TYPE_PLATFORM_DONE = 'WEB_BRIDGE_PLATFORM_DONE';

  const MSG_EVENT = 'WEB_BRIDGE_EVENT';
  const MSG_DELIVER = 'WEB_BRIDGE_DELIVER';

  /** Inbound allowlist (STEP 4). Nothing else is even parsed. */
  const ALLOWED_TYPES = new Set([TYPE_HELLO, TYPE_SEARCH, TYPE_CANCEL]);

  /**
   * STEP 0 — every type this bridge posts. window.postMessage dispatches to
   * listeners on the target window including the sender's own, and for a
   * self-post event.source === window, so the STEP 2 guard cannot catch it.
   * Without this filter our own COGIS_READY comes straight back as
   * `unknown_type` and inflates malformedDropCount (Round 1 Bug 1).
   */
  const BRIDGE_ORIGINATED_TYPES = new Set([TYPE_READY, TYPE_RESULT_CHUNK, TYPE_PLATFORM_DONE]);

  /**
   * Fail closed. Null until a valid COGIS_HELLO lands, and every post-handshake
   * envelope must echo it — so a null nonce already rejects all work envelopes
   * at STEP 5 with expected:null. There is deliberately no separate
   * "before handshake" gate (Round 4 bonus finding).
   */
  let sessionNonce = null;

  /**
   * Counters are worker-owned: chrome.storage.session is undefined in a
   * content script (Round 1 Bug 2). The nonce is never included — it must not
   * be logged or persisted anywhere.
   * @param {string} kind
   * @param {string|null} [reason]
   */
  function report(kind, reason) {
    try {
      chrome.runtime.sendMessage(
        { type: MSG_EVENT, kind, reason: reason ?? null, at: Date.now() },
        () => {
          // Worker asleep or no receiver: swallow so lastError is not logged.
          void chrome.runtime.lastError;
        },
      );
    } catch {
      // Extension context invalidated mid-navigation.
    }
  }

  function manifestVersion() {
    try {
      return chrome.runtime.getManifest().version;
    } catch {
      return null;
    }
  }

  /**
   * The one exit toward the page. Refusing any type outside
   * BRIDGE_ORIGINATED_TYPES makes STEP 0's filter structurally complete: a new
   * outbound type cannot ship without being added to the set the filter reads.
   * @param {object} envelope
   */
  function post(envelope) {
    if (!envelope || !BRIDGE_ORIGINATED_TYPES.has(envelope.type)) return false;
    // Never speak to the page before a valid handshake.
    if (sessionNonce === null) return false;
    // Explicit target origin, never '*'.
    window.postMessage({ ...envelope, nonce: sessionNonce }, PAGE_ORIGIN);
    return true;
  }

  function isNonEmptyString(value) {
    return typeof value === 'string' && value.length > 0;
  }

  /**
   * Serialized size of an inbound envelope, or null when it cannot be
   * serialized at all (structured clone carries cycles that JSON will not).
   * @param {object} envelope
   */
  function envelopeByteLength(envelope) {
    try {
      return new TextEncoder().encode(JSON.stringify(envelope)).length;
    } catch {
      return null;
    }
  }

  /**
   * Locked ordering: 3 type presence → 4 type in allowlist → 5 nonce match →
   * 6 per-type field validity. Steps 1 and 2 are the origin and source gates
   * in the listener.
   *
   * The object and size probes sit ahead of step 3. Neither is a per-type
   * field check, so this keeps the locked invariant — every per-type reason is
   * downstream of the nonce gate — exactly as observed, while still refusing
   * to parse an oversized payload.
   *
   * @param {unknown} envelope
   * @returns {{ ok: true } | { ok: false, reason: string }}
   */
  function validate(envelope) {
    if (envelope === null || typeof envelope !== 'object') {
      return { ok: false, reason: 'not_object' };
    }

    const bytes = envelopeByteLength(envelope);
    if (bytes === null) return { ok: false, reason: 'unserializable' };
    if (bytes > MAX_ENVELOPE_BYTES) return { ok: false, reason: 'oversized' };

    if (!isNonEmptyString(envelope.type)) return { ok: false, reason: 'missing_type' };
    if (!ALLOWED_TYPES.has(envelope.type)) return { ok: false, reason: 'unknown_type' };

    if (envelope.type === TYPE_HELLO) {
      if (!isNonEmptyString(envelope.nonce)) return { ok: false, reason: 'hello_missing_nonce' };
      if (!NONCE_PATTERN.test(envelope.nonce)) return { ok: false, reason: 'hello_bad_nonce' };
      if (envelope.v !== 1) return { ok: false, reason: 'hello_bad_v' };
      // A second hello carrying a different nonce is either a reload we did
      // not see or a hijack attempt. Both fail closed as a nonce mismatch;
      // a repeat of the same nonce is idempotent and re-replies READY.
      if (sessionNonce !== null && envelope.nonce !== sessionNonce) {
        return { ok: false, reason: 'nonce_mismatch' };
      }
      return { ok: true };
    }

    // STEP 5. `nonce` rides every envelope, so its absence is a shape problem
    // rather than a mismatch; a present-but-wrong nonce is the mismatch.
    if (!isNonEmptyString(envelope.nonce)) return { ok: false, reason: 'missing_nonce' };
    if (envelope.nonce !== sessionNonce) return { ok: false, reason: 'nonce_mismatch' };

    if (envelope.type === TYPE_SEARCH) {
      if (!isNonEmptyString(envelope.requestId)) return { ok: false, reason: 'missing_requestId' };
      if (typeof envelope.query !== 'string') return { ok: false, reason: 'bad_query' };
      if (!Array.isArray(envelope.platforms)) return { ok: false, reason: 'bad_platforms' };
      // The spike accepted any array; unknown ids are dropped by the worker's
      // implemented-platform filter, but non-string entries never make sense.
      if (!envelope.platforms.every(isNonEmptyString)) {
        return { ok: false, reason: 'bad_platforms' };
      }
      return { ok: true };
    }

    if (envelope.type === TYPE_CANCEL) {
      if (!isNonEmptyString(envelope.requestId)) return { ok: false, reason: 'missing_requestId' };
      return { ok: true };
    }

    return { ok: false, reason: 'unhandled' };
  }

  /**
   * Hand an accepted work envelope to the worker. The nonce stays inside the
   * page↔bridge hop and is re-stamped on the way back out.
   * @param {{ type: string, requestId: string, query?: string, platforms?: string[] }} envelope
   */
  function forward(envelope) {
    const payload =
      envelope.type === TYPE_SEARCH
        ? {
            type: TYPE_SEARCH,
            requestId: envelope.requestId,
            query: envelope.query,
            platforms: envelope.platforms,
          }
        : { type: TYPE_CANCEL, requestId: envelope.requestId };
    try {
      chrome.runtime.sendMessage(payload, () => {
        void chrome.runtime.lastError;
      });
    } catch {
      // Extension context invalidated mid-navigation.
    }
  }

  window.addEventListener('message', (event) => {
    const data = event.data;

    // STEP 0 — our own outbound message coming back to us. Ahead of every
    // counter so it cannot pollute the drop tallies.
    if (data && typeof data === 'object' && BRIDGE_ORIGINATED_TYPES.has(data.type)) return;

    // STEP 1 — origin lock, string equality.
    if (event.origin !== PAGE_ORIGIN) {
      report('drop_origin');
      return;
    }

    // STEP 2 — top window only. A same-origin subframe passes STEP 1 but must
    // not be allowed to drive the bridge.
    if (event.source !== window) {
      report('drop_source');
      return;
    }

    // STEPS 3–6.
    const verdict = validate(data);
    if (!verdict.ok) {
      report(verdict.reason === 'nonce_mismatch' ? 'drop_nonce' : 'drop_malformed', verdict.reason);
      return;
    }

    if (data.type === TYPE_HELLO) {
      sessionNonce = data.nonce;
      report('accepted_hello');
      post({
        type: TYPE_READY,
        v: 1,
        extVersion: manifestVersion(),
        capabilities: { search: true, cancel: true },
      });
      return;
    }

    report('accepted');
    forward(data);
  });

  // Worker → page relay. Results reach a content script through
  // chrome.tabs.sendMessage, not the runtime broadcast the popup listens on.
  chrome.runtime.onMessage.addListener((message) => {
    if (!message || message.type !== MSG_DELIVER) return false;
    post(message.envelope);
    return false;
  });
})();
