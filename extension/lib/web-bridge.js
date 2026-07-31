/**
 * Web-surface bridge contract shared by the service worker and the M6 debug
 * panel, plus the service-worker-owned drop/accept counter store.
 *
 * The page-facing protocol is locked by
 * `docs/spikes/s8-1-postmessage-handshake-contract.md`. Nothing here may
 * loosen it; the bridge content script mirrors these literals inline.
 *
 * Counters live in the worker rather than the content script because
 * `chrome.storage.session` is `undefined` in a content script
 * (S8.1 observation log, Round 1 Bug 2).
 */

import { MSG } from './messaging.js';

/** Locked page origin: string equality, no trailing slash, apex only. */
export const WEB_BRIDGE_PAGE_ORIGIN = 'https://cogis.ai';

/** Locked nonce shape: 128-bit lowercase hex. */
export const WEB_BRIDGE_NONCE_PATTERN = /^[0-9a-f]{32}$/;

/**
 * Tier 2 inbound envelope cap. The largest legitimate inbound envelope is a
 * `WEB_BRIDGE_SEARCH` (32-char nonce + uuid requestId + query + a handful of
 * platform ids), well under 512 bytes, so 8 KiB leaves ~16x headroom while
 * still bounding the work a hostile page can force per message. The spike did
 * not exercise size limits; the finding defers the number to M8a.
 */
export const WEB_BRIDGE_MAX_ENVELOPE_BYTES = 8192;

/** Page-facing envelope types (addendum §3.4). */
export const WEB_BRIDGE_TYPES = Object.freeze({
  HELLO: 'COGIS_HELLO',
  READY: 'COGIS_READY',
  SEARCH: 'WEB_BRIDGE_SEARCH',
  CANCEL: 'WEB_BRIDGE_CANCEL',
  RESULT_CHUNK: 'WEB_BRIDGE_RESULT_CHUNK',
  PLATFORM_DONE: 'WEB_BRIDGE_PLATFORM_DONE',
});

/**
 * Second boundary check (addendum §3.9): the worker does not trust the bridge's
 * own origin gate and re-checks the sending tab's URL. Deferred by the spike —
 * S8.1 never observed it, so M8a adds it.
 * @param {string|undefined|null} tabUrl
 */
export function isBridgeSenderOrigin(tabUrl) {
  return typeof tabUrl === 'string' && tabUrl.startsWith(`${WEB_BRIDGE_PAGE_ORIGIN}/`);
}

/**
 * Chrome's own warning when a page posts with a mismatched target origin,
 * recorded verbatim in the S8.1 observation log (Round 3, clicks 2–3).
 *
 * Chrome refuses the delivery, so the bridge never sees the message and no
 * bridge counter moves. `postMessage` does not throw and gives the sender no
 * programmatic signal, so the debug panel points maintainers at this string in
 * the page tab's console instead of pretending to count these attempts.
 */
export const WEB_BRIDGE_TARGET_ORIGIN_WARNING =
  "Failed to execute 'postMessage' on 'DOMWindow': The target origin provided " +
  `('<target>') does not match the recipient window's origin ('${WEB_BRIDGE_PAGE_ORIGIN}').`;

/** Bridge observation kinds → the counter each one increments. */
const COUNTER_BY_KIND = Object.freeze({
  drop_origin: 'originDropCount',
  drop_source: 'originDropCount',
  drop_nonce: 'nonceDropCount',
  drop_malformed: 'malformedDropCount',
  accepted_hello: 'acceptedCount',
  accepted: 'acceptedCount',
});

/** §7 debug panel shows the last five request ids and nothing else about them. */
const MAX_RECENT_REQUESTS = 5;

const counters = newCounters();
/** @type {{ requestId: string, status: string }[]} */
let recentRequests = [];
/** @type {number|null} */
let lastHandshakeAt = null;

function newCounters() {
  return {
    originDropCount: 0,
    nonceDropCount: 0,
    malformedDropCount: 0,
    oversizedDropCount: 0,
    acceptedCount: 0,
    helloCount: 0,
  };
}

/**
 * Fold one bridge observation into the counters. Unknown kinds are ignored so
 * a compromised page cannot invent counter names.
 *
 * @param {{ kind: string, reason?: string|null, at?: number }} input
 * @returns {string|null} the counter that moved, or null when nothing did
 */
export function recordBridgeEvent(input) {
  const kind = input?.kind;
  // hasOwn, not a bare lookup: `kind: "constructor"` would otherwise resolve
  // through Object.prototype and increment a counter that does not exist.
  const counter =
    typeof kind === 'string' && Object.hasOwn(COUNTER_BY_KIND, kind)
      ? COUNTER_BY_KIND[kind]
      : undefined;
  if (!counter) return null;

  counters[counter] += 1;
  // `oversized` is a malformed drop with its own breakdown counter: the
  // reconciliation identity over the four locked counters stays intact.
  if (kind === 'drop_malformed' && input.reason === 'oversized') {
    counters.oversizedDropCount += 1;
  }
  if (kind === 'accepted_hello') {
    counters.helloCount += 1;
    lastHandshakeAt =
      typeof input.at === 'number' && Number.isFinite(input.at) ? input.at : Date.now();
  }
  return counter;
}

/**
 * Upsert the status of a bridge-originated request. Ids only — never the query.
 * @param {{ requestId: string, status: string }} input
 */
export function noteBridgeRequest(input) {
  if (!input || typeof input.requestId !== 'string' || !input.requestId) return;
  const status = typeof input.status === 'string' ? input.status : 'unknown';
  recentRequests = [
    ...recentRequests.filter((entry) => entry.requestId !== input.requestId),
    { requestId: input.requestId, status },
  ].slice(-MAX_RECENT_REQUESTS);
}

/**
 * Debug-panel snapshot (addendum §7). No query text, no titles, no nonce —
 * the nonce never leaves the page↔bridge hop.
 */
export function getWebBridgeSnapshot() {
  return {
    ...counters,
    // §7 names the accepted-handshake counter `handshakeCount`; the finding
    // names the same event `helloCount`. The bridge replies COGIS_READY
    // synchronously on every accepted hello, so the two are equal by
    // construction. Both are reported so either document can be checked.
    handshakeCount: counters.helloCount,
    lastHandshakeAt,
    recentRequests: recentRequests.map((entry) => ({ ...entry })),
  };
}

export function resetWebBridgeStatsForTests() {
  Object.assign(counters, newCounters());
  recentRequests = [];
  lastHandshakeAt = null;
}

/**
 * Translate an internal popup-contract broadcast into its page-facing envelope.
 * Returns null for anything the page surface does not receive.
 *
 * The projected field set is exactly the one §3.9 specifies. `message` and
 * `loginUrl` ride the internal chunk but are not in the normative page-facing
 * shape, so they are dropped rather than invented into the contract.
 *
 * @param {{ type?: string }} msg
 */
export function toBridgeEnvelope(msg) {
  if (!msg || typeof msg.type !== 'string') return null;
  if (msg.type === MSG.SEARCH_RESULT_CHUNK) {
    return {
      type: WEB_BRIDGE_TYPES.RESULT_CHUNK,
      requestId: msg.requestId,
      platform: msg.platform,
      status: msg.status,
      capability: msg.capability,
      results: msg.results,
      errorCode: msg.errorCode,
    };
  }
  if (msg.type === MSG.SEARCH_PLATFORM_DONE) {
    return {
      type: WEB_BRIDGE_TYPES.PLATFORM_DONE,
      requestId: msg.requestId,
      platform: msg.platform,
      status: msg.status,
    };
  }
  return null;
}

/**
 * Locked cancel signal: one done frame with `platform:"all"`, not one per
 * platform (finding, "SW reply signaling" row).
 * @param {string} requestId
 */
export function createBridgeCancelDone(requestId) {
  return {
    type: WEB_BRIDGE_TYPES.PLATFORM_DONE,
    requestId,
    platform: 'all',
    status: 'cancelled',
  };
}
