// S8.2 harness controller — throwaway. Deleted when M8b lands (same lifecycle
// as S8.1's web/spike/s8-1.html, removed by PR #34).
//
// Reads its settings from the query string so a DevTools hard reload keeps
// them: a cold load must not depend on any in-page state, and the page is
// forbidden from using localStorage/sessionStorage (addendum §3.5).
//
// Protocol: docs/agent_blueprint-m8-web-surface.md §3.9
// Runbook:  docs/spikes/s8-2-measurement-runbook.md
(function () {
  'use strict';

  const LOG_PREFIX = '[s8.2-page]';

  /**
   * Default probe value only. 1200 ms is the CEILING of the addendum's
   * recommended probe range (§5, "Recommended starting probe range:
   * 400 ms - 1200 ms"). It is NOT a chosen budget — the budget is TBD until
   * S8.2 closes. Using the ceiling keeps the observed run from being
   * false-positived by the probe itself.
   */
  const PROBE_CEILING_MS = 1200;
  const PROBE_FLOOR_MS = 400;

  const params = new URLSearchParams(globalThis.location.search);

  function intParam(name, fallback) {
    const raw = Number.parseInt(params.get(name) ?? '', 10);
    return Number.isFinite(raw) && raw > 0 ? raw : fallback;
  }

  const settings = {
    budgetMs: intParam('budget', PROBE_CEILING_MS),
    helloAt: params.get('hello') === null ? 'dom-content-loaded' : params.get('hello'),
    reemitEveryMs: params.get('reemit') === null ? null : intParam('reemit', 0) || null,
  };

  /** @type {object[]} */
  const timeline = [];

  // Declared above the client because create()/start() emit debug events
  // synchronously, and the sink renders: a `let` below this point would be in
  // its temporal dead zone on the very first event.
  const el = {};
  let bound = false;

  const client = globalThis.CogisBridgeClient.create({
    budgetMs: settings.budgetMs,
    helloAt: settings.helloAt,
    reemitEveryMs: settings.reemitEveryMs,
    debug(entry) {
      timeline.push(entry);
      // Console is the second readout: DevTools keeps it across the hard
      // reloads the protocol asks for ("Preserve log" in S8.1's setup).
      globalThis.console.log(LOG_PREFIX, entry.event, entry);
      render();
    },
  });

  client.on('ready', () => render());
  client.on('gate', () => render());
  client.on('lateReady', () => render());
  client.on('drop', () => render());

  // Arm before the DOM listener below so the client's own DOMContentLoaded
  // emit runs first and t0 is not padded by this harness's rendering work.
  client.start();

  function bind() {
    for (const id of [
      'state',
      'headline',
      'gate',
      'connected',
      'timing',
      'drops',
      'tsv',
      'log',
      'settings',
      'budget',
      'hello',
      'reemit',
      'apply',
    ]) {
      el[id] = document.getElementById(id);
    }
    el.budget.value = String(settings.budgetMs);
    el.hello.value = settings.helloAt;
    el.reemit.value = settings.reemitEveryMs === null ? '' : String(settings.reemitEveryMs);
    el.apply.addEventListener('click', (event) => {
      event.preventDefault();
      const next = new URLSearchParams();
      next.set('budget', el.budget.value);
      next.set('hello', el.hello.value);
      if (el.reemit.value.trim() !== '') next.set('reemit', el.reemit.value.trim());
      globalThis.location.search = `?${next.toString()}`;
    });
    bound = true;
  }

  function ms(value) {
    return typeof value === 'number' ? `${value.toFixed(1)} ms` : '—';
  }

  /**
   * Rows are built with textContent, never innerHTML: some of what lands in the
   * readout (a dropped envelope's `type`, its `origin`) is attacker-controlled.
   * @param {HTMLElement} host
   * @param {[string, string][]} entries
   */
  function fillRows(host, entries) {
    host.textContent = '';
    for (const [label, value] of entries) {
      const wrap = document.createElement('div');
      wrap.className = 'row';
      const key = document.createElement('span');
      key.textContent = label;
      const val = document.createElement('b');
      val.textContent = value;
      wrap.append(key, val);
      host.append(wrap);
    }
  }

  function render() {
    if (!bound) return;
    const snap = client.snapshot();

    el.state.textContent = snap.state;
    el.state.className = `pill state-${snap.state}`;

    if (snap.state === 'connected') {
      el.headline.textContent = `handshake ${ms(snap.handshakeMs)}`;
    } else if (snap.state === 'gated') {
      el.headline.textContent = `install-gate at budget ${snap.budgetMs} ms`;
    } else {
      el.headline.textContent = `checking for the extension (budget ${snap.budgetMs} ms)…`;
    }

    el.connected.hidden = snap.state !== 'connected';
    el.gate.hidden = snap.state !== 'gated';

    const lateReady = timeline.filter((entry) => entry.event === 'late_ready');
    fillRows(el.timing, [
      ['handshake (first HELLO → READY)', ms(snap.handshakeMs)],
      ['since last HELLO → READY', ms(snap.sinceLastHelloMs)],
      ['first HELLO at (since nav start)', ms(snap.firstHelloAt)],
      ['READY at (since nav start)', ms(snap.readyAt)],
      ['gate rendered at (since nav start)', ms(snap.gateAt)],
      ['HELLO emits', String(snap.helloCount)],
      ['emit timing', snap.helloAt],
      [
        're-emit cadence',
        snap.reemitEveryMs === null ? 'off (single HELLO)' : `${snap.reemitEveryMs} ms`,
      ],
      [
        'late READY after gate',
        lateReady.length === 0 ? 'none' : `${lateReady.length} (gate NOT un-rendered)`,
      ],
    ]);

    fillRows(
      el.drops,
      Object.entries(snap.drops).map(([name, count]) => [name, String(count)]),
    );

    // Tab-separated so it pastes straight into the runbook's fill-in table.
    el.tsv.textContent = [
      'run\tstate\thandshake_ms\tsince_last_hello_ms\tfirst_hello_ms\tready_ms\tgate_ms\thello_emits\tbudget_ms',
      [
        '',
        snap.state,
        snap.handshakeMs === null ? '' : snap.handshakeMs.toFixed(1),
        snap.sinceLastHelloMs === null ? '' : snap.sinceLastHelloMs.toFixed(1),
        snap.firstHelloAt === null ? '' : snap.firstHelloAt.toFixed(1),
        snap.readyAt === null ? '' : snap.readyAt.toFixed(1),
        snap.gateAt === null ? '' : snap.gateAt.toFixed(1),
        snap.helloCount,
        snap.budgetMs,
      ].join('\t'),
    ].join('\n');

    el.log.textContent = '';
    for (const entry of timeline) {
      const item = document.createElement('li');
      const at = document.createElement('code');
      at.textContent = `${entry.at.toFixed(1)}`;
      const name = document.createElement('b');
      name.textContent = ` ${entry.event} `;
      const detail = document.createElement('span');
      detail.textContent = describe(entry);
      item.append(at, name, detail);
      el.log.append(item);
    }
  }

  function describe(entry) {
    const parts = [];
    for (const [key, value] of Object.entries(entry)) {
      if (key === 'event' || key === 'at') continue;
      // The nonce is session-scoped and must not be surfaced beyond a prefix.
      const shown = key === 'nonce' ? `${String(value).slice(0, 8)}…` : JSON.stringify(value);
      parts.push(`${key}:${shown}`);
    }
    return parts.join(' ');
  }

  document.addEventListener('DOMContentLoaded', () => {
    bind();
    render();
  });

  // Console handle so numbers can also be read without the DOM.
  globalThis.s82 = {
    client,
    timeline,
    settings,
    probeRange: { floorMs: PROBE_FLOOR_MS, ceilingMs: PROBE_CEILING_MS },
    // Reads the client directly so the numbers are available from the console
    // even before the DOM readout is bound.
    snapshot: () => client.snapshot(),
  };
})();
