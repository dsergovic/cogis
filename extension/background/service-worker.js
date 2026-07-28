import { MSG, createResultChunk, createPlatformDone, normalizeQuery } from '../lib/messaging.js';
import { PLATFORMS, PLATFORM_ORDER } from '../lib/platforms.js';
import {
  PLATFORM_TIMEOUT_MS,
  OVERALL_WALL_MS,
  createRequestTracker,
  withTimeout,
} from '../lib/timeouts.js';

const tracker = createRequestTracker();

/**
 * Find an existing ChatGPT tab or open one in the background.
 * @returns {Promise<number>} tab id
 */
async function ensureChatgptTab() {
  const patterns = PLATFORMS.chatgpt.hostPatterns;
  const existing = await chrome.tabs.query({ url: patterns });
  if (existing.length > 0 && existing[0].id != null) {
    return existing[0].id;
  }

  const tab = await chrome.tabs.create({
    url: `${PLATFORMS.chatgpt.origin}/`,
    active: false,
  });
  if (tab.id == null) {
    throw new Error('Failed to open ChatGPT tab');
  }

  await waitForTabComplete(tab.id, PLATFORM_TIMEOUT_MS);
  return tab.id;
}

/**
 * @param {number} tabId
 * @param {number} timeoutMs
 */
function waitForTabComplete(tabId, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(undefined);
    }, timeoutMs);

    function listener(updatedId, info) {
      if (updatedId === tabId && info.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve(undefined);
      }
    }

    chrome.tabs.get(tabId).then((tab) => {
      if (tab.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve(undefined);
      } else {
        chrome.tabs.onUpdated.addListener(listener);
      }
    }, reject);
  });
}

/**
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Message the manifest content script; retry briefly if it is not ready yet.
 * Do not programmatically inject ES-module content scripts (unsupported).
 * @param {number} tabId
 * @param {{ requestId: string, query: string }} payload
 */
async function sendChatgptSearch(tabId, payload) {
  const message = {
    type: MSG.CHATGPT_SEARCH,
    requestId: payload.requestId,
    query: payload.query,
  };

  let lastErr;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (err) {
      lastErr = err;
      await sleep(200 * (attempt + 1));
    }
  }
  throw lastErr ?? new Error('ChatGPT content script unreachable');
}

/**
 * @param {object} msg
 * @param {string} requestId
 */
function emitIfActive(msg, requestId) {
  if (!tracker.isActive(requestId)) return;
  if (msg.requestId !== requestId) return;
  chrome.runtime.sendMessage(msg).catch(() => {
    // Popup may be closed.
  });
}

/**
 * @param {{ requestId: string, query: string, platforms: string[] }} request
 */
async function runSearch(request) {
  const { requestId, query } = request;
  const platforms = (request.platforms?.length ? request.platforms : PLATFORM_ORDER).filter(
    (id) => id === 'chatgpt',
  );

  tracker.begin(requestId);

  const wallTimer = setTimeout(() => {
    if (tracker.isActive(requestId)) {
      tracker.cancel(requestId);
    }
  }, OVERALL_WALL_MS);

  try {
    for (const platformId of platforms) {
      if (!tracker.isActive(requestId)) break;

      emitIfActive(
        createResultChunk({
          requestId,
          platform: platformId,
          status: 'loading',
          capability: PLATFORMS[platformId]?.capability,
        }),
        requestId,
      );

      let terminalStatus = 'unavailable';

      try {
        const tabId = await ensureChatgptTab();
        if (!tracker.isActive(requestId)) break;

        const result = await withTimeout(
          sendChatgptSearch(tabId, { requestId, query }),
          PLATFORM_TIMEOUT_MS,
          'chatgpt search',
        );

        if (!tracker.isActive(requestId)) break;

        terminalStatus = result?.status ?? 'unavailable';
        emitIfActive(
          createResultChunk({
            requestId,
            platform: platformId,
            status: terminalStatus,
            capability: result?.capability ?? PLATFORMS.chatgpt.capability,
            results: result?.results ?? [],
            errorCode: result?.errorCode,
            message: result?.message,
            loginUrl: result?.loginUrl ?? PLATFORMS.chatgpt.loginUrl,
          }),
          requestId,
        );
      } catch (err) {
        if (!tracker.isActive(requestId)) break;
        const isTimeout = err && /** @type {{ code?: string }} */ (err).code === 'timeout';
        terminalStatus = isTimeout ? 'timeout' : 'unavailable';
        emitIfActive(
          createResultChunk({
            requestId,
            platform: platformId,
            status: terminalStatus,
            capability: PLATFORMS.chatgpt.capability,
            results: [],
            errorCode: isTimeout ? 'timeout' : 'adapter_error',
            message: 'ChatGPT is temporarily unavailable.',
            loginUrl: PLATFORMS.chatgpt.loginUrl,
          }),
          requestId,
        );
      }

      emitIfActive(
        createPlatformDone({ requestId, platform: platformId, status: terminalStatus }),
        requestId,
      );
    }
  } finally {
    clearTimeout(wallTimer);
    if (tracker.getActiveId() === requestId) {
      tracker.cancel(requestId);
    }
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') return false;

  if (message.type === MSG.SEARCH_CANCEL) {
    tracker.cancel(message.requestId);
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === MSG.SEARCH_REQUEST) {
    const query = normalizeQuery(message.query);
    if (!query) {
      sendResponse({ ok: false, error: 'empty_query' });
      return false;
    }

    const requestId = message.requestId;
    const prior = tracker.getActiveId();
    if (prior && prior !== requestId) {
      tracker.cancel(prior);
    }

    void runSearch({
      requestId,
      query,
      platforms: message.platforms ?? PLATFORM_ORDER,
    });

    sendResponse({ ok: true, requestId });
    return false;
  }

  return false;
});
