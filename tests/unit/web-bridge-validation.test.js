import { describe, it, expect } from 'vitest';
import { loadBridge, readBridgeSource } from '../helpers/web-bridge-harness.js';
import {
  HOSTILE_ORIGINS,
  NONCE,
  OTHER_NONCE,
  PAGE_ORIGIN,
  cancel,
  hello,
  oversizedSearch,
  search,
} from '../fixtures/web-bridge/envelopes.js';

/**
 * One assertion helper per step keeps each case honest about *which* gate it is
 * exercising. Every case drives a real inbound message through the real
 * listener; nothing is stubbed inside the bridge.
 */
function expectDrop(bridge, kind, reason) {
  const event = bridge.lastEvent();
  expect(event).toMatchObject({ type: 'WEB_BRIDGE_EVENT', kind });
  if (reason !== undefined) expect(event.reason).toBe(reason);
  expect(bridge.posted).toHaveLength(0);
  expect(bridge.forwarded()).toHaveLength(0);
}

/** A bridge that has already completed the handshake. */
function handshaken() {
  const bridge = loadBridge();
  bridge.emit({ data: hello() });
  bridge.posted.length = 0;
  bridge.sent.length = 0;
  return bridge;
}

describe('web bridge — flag off', () => {
  it('registers no listeners and never touches the page', () => {
    const bridge = loadBridge({ enabled: false });
    expect(bridge.messageListenerCount()).toBe(0);
    expect(bridge.runtimeListenerCount()).toBe(0);
    expect(bridge.sent).toHaveLength(0);
    expect(bridge.posted).toHaveLength(0);
  });
});

describe('web bridge — STEP 0 (own outbound types)', () => {
  const ownTypes = ['COGIS_READY', 'WEB_BRIDGE_RESULT_CHUNK', 'WEB_BRIDGE_PLATFORM_DONE'];

  for (const type of ownTypes) {
    it(`ignores a self-echoed ${type} without moving any counter`, () => {
      const bridge = handshaken();
      // Self-posts arrive with the page origin and source === window, so
      // neither STEP 1 nor STEP 2 can catch them (Round 1 Bug 1).
      bridge.emit({ data: { type, nonce: NONCE, requestId: 'req-1' } });
      expect(bridge.events()).toHaveLength(0);
      expect(bridge.posted).toHaveLength(0);
    });
  }

  it('covers every type the bridge is able to post', () => {
    const source = readBridgeSource();
    const filtered = source.match(/BRIDGE_ORIGINATED_TYPES = new Set\(\[([^\]]*)\]\)/)?.[1] ?? '';
    // `post()` refuses anything outside the set, so the set is by construction
    // the complete outbound surface. Assert both halves are the same three.
    expect(filtered.match(/TYPE_\w+/g)?.sort()).toEqual([
      'TYPE_PLATFORM_DONE',
      'TYPE_READY',
      'TYPE_RESULT_CHUNK',
    ]);
    expect(source).toMatch(/if \(!envelope \|\| !BRIDGE_ORIGINATED_TYPES\.has\(envelope\.type\)\)/);
  });

  it('runs ahead of the origin gate so an echo from elsewhere is still silent', () => {
    const bridge = handshaken();
    bridge.emit({ data: { type: 'COGIS_READY' }, origin: 'https://cogis.ai.evil.example' });
    expect(bridge.events()).toHaveLength(0);
  });
});

describe('web bridge — STEP 1 (origin equality)', () => {
  for (const origin of HOSTILE_ORIGINS) {
    it(`drops a valid hello from ${JSON.stringify(origin)}`, () => {
      const bridge = loadBridge();
      bridge.emit({ data: hello(), origin });
      expectDrop(bridge, 'drop_origin');
    });
  }

  it('accepts the exact locked origin string', () => {
    const bridge = loadBridge();
    bridge.emit({ data: hello(), origin: PAGE_ORIGIN });
    expect(bridge.lastEvent()).toMatchObject({ kind: 'accepted_hello' });
  });
});

describe('web bridge — STEP 2 (source is the page window)', () => {
  it('drops a same-origin subframe post', () => {
    const bridge = loadBridge();
    bridge.emit({ data: hello(), fromSubframe: true });
    expectDrop(bridge, 'drop_source');
  });

  it('still drops the subframe once a handshake exists', () => {
    const bridge = handshaken();
    bridge.emit({ data: search(), fromSubframe: true });
    expectDrop(bridge, 'drop_source');
  });
});

describe('web bridge — STEP 3 (type presence)', () => {
  it('drops a non-object payload', () => {
    const bridge = loadBridge();
    bridge.emit({ data: 'COGIS_HELLO' });
    expectDrop(bridge, 'drop_malformed', 'not_object');
  });

  it('drops null', () => {
    const bridge = loadBridge();
    bridge.emit({ data: null });
    expectDrop(bridge, 'drop_malformed', 'not_object');
  });

  it('drops an envelope with no type', () => {
    const bridge = loadBridge();
    bridge.emit({ data: { nonce: NONCE, v: 1 } });
    expectDrop(bridge, 'drop_malformed', 'missing_type');
  });

  it('drops a non-string type', () => {
    const bridge = loadBridge();
    bridge.emit({ data: { type: 7, nonce: NONCE } });
    expectDrop(bridge, 'drop_malformed', 'missing_type');
  });
});

describe('web bridge — STEP 4 (type allowlist)', () => {
  it('drops an unknown type', () => {
    const bridge = loadBridge();
    bridge.emit({ data: { type: 'WEB_BRIDGE_DRAIN_COOKIES', nonce: NONCE } });
    expectDrop(bridge, 'drop_malformed', 'unknown_type');
  });

  it('drops an inbound WEB_BRIDGE_ERROR — the page never sends one', () => {
    const bridge = handshaken();
    bridge.emit({ data: { type: 'WEB_BRIDGE_ERROR', nonce: NONCE } });
    expectDrop(bridge, 'drop_malformed', 'unknown_type');
  });

  it('checks the allowlist before the nonce gate', () => {
    const bridge = handshaken();
    // Unknown type *and* a wrong nonce: the locked ordering says the type
    // verdict wins, so this must count as malformed rather than a nonce drop.
    bridge.emit({ data: { type: 'NOPE', nonce: OTHER_NONCE } });
    expectDrop(bridge, 'drop_malformed', 'unknown_type');
  });
});

describe('web bridge — STEP 5 (nonce gate, fail closed)', () => {
  it('drops a search that arrives before any hello', () => {
    const bridge = loadBridge();
    bridge.emit({ data: search() });
    // No separate pre-handshake gate: sessionNonce is null, so the nonce
    // comparison alone rejects it (Round 4 bonus finding, expected:null).
    expectDrop(bridge, 'drop_nonce', 'nonce_mismatch');
  });

  it('drops a cancel that arrives before any hello', () => {
    const bridge = loadBridge();
    bridge.emit({ data: cancel() });
    expectDrop(bridge, 'drop_nonce', 'nonce_mismatch');
  });

  it('drops a work envelope carrying the wrong nonce', () => {
    const bridge = handshaken();
    bridge.emit({ data: search({ nonce: OTHER_NONCE }) });
    expectDrop(bridge, 'drop_nonce', 'nonce_mismatch');
  });

  it('counts a missing nonce as a shape problem, not a mismatch', () => {
    const bridge = handshaken();
    const noNonce = search();
    delete noNonce.nonce;
    bridge.emit({ data: noNonce });
    expectDrop(bridge, 'drop_malformed', 'missing_nonce');
  });

  it('keeps every per-type check downstream of the nonce gate', () => {
    const bridge = handshaken();
    // Wrong nonce AND a bad query: the nonce verdict must win.
    bridge.emit({ data: search({ nonce: OTHER_NONCE, query: 42 }) });
    expectDrop(bridge, 'drop_nonce', 'nonce_mismatch');
  });

  it('never reports the nonce itself to the worker', () => {
    const bridge = handshaken();
    bridge.emit({ data: search({ nonce: OTHER_NONCE }) });
    expect(JSON.stringify(bridge.sent)).not.toContain(NONCE);
    expect(JSON.stringify(bridge.sent)).not.toContain(OTHER_NONCE);
  });
});

describe('web bridge — STEP 6 (per-type fields)', () => {
  it('drops a search with no requestId', () => {
    const bridge = handshaken();
    bridge.emit({ data: search({ requestId: undefined }) });
    expectDrop(bridge, 'drop_malformed', 'missing_requestId');
  });

  it('drops a search with a non-string query', () => {
    const bridge = handshaken();
    bridge.emit({ data: search({ query: { toString: 'nope' } }) });
    expectDrop(bridge, 'drop_malformed', 'bad_query');
  });

  it('drops a search whose platforms is not an array', () => {
    const bridge = handshaken();
    bridge.emit({ data: search({ platforms: 'chatgpt' }) });
    expectDrop(bridge, 'drop_malformed', 'bad_platforms');
  });

  it('drops a search with non-string platform entries', () => {
    const bridge = handshaken();
    bridge.emit({ data: search({ platforms: ['chatgpt', 7] }) });
    expectDrop(bridge, 'drop_malformed', 'bad_platforms');
  });

  it('drops a cancel with no requestId', () => {
    const bridge = handshaken();
    bridge.emit({ data: cancel({ requestId: '' }) });
    expectDrop(bridge, 'drop_malformed', 'missing_requestId');
  });

  it('accepts an empty query string — emptiness is the worker’s call', () => {
    const bridge = handshaken();
    bridge.emit({ data: search({ query: '' }) });
    expect(bridge.lastEvent()).toMatchObject({ kind: 'accepted' });
  });
});

describe('web bridge — oversized envelopes (Tier 2 cap)', () => {
  it('drops a well-formed but oversized search', () => {
    const bridge = handshaken();
    bridge.emit({ data: oversizedSearch() });
    expectDrop(bridge, 'drop_malformed', 'oversized');
  });

  it('accepts a search just under the cap', () => {
    const bridge = handshaken();
    bridge.emit({ data: search({ query: 'x'.repeat(7000) }) });
    expect(bridge.lastEvent()).toMatchObject({ kind: 'accepted' });
  });

  it('refuses to parse an oversized payload before looking at its type', () => {
    const bridge = handshaken();
    bridge.emit({ data: { blob: 'x'.repeat(9000) } });
    expectDrop(bridge, 'drop_malformed', 'oversized');
  });

  it('drops a payload that cannot be serialized at all', () => {
    const bridge = handshaken();
    const cyclic = search();
    cyclic.self = cyclic;
    bridge.emit({ data: cyclic });
    expectDrop(bridge, 'drop_malformed', 'unserializable');
  });

  it('measures bytes rather than code units', () => {
    const bridge = handshaken();
    // 3000 four-byte characters is 12000 bytes but only 6000 UTF-16 units.
    bridge.emit({ data: search({ query: '\u{1F600}'.repeat(3000) }) });
    expectDrop(bridge, 'drop_malformed', 'oversized');
  });
});

describe('web bridge — handshake', () => {
  it('replies COGIS_READY with the locked shape and explicit target origin', () => {
    const bridge = loadBridge({ manifestVersion: '9.9.9' });
    bridge.emit({ data: hello() });

    expect(bridge.lastEvent()).toMatchObject({ kind: 'accepted_hello' });
    expect(bridge.posted).toHaveLength(1);
    expect(bridge.posted[0].targetOrigin).toBe(PAGE_ORIGIN);
    expect(bridge.posted[0].data).toEqual({
      type: 'COGIS_READY',
      nonce: NONCE,
      v: 1,
      extVersion: '9.9.9',
      capabilities: { search: true, cancel: true },
    });
  });

  it('rejects a hello with no nonce', () => {
    const bridge = loadBridge();
    bridge.emit({ data: hello({ nonce: undefined }) });
    expectDrop(bridge, 'drop_malformed', 'hello_missing_nonce');
  });

  it('rejects a hello whose nonce is not 128-bit lowercase hex', () => {
    const bridge = loadBridge();
    bridge.emit({ data: hello({ nonce: NONCE.toUpperCase() }) });
    expectDrop(bridge, 'drop_malformed', 'hello_bad_nonce');
  });

  it('rejects a short nonce', () => {
    const bridge = loadBridge();
    bridge.emit({ data: hello({ nonce: 'abc123' }) });
    expectDrop(bridge, 'drop_malformed', 'hello_bad_nonce');
  });

  it('rejects a hello with the wrong protocol version', () => {
    const bridge = loadBridge();
    bridge.emit({ data: hello({ v: 2 }) });
    expectDrop(bridge, 'drop_malformed', 'hello_bad_v');
  });

  it('re-replies to a repeat hello carrying the same nonce', () => {
    const bridge = handshaken();
    bridge.emit({ data: hello() });
    expect(bridge.lastEvent()).toMatchObject({ kind: 'accepted_hello' });
    expect(bridge.posted).toHaveLength(1);
  });

  it('drops a second hello carrying a different nonce', () => {
    const bridge = handshaken();
    bridge.emit({ data: hello({ nonce: OTHER_NONCE }) });
    expectDrop(bridge, 'drop_nonce', 'nonce_mismatch');
  });

  it('keeps serving the original nonce after a rejected takeover', () => {
    const bridge = handshaken();
    bridge.emit({ data: hello({ nonce: OTHER_NONCE }) });
    bridge.emit({ data: search() });
    expect(bridge.lastEvent()).toMatchObject({ kind: 'accepted' });
  });
});

describe('web bridge — forwarding and delivery', () => {
  it('forwards an accepted search with the nonce stripped', () => {
    const bridge = handshaken();
    bridge.emit({ data: search() });
    expect(bridge.forwarded()).toEqual([
      {
        type: 'WEB_BRIDGE_SEARCH',
        requestId: 'req-1',
        query: 'quarterly plan',
        platforms: ['chatgpt', 'claude'],
      },
    ]);
  });

  it('forwards an accepted cancel with the nonce stripped', () => {
    const bridge = handshaken();
    bridge.emit({ data: cancel() });
    expect(bridge.forwarded()).toEqual([{ type: 'WEB_BRIDGE_CANCEL', requestId: 'req-1' }]);
  });

  it('re-stamps the session nonce on worker-delivered envelopes', () => {
    const bridge = handshaken();
    bridge.deliver({
      type: 'WEB_BRIDGE_DELIVER',
      envelope: {
        type: 'WEB_BRIDGE_RESULT_CHUNK',
        requestId: 'req-1',
        platform: 'chatgpt',
        status: 'ready',
        results: [],
      },
    });
    expect(bridge.posted).toHaveLength(1);
    expect(bridge.posted[0].targetOrigin).toBe(PAGE_ORIGIN);
    expect(bridge.posted[0].data.nonce).toBe(NONCE);
  });

  it('posts nothing to the page before a valid handshake', () => {
    const bridge = loadBridge();
    bridge.deliver({
      type: 'WEB_BRIDGE_DELIVER',
      envelope: { type: 'WEB_BRIDGE_PLATFORM_DONE', requestId: 'req-1', status: 'ok' },
    });
    expect(bridge.posted).toHaveLength(0);
  });

  it('refuses to post an envelope that is not a bridge-originated type', () => {
    const bridge = handshaken();
    bridge.deliver({ type: 'WEB_BRIDGE_DELIVER', envelope: { type: 'COGIS_HELLO' } });
    expect(bridge.posted).toHaveLength(0);
  });

  it('ignores worker broadcasts that are not deliveries', () => {
    const bridge = handshaken();
    bridge.deliver({ type: 'SEARCH_RESULT_CHUNK', requestId: 'req-1' });
    expect(bridge.posted).toHaveLength(0);
  });
});

describe('web bridge — source guarantees', () => {
  it('never targets a wildcard origin', () => {
    const source = readBridgeSource();
    expect(source).not.toMatch(/postMessage\([^)]*['"]\*['"]/);
    expect(source).toMatch(
      /window\.postMessage\(\{ \.\.\.envelope, nonce: sessionNonce \}, PAGE_ORIGIN\)/,
    );
  });

  it('starts fail-closed with a null session nonce', () => {
    expect(readBridgeSource()).toMatch(/let sessionNonce = null;/);
  });
});
