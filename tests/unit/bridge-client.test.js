import { describe, it, expect } from 'vitest';
import {
  createEnv,
  loadClientApi,
  nonceOf,
  startClient,
} from '../helpers/bridge-client-harness.js';

const ORIGIN = 'https://cogis.ai';

/** A COGIS_READY the bridge would actually send (extension/content/web-bridge.js). */
function readyFor(nonce, overrides = {}) {
  return {
    type: 'COGIS_READY',
    nonce,
    v: 1,
    extVersion: '0.6.0',
    capabilities: { search: true, cancel: true },
    ...overrides,
  };
}

describe('createBridgeClient options', () => {
  it('refuses to run without an explicit budget', () => {
    // S8.2 has not picked the number; a default here would be a budget
    // invented from a whiteboard, which the spike doc forbids.
    const api = loadClientApi();
    const env = createEnv();
    const base = { win: env.win, doc: env.doc, now: env.now, cryptoImpl: env.cryptoImpl };
    expect(() => api.create({ ...base })).toThrow(/budgetMs is required/);
    expect(() => api.create({ ...base, budgetMs: 0 })).toThrow(/budgetMs is required/);
    expect(() => api.create({ ...base, budgetMs: '800' })).toThrow(/budgetMs is required/);
  });

  it('rejects an unknown emit timing', () => {
    const api = loadClientApi();
    const env = createEnv();
    expect(() =>
      api.create({ budgetMs: 800, helloAt: 'whenever', win: env.win, doc: env.doc }),
    ).toThrow(/unknown helloAt/);
  });

  it('exposes the locked contract literals', () => {
    const api = loadClientApi();
    expect(api.PAGE_ORIGIN).toBe(ORIGIN);
    expect(api.PROTOCOL_VERSION).toBe(1);
    expect(api.TYPES.HELLO).toBe('COGIS_HELLO');
    expect(api.TYPES.READY).toBe('COGIS_READY');
  });
});

describe('handshake emit', () => {
  it('emits on the DOMContentLoaded tick by default, not before', () => {
    // The default is the emit point S8.2 is asking about, not a proven-good
    // one: `document_idle` fires after DOMContentLoaded, so whether the bridge
    // listener exists yet is an open live-observation question. Changing this
    // default is a §3.9 contract decision, not a fixture tweak.
    const { env } = startClient({ readyState: 'loading' });
    expect(env.hellos()).toHaveLength(0);
    env.fireDomContentLoaded();
    expect(env.hellos()).toHaveLength(1);
  });

  it('posts a §3.9 HELLO to the exact origin literal, never "*"', () => {
    const { env } = startClient();
    env.fireDomContentLoaded();
    const [hello] = env.hellos();
    expect(hello.targetOrigin).toBe(ORIGIN);
    expect(hello.data).toEqual({
      type: 'COGIS_HELLO',
      nonce: expect.stringMatching(/^[0-9a-f]{32}$/),
      v: 1,
    });
  });

  it('emits immediately when asked, for the head-timing probe', () => {
    const { env } = startClient({ helloAt: 'immediate', readyState: 'loading' });
    expect(env.hellos()).toHaveLength(1);
  });

  it('emits on load when asked', () => {
    const { env } = startClient({ helloAt: 'load', readyState: 'loading' });
    expect(env.hellos()).toHaveLength(0);
    env.fireLoad();
    expect(env.hellos()).toHaveLength(1);
  });

  it('emits at once when the document is already complete', () => {
    const { env } = startClient({ readyState: 'complete' });
    expect(env.hellos()).toHaveLength(1);
  });

  it('re-emits the same nonce when a cadence is configured', () => {
    // The bridge treats a repeated nonce as idempotent and re-replies READY,
    // so a cadence is a measurement knob rather than a protocol change.
    const { env } = startClient({ helloAt: 'immediate', reemitEveryMs: 100, budgetMs: 1000 });
    env.advance(250);
    const hellos = env.hellos();
    expect(hellos).toHaveLength(3);
    expect(new Set(hellos.map((entry) => entry.data.nonce)).size).toBe(1);
  });

  it('sends exactly one HELLO with no cadence', () => {
    const { env } = startClient({ helloAt: 'immediate', budgetMs: 1000 });
    env.advance(900);
    expect(env.hellos()).toHaveLength(1);
  });
});

describe('timing path', () => {
  it('measures first HELLO → READY with performance.now()', () => {
    const { env, client, seen } = startClient({ helloAt: 'immediate', budgetMs: 1000 });
    env.setNow(275.5);
    env.deliver({ data: readyFor(nonceOf(env)) });

    expect(seen.ready).toHaveLength(1);
    expect(seen.ready[0].handshakeMs).toBeCloseTo(275.5, 5);
    expect(seen.ready[0].extVersion).toBe('0.6.0');
    expect(seen.ready[0].capabilities).toEqual({ search: true, cancel: true });
    expect(client.snapshot()).toMatchObject({
      state: 'connected',
      handshakeMs: 275.5,
      helloCount: 1,
      readyAt: 275.5,
    });
  });

  it('reports the last-HELLO delta separately when re-emitting', () => {
    const { env, client } = startClient({
      helloAt: 'immediate',
      reemitEveryMs: 100,
      budgetMs: 1000,
    });
    env.advance(200); // hellos at 0, 100, 200
    env.setNow(240);
    env.deliver({ data: readyFor(nonceOf(env)) });

    const snap = client.snapshot();
    expect(snap.helloCount).toBe(3);
    expect(snap.handshakeMs).toBe(240);
    expect(snap.sinceLastHelloMs).toBe(40);
  });

  it('traces every observation through the debug sink', () => {
    const { env, events } = startClient({ helloAt: 'immediate', budgetMs: 1000 });
    env.setNow(120);
    env.deliver({ data: readyFor(nonceOf(env)) });
    expect(events.map((entry) => entry.event)).toEqual(['start', 'hello_sent', 'ready']);
    expect(events.at(-1)).toMatchObject({ event: 'ready', at: 120, handshakeMs: 120 });
  });

  it('keeps the debug sink optional', () => {
    const api = loadClientApi();
    const env = createEnv({ readyState: 'complete' });
    const client = api.create({
      budgetMs: 500,
      win: env.win,
      doc: env.doc,
      now: env.now,
      cryptoImpl: env.cryptoImpl,
    });
    client.start();
    expect(env.hellos()).toHaveLength(1);
    expect(client.snapshot().state).toBe('checking');
  });
});

describe('install-gate at the budget boundary', () => {
  it('stays in checking until the budget elapses', () => {
    const { env, client, seen } = startClient({ helloAt: 'immediate', budgetMs: 800 });
    env.advance(799);
    expect(client.snapshot().state).toBe('checking');
    expect(seen.gate).toHaveLength(0);
    env.advance(1);
    expect(client.snapshot().state).toBe('gated');
    expect(seen.gate[0]).toMatchObject({ budgetMs: 800, sinceFirstHelloMs: 800 });
  });

  it('ignores a late READY and does not un-render the gate', () => {
    const { env, client, seen } = startClient({ helloAt: 'immediate', budgetMs: 800 });
    env.advance(800);
    env.setNow(950);
    env.deliver({ data: readyFor(nonceOf(env)) });

    expect(seen.ready).toHaveLength(0);
    expect(seen.lateReady).toHaveLength(1);
    expect(seen.lateReady[0]).toMatchObject({ sinceFirstHelloMs: 950, afterGateMs: 150 });
    expect(client.snapshot().state).toBe('gated');
  });

  it('does not gate after a READY inside the budget', () => {
    const { env, client, seen } = startClient({ helloAt: 'immediate', budgetMs: 800 });
    env.setNow(120);
    env.deliver({ data: readyFor(nonceOf(env)) });
    env.advance(5000);
    expect(seen.gate).toHaveLength(0);
    expect(client.snapshot().state).toBe('connected');
  });

  it('stops re-emitting once the gate renders', () => {
    const { env } = startClient({ helloAt: 'immediate', budgetMs: 300, reemitEveryMs: 100 });
    env.advance(300);
    const atGate = env.hellos().length;
    env.advance(1000);
    expect(env.hellos()).toHaveLength(atGate);
  });
});

describe('inbound validation (§3.9 page side)', () => {
  it('ignores its own echoed envelopes without counting a drop', () => {
    // window.postMessage delivers to the sender's own listeners with
    // event.source === window, so the page hears its own HELLO back
    // (S8.1 observation log, Round 1).
    const { env, client } = startClient({ helloAt: 'immediate' });
    env.deliver({ data: { type: 'COGIS_HELLO', nonce: nonceOf(env), v: 1 } });
    env.deliver({ data: { type: 'WEB_BRIDGE_SEARCH', nonce: nonceOf(env), requestId: 'r' } });
    expect(client.snapshot().drops).toEqual({
      originDropCount: 0,
      sourceDropCount: 0,
      nonceDropCount: 0,
      malformedDropCount: 0,
    });
  });

  it('drops a cross-origin READY', () => {
    const { env, client, seen } = startClient({ helloAt: 'immediate' });
    for (const origin of ['https://cogis.ai.evil.example', 'http://cogis.ai', 'null', undefined]) {
      env.deliver({ data: readyFor(nonceOf(env)), origin });
    }
    expect(seen.ready).toHaveLength(0);
    expect(client.snapshot().drops.originDropCount).toBe(4);
  });

  it('drops a same-origin subframe sender', () => {
    const { env, client, seen } = startClient({ helloAt: 'immediate' });
    env.deliver({ data: readyFor(nonceOf(env)), source: { name: 'subframe' } });
    expect(seen.ready).toHaveLength(0);
    expect(client.snapshot().drops.sourceDropCount).toBe(1);
  });

  it('drops a mismatched or missing nonce', () => {
    const { env, client, seen } = startClient({ helloAt: 'immediate' });
    env.deliver({ data: readyFor('f'.repeat(32)) });
    env.deliver({ data: readyFor(undefined) });
    expect(seen.ready).toHaveLength(0);
    expect(client.snapshot().drops.nonceDropCount).toBe(2);
  });

  it('cannot accept a READY that arrives before the page emits', () => {
    // S8.2 "reply arrives before page emit" row: no listener exists until
    // start(), and the nonce is null until start() mints one — two reasons an
    // unsolicited COGIS_READY can never be accepted.
    const { env, client, seen } = startClient({ start: false });
    expect(env.messageListenerCount()).toBe(0);
    env.deliver({ data: readyFor('a'.repeat(32)) });
    expect(seen.ready).toHaveLength(0);
    expect(client.snapshot()).toMatchObject({ state: 'idle', handshakeMs: null });
  });

  it('drops malformed and unknown types', () => {
    const { env, client, seen } = startClient({ helloAt: 'immediate' });
    const nonce = nonceOf(env);
    env.deliver({ data: null });
    env.deliver({ data: 'COGIS_READY' });
    env.deliver({ data: { nonce } });
    env.deliver({ data: { type: 'COGIS_SUPERUSER', nonce } });
    env.deliver({ data: readyFor(nonce, { v: 2 }) });
    env.deliver({ data: readyFor(nonce, { capabilities: 'yes' }) });
    env.deliver({ data: { type: 'WEB_BRIDGE_RESULT_CHUNK', nonce } });
    expect(seen.ready).toHaveLength(0);
    expect(client.snapshot().drops.malformedDropCount).toBe(7);
  });

  it('accepts result chunks and done frames after the handshake', () => {
    const { env, seen } = startClient({ helloAt: 'immediate' });
    const nonce = nonceOf(env);
    env.deliver({ data: readyFor(nonce) });
    env.deliver({
      data: {
        type: 'WEB_BRIDGE_RESULT_CHUNK',
        nonce,
        requestId: 'req-1',
        platform: 'chatgpt',
        status: 'ready',
      },
    });
    env.deliver({
      data: {
        type: 'WEB_BRIDGE_PLATFORM_DONE',
        nonce,
        requestId: 'req-1',
        platform: 'all',
        status: 'cancelled',
      },
    });
    expect(seen.chunk).toHaveLength(1);
    expect(seen.done[0]).toMatchObject({ platform: 'all', status: 'cancelled' });
  });
});

describe('outbound work envelopes', () => {
  it('sends SEARCH and CANCEL only after the handshake, with the session nonce', () => {
    const { env, client } = startClient({ helloAt: 'immediate' });
    const nonce = nonceOf(env);

    expect(client.search({ requestId: 'r1', query: 'risotto', platforms: ['chatgpt'] })).toBe(
      false,
    );
    expect(client.cancel('r1')).toBe(false);

    env.deliver({ data: readyFor(nonce) });

    expect(client.search({ requestId: 'r1', query: 'risotto', platforms: ['chatgpt'] })).toBe(true);
    expect(env.lastPosted()).toEqual({
      targetOrigin: 'https://cogis.ai',
      data: {
        type: 'WEB_BRIDGE_SEARCH',
        nonce,
        requestId: 'r1',
        query: 'risotto',
        platforms: ['chatgpt'],
      },
    });

    expect(client.cancel('r1')).toBe(true);
    expect(env.lastPosted().data).toEqual({ type: 'WEB_BRIDGE_CANCEL', nonce, requestId: 'r1' });
  });
});

describe('session hygiene', () => {
  it('mints a fresh 128-bit hex nonce per client', () => {
    const { env } = startClient({ helloAt: 'immediate' });
    expect(nonceOf(env)).toMatch(/^[0-9a-f]{32}$/);
  });

  it('starts once and detaches on stop', () => {
    const { env, client } = startClient({ helloAt: 'immediate' });
    client.start();
    expect(env.hellos()).toHaveLength(1);
    client.stop();
    expect(env.messageListenerCount()).toBe(0);
  });

  it('never surfaces the nonce in the timing snapshot', () => {
    const { env, client } = startClient({ helloAt: 'immediate' });
    expect(JSON.stringify(client.snapshot())).not.toContain(nonceOf(env));
  });
});
