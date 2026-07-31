import { describe, it, expect, beforeEach } from 'vitest';
import { loadBridge } from '../helpers/web-bridge-harness.js';
import {
  getWebBridgeSnapshot,
  noteBridgeRequest,
  recordBridgeEvent,
  resetWebBridgeStatsForTests,
} from '../../extension/lib/web-bridge.js';
import { RECONCILIATION_SCRIPT, hello, search } from '../fixtures/web-bridge/envelopes.js';

const DROP_AND_ACCEPT_COUNTERS = [
  'originDropCount',
  'nonceDropCount',
  'malformedDropCount',
  'acceptedCount',
];

beforeEach(() => {
  resetWebBridgeStatsForTests();
});

describe('web bridge counter store', () => {
  it('starts at zero', () => {
    expect(getWebBridgeSnapshot()).toEqual({
      originDropCount: 0,
      nonceDropCount: 0,
      malformedDropCount: 0,
      oversizedDropCount: 0,
      acceptedCount: 0,
      helloCount: 0,
      handshakeCount: 0,
      lastHandshakeAt: null,
      recentRequests: [],
    });
  });

  it('folds a source drop into the origin counter', () => {
    expect(recordBridgeEvent({ kind: 'drop_source' })).toBe('originDropCount');
    expect(getWebBridgeSnapshot().originDropCount).toBe(1);
  });

  it('counts an oversized drop as malformed and breaks it out separately', () => {
    recordBridgeEvent({ kind: 'drop_malformed', reason: 'oversized' });
    recordBridgeEvent({ kind: 'drop_malformed', reason: 'unknown_type' });
    const snapshot = getWebBridgeSnapshot();
    expect(snapshot.malformedDropCount).toBe(2);
    expect(snapshot.oversizedDropCount).toBe(1);
  });

  it('reports handshakeCount and helloCount as the same accepted handshake', () => {
    recordBridgeEvent({ kind: 'accepted_hello', at: 1712000000000 });
    const snapshot = getWebBridgeSnapshot();
    expect(snapshot.helloCount).toBe(1);
    expect(snapshot.handshakeCount).toBe(1);
    expect(snapshot.acceptedCount).toBe(1);
    expect(snapshot.lastHandshakeAt).toBe(1712000000000);
  });

  it('ignores an unrecognised kind so the page cannot invent counters', () => {
    expect(recordBridgeEvent({ kind: 'drop_everything' })).toBeNull();
    expect(recordBridgeEvent({ kind: 'constructor' })).toBeNull();
    expect(recordBridgeEvent({})).toBeNull();
    expect(recordBridgeEvent(null)).toBeNull();
    expect(getWebBridgeSnapshot()).toMatchObject({
      originDropCount: 0,
      malformedDropCount: 0,
      acceptedCount: 0,
    });
  });

  it('keeps only the last five request ids, upserting by id', () => {
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) {
      noteBridgeRequest({ requestId: id, status: 'running' });
    }
    noteBridgeRequest({ requestId: 'c', status: 'ok' });
    expect(getWebBridgeSnapshot().recentRequests).toEqual([
      { requestId: 'b', status: 'running' },
      { requestId: 'd', status: 'running' },
      { requestId: 'e', status: 'running' },
      { requestId: 'f', status: 'running' },
      { requestId: 'c', status: 'ok' },
    ]);
  });

  it('ignores a request note with no id', () => {
    noteBridgeRequest({ status: 'ok' });
    noteBridgeRequest(null);
    expect(getWebBridgeSnapshot().recentRequests).toEqual([]);
  });
});

describe('web bridge counter reconciliation', () => {
  /**
   * Drive the real bridge through the scripted action list, feed every reported
   * observation into the real worker-side store, then reconcile. This is the
   * end-to-end check that no action is silently uncounted and no action is
   * double-counted — the property the S8.1 spike closed each round with.
   */
  function runScript() {
    const bridge = loadBridge();
    /** @type {Record<string, number>} */
    const expected = {
      originDropCount: 0,
      nonceDropCount: 0,
      malformedDropCount: 0,
      acceptedCount: 0,
    };

    for (const step of RECONCILIATION_SCRIPT) {
      const before = bridge.events().length;
      bridge.emit({ data: step.data, origin: step.origin, fromSubframe: step.fromSubframe });
      const reported = bridge.events().slice(before);

      if (step.expected === null) {
        expect(reported, `${step.label} must be silent`).toHaveLength(0);
        continue;
      }
      expect(reported, `${step.label} must report exactly one observation`).toHaveLength(1);
      const moved = recordBridgeEvent(reported[0]);
      expect(moved, `${step.label} moved the wrong counter`).toBe(step.expected);
      expected[step.expected] += 1;
    }

    return { bridge, expected };
  }

  it('moves exactly one counter per counted action', () => {
    const { expected } = runScript();
    expect(getWebBridgeSnapshot()).toMatchObject(expected);
  });

  it('reconciles the total against the number of reported observations', () => {
    const { bridge } = runScript();
    const snapshot = getWebBridgeSnapshot();
    const total = DROP_AND_ACCEPT_COUNTERS.reduce((sum, key) => sum + snapshot[key], 0);
    expect(total).toBe(bridge.events().length);
  });

  it('lands on the tally the script implies', () => {
    runScript();
    expect(getWebBridgeSnapshot()).toMatchObject({
      originDropCount: 2,
      nonceDropCount: 2,
      malformedDropCount: 5,
      oversizedDropCount: 1,
      acceptedCount: 3,
      helloCount: 1,
      handshakeCount: 1,
    });
  });

  it('counts a clean handshake-then-search session as two accepts and no drops', () => {
    const bridge = loadBridge();
    bridge.emit({ data: hello() });
    bridge.emit({ data: search() });
    for (const event of bridge.events()) recordBridgeEvent(event);

    expect(getWebBridgeSnapshot()).toMatchObject({
      originDropCount: 0,
      nonceDropCount: 0,
      malformedDropCount: 0,
      oversizedDropCount: 0,
      acceptedCount: 2,
      helloCount: 1,
    });
  });
});
