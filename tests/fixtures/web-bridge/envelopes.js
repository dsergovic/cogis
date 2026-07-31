/**
 * Page-side envelope fixtures for the M8a bridge tests.
 *
 * The nonces are the ones actually observed in the S8.1 spike
 * (docs/spikes/s8-1-observation-log.md rounds 1, 2 and 4) so the fixtures
 * exercise the locked `[0-9a-f]{32}` shape rather than a made-up one.
 */

export const NONCE = '0e3ea98e53814b8f7697c8da734cd82b';
export const OTHER_NONCE = 'dd03e3c92dadf18eae4ef8543344d0fd';
export const THIRD_NONCE = '926b9bf6b5e27327e59c4ccd656b0c03';

export const PAGE_ORIGIN = 'https://cogis.ai';

/** Origins that must never reach the bridge's envelope validator. */
export const HOSTILE_ORIGINS = [
  'https://www.cogis.ai',
  'https://cogis.ai.evil.example',
  'https://cogis.ai/',
  'http://cogis.ai',
  'null',
  '',
];

export function hello(overrides = {}) {
  return { type: 'COGIS_HELLO', nonce: NONCE, v: 1, ...overrides };
}

export function search(overrides = {}) {
  return {
    type: 'WEB_BRIDGE_SEARCH',
    nonce: NONCE,
    requestId: 'req-1',
    query: 'quarterly plan',
    platforms: ['chatgpt', 'claude'],
    ...overrides,
  };
}

export function cancel(overrides = {}) {
  return { type: 'WEB_BRIDGE_CANCEL', nonce: NONCE, requestId: 'req-1', ...overrides };
}

/** A well-formed search whose serialized size exceeds the Tier 2 cap. */
export function oversizedSearch(bytes = 9000) {
  return search({ query: 'x'.repeat(bytes) });
}

/**
 * The scripted action list used for counter reconciliation. Each entry is one
 * inbound page message plus the counter the bridge is expected to move.
 * `expected: null` means the message must move no counter at all (STEP 0).
 */
export const RECONCILIATION_SCRIPT = [
  { label: 'self-echo COGIS_READY', data: { type: 'COGIS_READY', nonce: NONCE }, expected: null },
  {
    label: 'self-echo result chunk',
    data: { type: 'WEB_BRIDGE_RESULT_CHUNK', nonce: NONCE },
    expected: null,
  },
  {
    label: 'self-echo platform done',
    data: { type: 'WEB_BRIDGE_PLATFORM_DONE', nonce: NONCE },
    expected: null,
  },
  {
    label: 'hostile origin',
    data: hello(),
    origin: 'https://cogis.ai.evil.example',
    expected: 'originDropCount',
  },
  { label: 'subframe source', data: hello(), fromSubframe: true, expected: 'originDropCount' },
  { label: 'search before hello', data: search(), expected: 'nonceDropCount' },
  { label: 'missing type', data: { nonce: NONCE }, expected: 'malformedDropCount' },
  { label: 'unknown type', data: { type: 'NOPE', nonce: NONCE }, expected: 'malformedDropCount' },
  { label: 'oversized search', data: oversizedSearch(), expected: 'malformedDropCount' },
  { label: 'hello with bad v', data: hello({ v: 2 }), expected: 'malformedDropCount' },
  { label: 'accepted hello', data: hello(), expected: 'acceptedCount' },
  { label: 'wrong nonce search', data: search({ nonce: OTHER_NONCE }), expected: 'nonceDropCount' },
  { label: 'bad query', data: search({ query: 42 }), expected: 'malformedDropCount' },
  { label: 'accepted search', data: search(), expected: 'acceptedCount' },
  { label: 'accepted cancel', data: cancel(), expected: 'acceptedCount' },
];
