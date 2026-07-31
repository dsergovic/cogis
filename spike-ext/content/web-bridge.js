// S8.1 spike — content script bridge under test.
//
// Purpose: Prove the addendum §3.9 postMessage handshake contract, live in
// Chrome, against a page loaded from https://cogis.ai. Every drop rule below
// mirrors what the M8a production bridge is supposed to enforce.
//
// Deliberately NOT production code:
// - Logs everything to console with a [s8.1-bridge] prefix so the spike page
//   can grep it. Production bridge will be silent.
// - Counters are in-memory only (module scope). They reset on every page
//   navigation, which matches the page-lifetime handshake session semantics.
//   The first draft of this file used chrome.storage.session; that requires
//   the "storage" permission AND the SW to call session.setAccessLevel from
//   a privileged context, which is more machinery than a spike needs. The
//   spike page reads counters by parsing the [s8.1-bridge] console log.
// - Does not verify caller identity beyond origin + nonce + envelope shape.
//   That is exactly what the spike is here to prove sufficient.
//
// If any behavior in this file diverges from the addendum, the addendum is
// the source of truth. Divergences noted here are questions for the spike
// finding to answer.

const TAG = '[s8.1-bridge]';
const EXPECTED_ORIGIN = 'https://cogis.ai';

// Session-scoped state. Reset on each page load (which is the addendum's
// definition of the handshake session).
let sessionNonce = null;
let handshakeSeen = false;

const counters = {
  originDropCount: 0,
  nonceDropCount: 0,
  malformedDropCount: 0,
  acceptedCount: 0,
  helloCount: 0,
};

const ALLOWED_TYPES = new Set([
  'COGIS_HELLO',
  'WEB_BRIDGE_SEARCH',
  'WEB_BRIDGE_CANCEL',
  // Types the SW sends TO the page are not in this set because inbound
  // messages from the page never carry those types. Any *inbound* message
  // whose type is not in this set is dropped as malformed.
]);

// Log every observation with a stable shape so the spike page can parse the
// console reliably. `phase` distinguishes bridge-side observations from
// SW-side observations (see background/service-worker.js).
function observe(kind, detail) {
  const entry = {
    ts: Date.now(),
    phase: 'bridge',
    kind,
    detail,
    counters: { ...counters },
  };
  // eslint-disable-next-line no-console
  console.log(TAG, JSON.stringify(entry));
  return entry;
}

// Types this bridge SENDS to the page. When the bridge receives one back on
// its own `window` listener, that's the bridge observing its own outbound
// message — not a real inbound message. Silently ignore before any counter
// or validation step runs.
//
// Finding: postMessage delivers the message to every listener on the target
// window, including listeners registered by the sender. `event.source` equals
// the current `window` in that case, so the STEP 2 guard ("event.source must
// be the page's own window") does NOT catch it. The real M8a bridge must
// filter its own outbound types explicitly, OR use a channel-direction tag,
// OR post to a dedicated MessageChannel instead of `window.postMessage`.
const BRIDGE_ORIGINATED_TYPES = new Set([
  'COGIS_READY',
  'WEB_BRIDGE_RESULT_CHUNK',
  'WEB_BRIDGE_PLATFORM_DONE',
]);

function isPlainString(v) {
  return typeof v === 'string' && v.length > 0;
}

function validateEnvelope(msg) {
  if (msg == null || typeof msg !== 'object') return { ok: false, reason: 'not_object' };
  if (!isPlainString(msg.type)) return { ok: false, reason: 'missing_type' };
  if (!ALLOWED_TYPES.has(msg.type)) return { ok: false, reason: 'unknown_type' };
  if (msg.type === 'COGIS_HELLO') {
    if (!isPlainString(msg.nonce)) return { ok: false, reason: 'hello_missing_nonce' };
    if (msg.v !== 1) return { ok: false, reason: 'hello_bad_v' };
    return { ok: true };
  }
  // Post-handshake envelopes must echo the session nonce.
  if (!isPlainString(msg.nonce)) return { ok: false, reason: 'missing_nonce' };
  if (msg.nonce !== sessionNonce) return { ok: false, reason: 'nonce_mismatch' };
  if (msg.type === 'WEB_BRIDGE_SEARCH') {
    if (!isPlainString(msg.requestId)) return { ok: false, reason: 'missing_requestId' };
    if (!isPlainString(msg.query)) return { ok: false, reason: 'bad_query' };
    if (!Array.isArray(msg.platforms)) return { ok: false, reason: 'bad_platforms' };
    return { ok: true };
  }
  if (msg.type === 'WEB_BRIDGE_CANCEL') {
    if (!isPlainString(msg.requestId)) return { ok: false, reason: 'missing_requestId' };
    return { ok: true };
  }
  return { ok: false, reason: 'unhandled' };
}

function post(msg) {
  // Explicit target origin — never '*'. This is the whole reason for the
  // spike: prove that Chrome honors this exact string on the receiving side.
  window.postMessage(msg, EXPECTED_ORIGIN);
}

window.addEventListener('message', (event) => {
  // STEP 0: silently ignore the bridge's own outbound types. `window.postMessage`
  // dispatches to every listener on the target window, including the sender's
  // own listener. Without this, a `COGIS_READY` we posted would come right
  // back to us as `unknown_type` and inflate malformedDropCount. This is a
  // real finding for M8a; see BRIDGE_ORIGINATED_TYPES above.
  if (
    event.data &&
    typeof event.data === 'object' &&
    typeof event.data.type === 'string' &&
    BRIDGE_ORIGINATED_TYPES.has(event.data.type)
  ) {
    return;
  }

  // STEP 1: origin lock (string equality).
  if (event.origin !== EXPECTED_ORIGIN) {
    counters.originDropCount++;
    observe('drop_origin', { origin: event.origin, type: event.data && event.data.type });
    return;
  }

  // STEP 2: event.source must be the page's own window. This protects
  // against a hostile subframe posting from the same origin string (see
  // s8-1 residuals — sandboxed iframes get "null" origin, but a same-origin
  // iframe would pass origin check).
  //
  // Note: this guard does NOT catch same-window self-posts. Those are
  // handled by STEP 0 above.
  if (event.source !== window) {
    counters.originDropCount++;
    observe('drop_source', { origin: event.origin });
    return;
  }

  const msg = event.data;

  // STEP 3: envelope validation. Malformed → malformed counter; nonce
  // mismatch → nonce counter.
  const result = validateEnvelope(msg);
  if (!result.ok) {
    if (result.reason === 'nonce_mismatch') {
      counters.nonceDropCount++;
      observe('drop_nonce', { received: msg && msg.nonce, expected: sessionNonce });
    } else {
      counters.malformedDropCount++;
      observe('drop_malformed', { reason: result.reason, type: msg && msg.type });
    }
    return;
  }

  // STEP 4: handshake bookkeeping.
  if (msg.type === 'COGIS_HELLO') {
    // First hello wins. Subsequent hellos with a different nonce would be
    // an in-page reload event (which we already handle by page-lifetime
    // scope) OR an attack; drop as a nonce mismatch.
    if (handshakeSeen && msg.nonce !== sessionNonce) {
      counters.nonceDropCount++;
      observe('drop_second_hello_nonce', { received: msg.nonce, expected: sessionNonce });
      return;
    }
    handshakeSeen = true;
    sessionNonce = msg.nonce;
    counters.helloCount++;
    counters.acceptedCount++;
    observe('accepted_hello', { nonce: sessionNonce });
    post({
      type: 'COGIS_READY',
      nonce: sessionNonce,
      v: 1,
      extVersion: chrome.runtime.getManifest().version,
      capabilities: { search: true, cancel: true },
    });
    return;
  }

  // STEP 5: post-handshake. Reject anything before hello.
  if (!handshakeSeen) {
    counters.malformedDropCount++;
    observe('drop_pre_handshake', { type: msg.type });
    return;
  }

  counters.acceptedCount++;
  observe('accepted', { type: msg.type, requestId: msg.requestId });

  // Forward accepted envelopes to the SW. The SW replies with a canned
  // chunk + done sequence.
  chrome.runtime.sendMessage({ source: 's8.1-bridge', envelope: msg }, (_reply) => {
    // Ignored on the bridge side. The SW pushes results asynchronously
    // via chrome.tabs.sendMessage → the tab's content script — but for
    // the spike, we take the direct path: SW returns a reply, we forward.
    if (chrome.runtime.lastError) {
      observe('sw_error', { message: chrome.runtime.lastError.message });
      return;
    }
    if (!_reply) return;
    if (Array.isArray(_reply.chunks)) {
      for (const chunk of _reply.chunks) post({ ...chunk, nonce: sessionNonce });
    }
    if (_reply.done) post({ ...(_reply.done || {}), nonce: sessionNonce });
  });
});

observe('bridge_loaded', {
  href: location.href,
  readyState: document.readyState,
  runAt: 'document_idle',
});
