import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runInNewContext } from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

export const BRIDGE_PATH = join(root, 'extension/content/web-bridge.js');

export const FLAG_OFF_LINE = 'const WEB_SEARCH_SURFACE_ENABLED = false;';
export const FLAG_ON_LINE = 'const WEB_SEARCH_SURFACE_ENABLED = true;';

export function readBridgeSource() {
  return readFileSync(BRIDGE_PATH, 'utf8');
}

/**
 * Run the bridge content script in a sandbox with a stand-in `window` and
 * `chrome`. The bridge is a classic script with no imports, so the flag is an
 * inline literal; flipping it here is the only way to reach the enabled path
 * (and the literal's exact text is pinned by web-bridge-flag-sync.test.js).
 *
 * @param {{ enabled?: boolean, manifestVersion?: string }} [options]
 */
export function loadBridge(options = {}) {
  const { enabled = true, manifestVersion = '0.6.0' } = options;

  let source = readBridgeSource();
  if (enabled) {
    if (!source.includes(FLAG_OFF_LINE)) {
      throw new Error('bridge flag literal moved — update FLAG_OFF_LINE');
    }
    source = source.replace(FLAG_OFF_LINE, FLAG_ON_LINE);
  }

  /** @type {{ data: unknown, targetOrigin: string }[]} */
  const posted = [];
  /** @type {object[]} */
  const sent = [];
  /** @type {((event: object) => void)[]} */
  const messageListeners = [];
  /** @type {((message: object) => unknown)[]} */
  const runtimeListeners = [];

  const window = {
    addEventListener(type, fn) {
      if (type === 'message') messageListeners.push(fn);
    },
    postMessage(data, targetOrigin) {
      posted.push({ data, targetOrigin });
    },
  };

  const subframe = { name: 'same-origin-subframe' };

  const context = {
    window,
    console,
    TextEncoder,
    chrome: {
      runtime: {
        lastError: undefined,
        getManifest: () => ({ version: manifestVersion }),
        sendMessage(message, callback) {
          sent.push(message);
          if (typeof callback === 'function') callback({ ok: true });
        },
        onMessage: {
          addListener(fn) {
            runtimeListeners.push(fn);
          },
        },
      },
    },
  };

  runInNewContext(source, context, { filename: 'extension/content/web-bridge.js' });

  return {
    posted,
    sent,
    subframe,
    window,
    messageListenerCount: () => messageListeners.length,
    runtimeListenerCount: () => runtimeListeners.length,

    /**
     * Dispatch one inbound page message.
     * @param {{ data: unknown, origin?: string, fromSubframe?: boolean }} input
     */
    emit(input) {
      const event = {
        data: input.data,
        origin: input.origin ?? 'https://cogis.ai',
        source: input.fromSubframe ? subframe : window,
      };
      for (const fn of [...messageListeners]) fn(event);
    },

    /**
     * Dispatch one worker → content-script message.
     * @param {object} message
     */
    deliver(message) {
      for (const fn of [...runtimeListeners]) fn(message);
    },

    /** Counter observations the bridge reported to the worker. */
    events: () => sent.filter((m) => m.type === 'WEB_BRIDGE_EVENT'),

    /** Work envelopes the bridge forwarded to the worker. */
    forwarded: () => sent.filter((m) => m.type !== 'WEB_BRIDGE_EVENT'),

    /** The single most recent counter observation. */
    lastEvent() {
      const all = sent.filter((m) => m.type === 'WEB_BRIDGE_EVENT');
      return all[all.length - 1] ?? null;
    },
  };
}
