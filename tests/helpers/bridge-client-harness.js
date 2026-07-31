import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runInNewContext } from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

export const CLIENT_PATH = join(root, 'web/assets/js/bridge-client.js');
export const HARNESS_PAGE_PATH = join(root, 'web/spike/s8-2.html');
export const HARNESS_SCRIPT_PATH = join(root, 'web/spike/s8-2.js');

export function readClientSource() {
  return readFileSync(CLIENT_PATH, 'utf8');
}

/**
 * The page client is a flat classic script that installs one global, so it is
 * loaded the same way the bridge is: in a vm sandbox, not imported.
 */
export function loadClientApi() {
  const context = { console };
  runInNewContext(readClientSource(), context, { filename: 'web/assets/js/bridge-client.js' });
  return context.CogisBridgeClient;
}

/**
 * Stand-in `window` / `document` / clock. Time only moves when a test calls
 * `advance`, so budget-boundary behavior is deterministic.
 *
 * @param {{ readyState?: 'loading'|'interactive'|'complete', nonceSeed?: number }} [options]
 */
export function createEnv(options = {}) {
  const { readyState = 'loading', nonceSeed = 0x10 } = options;

  let clock = 0;
  let nextTimerId = 1;
  /** @type {Map<number, { fn: () => void, dueAt: number, everyMs: number|null }>} */
  const timers = new Map();
  /** @type {{ data: unknown, targetOrigin: string }[]} */
  const posted = [];
  /** @type {((event: object) => void)[]} */
  const messageListeners = [];
  /** @type {(() => void)[]} */
  const loadListeners = [];
  /** @type {(() => void)[]} */
  const domReadyListeners = [];

  const doc = {
    readyState,
    addEventListener(type, fn) {
      if (type === 'DOMContentLoaded') domReadyListeners.push(fn);
    },
  };

  const win = {
    document: doc,
    addEventListener(type, fn) {
      if (type === 'message') messageListeners.push(fn);
      if (type === 'load') loadListeners.push(fn);
    },
    removeEventListener(type, fn) {
      if (type !== 'message') return;
      const at = messageListeners.indexOf(fn);
      if (at !== -1) messageListeners.splice(at, 1);
    },
    postMessage(data, targetOrigin) {
      posted.push({ data, targetOrigin });
    },
    setTimeout(fn, ms) {
      const id = nextTimerId++;
      timers.set(id, { fn, dueAt: clock + ms, everyMs: null });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    setInterval(fn, ms) {
      const id = nextTimerId++;
      timers.set(id, { fn, dueAt: clock + ms, everyMs: ms });
      return id;
    },
    clearInterval(id) {
      timers.delete(id);
    },
  };

  const cryptoImpl = {
    getRandomValues(view) {
      for (let i = 0; i < view.length; i += 1) view[i] = (nonceSeed + i) & 0xff;
      return view;
    },
  };

  return {
    win,
    doc,
    posted,
    cryptoImpl,
    now: () => clock,
    /** Timer-free clock nudge: makes handshake deltas assertable. */
    setNow(value) {
      clock = value;
    },
    /** Move the clock and run whatever came due, oldest first. */
    advance(ms) {
      const target = clock + ms;
      for (;;) {
        const due = [...timers.entries()]
          .filter(([, timer]) => timer.dueAt <= target)
          .sort((a, b) => a[1].dueAt - b[1].dueAt);
        if (due.length === 0) break;
        const [id, timer] = due[0];
        clock = timer.dueAt;
        if (timer.everyMs === null) timers.delete(id);
        else timer.dueAt = clock + timer.everyMs;
        timer.fn();
      }
      clock = target;
    },
    fireDomContentLoaded() {
      doc.readyState = 'interactive';
      for (const fn of [...domReadyListeners]) fn();
    },
    fireLoad() {
      doc.readyState = 'complete';
      for (const fn of [...loadListeners]) fn();
    },
    /** Dispatch one inbound message event at the page. */
    deliver(input) {
      const event = {
        data: input.data,
        origin: 'origin' in input ? input.origin : 'https://cogis.ai',
        source: 'source' in input ? input.source : win,
      };
      for (const fn of [...messageListeners]) fn(event);
    },
    messageListenerCount: () => messageListeners.length,
    /** The HELLO envelopes the client posted, in order. */
    hellos: () => posted.filter((entry) => entry.data?.type === 'COGIS_HELLO'),
    lastPosted: () => posted[posted.length - 1] ?? null,
  };
}

/**
 * A started client plus its env, wired to the fake clock. `events` collects the
 * debug sink so the timing path is asserted rather than assumed.
 *
 * @param {object} [options] `budgetMs`, `helloAt`, `reemitEveryMs`, `readyState`
 */
export function startClient(options = {}) {
  const api = loadClientApi();
  const env = createEnv({ readyState: options.readyState });
  /** @type {object[]} */
  const events = [];
  /** @type {Record<string, object[]>} */
  const seen = { ready: [], gate: [], lateReady: [], chunk: [], done: [], drop: [] };

  const client = api.create({
    budgetMs: options.budgetMs ?? 1000,
    helloAt: options.helloAt,
    reemitEveryMs: options.reemitEveryMs,
    win: env.win,
    doc: env.doc,
    now: env.now,
    cryptoImpl: env.cryptoImpl,
    debug: (entry) => events.push(entry),
  });

  for (const name of Object.keys(seen)) client.on(name, (payload) => seen[name].push(payload));
  if (options.start !== false) client.start();

  return { api, env, client, events, seen };
}

/** The nonce the client minted, read off its first HELLO. */
export function nonceOf(env) {
  return env.hellos()[0]?.data?.nonce ?? null;
}
