import { describe, it, expect } from 'vitest';
import { startPage } from '../helpers/page-harness.js';

// The install-gate half of §6 M8b AC #1 / #2, against the numbers S8.2 locked
// (docs/spikes/s8-2-install-gate-latency.md, CLOSED 2026-07-31). Time only
// moves when a test calls `env.advance`, so the boundary is exact rather than
// approximately exact.
describe('handshake constants', () => {
  it('drives the bridge client with the locked budget and cadence', () => {
    // R5: the 900 ms budget was measured with the 100 ms cadence and is only
    // valid together with it. Asserted at the call site so a future edit to
    // either number fails here rather than silently shipping.
    const harness = startPage();
    expect(harness.clientOptions()).toMatchObject({ budgetMs: 900, reemitEveryMs: 100 });
    expect(harness.api.page.INSTALL_GATE_BUDGET_MS).toBe(900);
    expect(harness.api.page.HELLO_REEMIT_EVERY_MS).toBe(100);
  });

  it('emits the first HELLO on the DOMContentLoaded tick', () => {
    const harness = startPage();
    expect(harness.env.hellos()).toHaveLength(0);
    harness.fireDomReady();
    expect(harness.env.hellos()).toHaveLength(1);
  });

  it('re-emits the same nonce every 100 ms while it waits', () => {
    const harness = startPage();
    harness.fireDomReady();
    harness.env.advance(250);
    const hellos = harness.env.hellos();
    expect(hellos).toHaveLength(3);
    expect(new Set(hellos.map((entry) => entry.data.nonce)).size).toBe(1);
  });
});

describe('connection states', () => {
  it('shows a neutral checking state with the searchbox disabled', () => {
    // S8.2 behavior table, `t < budget` row: no gate before the budget, and
    // nothing runnable until the handshake resolves (§6 M8b AC #2).
    const harness = startPage();
    harness.fireDomReady();
    expect(harness.el('cogis-status-pill').textContent).toBe('Checking for Cogis extension…');
    expect(harness.el('cogis-query').disabled).toBe(true);
    expect(harness.el('cogis-submit').disabled).toBe(true);
    expect(harness.el('cogis-install-gate').hidden).toBe(true);
    expect(harness.el('cogis-search').hidden).toBe(false);
  });

  it('shows the locked connected copy and focuses the searchbox on READY', () => {
    // §6 M8b AC #1: searchbox, autofocus, pill reading "Extension connected."
    const harness = startPage();
    harness.fireDomReady();
    harness.env.setNow(275.5);
    harness.connect();

    expect(harness.el('cogis-status-pill').textContent).toBe('Extension connected.');
    expect(harness.el('cogis-status-pill').getAttribute('data-cogis-connection')).toBe('connected');
    expect(harness.el('cogis-query').disabled).toBe(false);
    expect(harness.el('cogis-query').focused).toBe(true);
    expect(harness.el('cogis-install-gate').hidden).toBe(true);
  });

  it('holds the searchbox until the budget elapses, then swaps in the gate', () => {
    const harness = startPage();
    harness.fireDomReady();

    harness.env.advance(899);
    expect(harness.el('cogis-install-gate').hidden).toBe(true);
    expect(harness.el('cogis-search').hidden).toBe(false);

    harness.env.advance(1);
    expect(harness.el('cogis-install-gate').hidden).toBe(false);
    expect(harness.el('cogis-search').hidden).toBe(true);
    expect(harness.el('cogis-results').hidden).toBe(true);
    expect(harness.el('cogis-status-pill').hidden).toBe(true);
  });

  it('stops re-emitting once the gate renders', () => {
    const harness = startPage();
    harness.fireDomReady();
    harness.env.advance(900);
    const atGate = harness.env.hellos().length;
    harness.env.advance(5000);
    expect(harness.env.hellos()).toHaveLength(atGate);
  });

  it('ignores a late READY and never un-renders the gate', () => {
    // S8.2 `t > budget` row, confirmed live: a gate that flickers away after
    // the user has started reading it is worse than one that stays honest.
    const harness = startPage();
    harness.fireDomReady();
    harness.env.advance(900);
    harness.env.setNow(1400);
    harness.connect();

    expect(harness.el('cogis-install-gate').hidden).toBe(false);
    expect(harness.el('cogis-search').hidden).toBe(true);
    expect(harness.el('cogis-query').disabled).toBe(true);
    expect(harness.el('cogis-status-pill').textContent).not.toBe('Extension connected.');
  });

  it('refuses to search from the gated state', () => {
    const harness = startPage();
    harness.fireDomReady();
    harness.env.advance(900);
    harness.page.submit('risotto');
    expect(harness.posted('WEB_BRIDGE_SEARCH')).toHaveLength(0);
  });
});

describe('gate copy honesty', () => {
  it('renders the LOCKED gate sentence', () => {
    // S8.2 residual risk R4: a withheld host permission, a disabled-per-origin
    // extension, and an uninstalled extension are indistinguishable at the
    // protocol level. The page may say what it observed, never why.
    const harness = startPage();
    harness.fireDomReady();
    harness.env.advance(900);
    expect(harness.el('cogis-gate-copy').textContent).toBe(
      'Install the Cogis Chrome extension to search.',
    );
  });
});
