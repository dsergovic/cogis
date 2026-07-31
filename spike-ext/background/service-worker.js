// S8.1 spike — background service worker.
//
// The real M8a SW routes to the frozen M1–M4 (and M7 if it lands) adapters.
// For the spike, we short-circuit that path: any accepted envelope from the
// bridge gets a canned result payload. This isolates the bridge protocol
// from adapter behavior — the whole point of S8.1.
//
// Also exposes a message endpoint the spike page uses via the bridge to
// fetch counters from chrome.storage.session.

const TAG = '[s8.1-sw]';

function log(kind, detail) {
  const entry = { ts: Date.now(), phase: 'sw', kind, detail };
  // eslint-disable-next-line no-console
  console.log(TAG, JSON.stringify(entry));
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Second origin check on the SW side: sender.tab.url must start with
  // https://cogis.ai/ (addendum §3.9 envelope rules). The bridge already
  // enforced string equality on event.origin, but the SW does not trust
  // the bridge — it re-checks the tab URL.
  const url = sender && sender.tab && sender.tab.url;
  if (!url || !url.startsWith('https://cogis.ai/')) {
    log('sw_drop_origin', { url });
    sendResponse({ error: 'origin_reject' });
    return false;
  }

  if (message && message.source === 's8.1-bridge' && message.envelope) {
    const env = message.envelope;
    log('sw_forward', { type: env.type, requestId: env.requestId });

    if (env.type === 'WEB_BRIDGE_SEARCH') {
      // Canned reply: one chunk per requested platform, then a done frame.
      const platforms = Array.isArray(env.platforms) ? env.platforms : ['chatgpt'];
      const chunks = platforms.map((p) => ({
        type: 'WEB_BRIDGE_RESULT_CHUNK',
        requestId: env.requestId,
        platform: p,
        status: 'ok',
        results: [
          {
            title: `[S8.1 canned] ${p} result for "${env.query}"`,
            url: `https://example.invalid/${p}/${encodeURIComponent(env.query)}`,
            snippet: 'Canned spike payload. Not a real result.',
          },
        ],
      }));
      const done = {
        type: 'WEB_BRIDGE_PLATFORM_DONE',
        requestId: env.requestId,
        platform: platforms[platforms.length - 1] || 'chatgpt',
        status: 'ok',
      };
      sendResponse({ chunks, done });
      return false;
    }

    if (env.type === 'WEB_BRIDGE_CANCEL') {
      log('sw_cancel_acked', { requestId: env.requestId });
      sendResponse({ done: { type: 'WEB_BRIDGE_PLATFORM_DONE', requestId: env.requestId, platform: 'all', status: 'cancelled' } });
      return false;
    }

    sendResponse({ error: 'unhandled_envelope', type: env.type });
    return false;
  }

  // Counter fetch: the spike page asks the SW for the latest counters.
  if (message && message.source === 's8.1-page-request' && message.op === 'getCounters') {
    chrome.storage.session.get('s81Counters', (data) => {
      sendResponse({ counters: data.s81Counters || null });
    });
    return true; // async response
  }

  return false;
});

log('sw_loaded', { manifestVersion: chrome.runtime.getManifest().version });
