import { MSG, createResultChunk, createPlatformDone, normalizeQuery } from '../lib/messaging.js';
import { PLATFORMS, PLATFORM_ORDER, unavailableCopy } from '../lib/platforms.js';
import {
  PLATFORM_TIMEOUT_MS,
  OVERALL_WALL_MS,
  TAB_COMPLETE_MS,
  createRequestTracker,
  withTimeout,
} from '../lib/timeouts.js';
import { pendingTerminalPlatforms, resolveWallExpiry } from '../lib/orchestration.js';

const tracker = createRequestTracker();

/** @type {Map<string, { platforms: string[], completed: Set<string>, tabId: number|null }>} */
const searchState = new Map();

/**
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Find an existing ChatGPT tab or open one in the background.
 * @param {number} tabCompleteMs
 * @returns {Promise<number>} tab id
 */
async function ensureChatgptTab(tabCompleteMs = TAB_COMPLETE_MS) {
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

  await waitForTabComplete(tab.id, tabCompleteMs);
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
 * Abort in-flight content-script fetches for a requestId.
 * @param {string} requestId
 * @param {number|null|undefined} tabId
 */
async function abortContentSearch(requestId, tabId) {
  if (tabId == null) return;
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: MSG.CHATGPT_SEARCH_CANCEL,
      requestId,
    });
  } catch {
    // Tab or content script may be gone.
  }
}

/**
 * Message the classic content script; retry briefly if it is not ready yet.
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
 * Emit to popup without requiring tracker active (used for wall terminal chunks).
 * @param {object} msg
 */
function emit(msg) {
  chrome.runtime.sendMessage(msg).catch(() => {
    // Popup may be closed.
  });
}

/**
 * @param {object} msg
 * @param {string} requestId
 */
function emitIfActive(msg, requestId) {
  if (!tracker.isActive(requestId)) return;
  if (msg.requestId !== requestId) return;
  emit(msg);
}

/**
 * Wall expiry: emit timeout for non-terminal platforms, then clear active id.
 * Superseded requests stay silent.
 * @param {string} wallRequestId
 */
async function onWallExpiry(wallRequestId) {
  const state = searchState.get(wallRequestId);
  const platforms = state?.platforms ?? ['chatgpt'];
  const completed = state?.completed ?? new Set();
  const pending = pendingTerminalPlatforms(platforms, completed);

  const decision = resolveWallExpiry({
    activeRequestId: tracker.getActiveId(),
    wallRequestId,
    platformsPendingTerminal: pending,
  });

  if (decision.kind === 'superseded') return;

  // Emit terminal chunks while still active, then clear active id before
  // awaiting abort so late content-script replies cannot overwrite timeout.
  for (const platformId of decision.platforms) {
    emit(
      createResultChunk({
        requestId: wallRequestId,
        platform: platformId,
        status: 'timeout',
        capability: PLATFORMS[platformId]?.capability,
        results: [],
        errorCode: 'wall_timeout',
        message: unavailableCopy(platformId),
        loginUrl: PLATFORMS[platformId]?.loginUrl,
      }),
    );
    emit(
      createPlatformDone({
        requestId: wallRequestId,
        platform: platformId,
        status: 'timeout',
      }),
    );
    state?.completed.add(platformId);
  }

  tracker.cancel(wallRequestId);
  await abortContentSearch(wallRequestId, state?.tabId ?? null);
}

/**
 * @param {string} requestId
 */
async function cancelSearch(requestId) {
  const state = searchState.get(requestId);
  await abortContentSearch(requestId, state?.tabId ?? null);
  tracker.cancel(requestId);
  searchState.delete(requestId);
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
  const state = {
    platforms,
    completed: new Set(),
    tabId: /** @type {number|null} */ (null),
  };
  searchState.set(requestId, state);

  const wallTimer = setTimeout(() => {
    void onWallExpiry(requestId);
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
        // Entire platform attempt (tab prep + search) under one 8s budget.
        const result = await withTimeout(
          (async () => {
            const tabId = await ensureChatgptTab(TAB_COMPLETE_MS);
            if (searchState.get(requestId)) {
              searchState.get(requestId).tabId = tabId;
            }
            if (!tracker.isActive(requestId)) {
              const err = new Error('aborted');
              err.name = 'AbortError';
              throw err;
            }
            return sendChatgptSearch(tabId, { requestId, query });
          })(),
          PLATFORM_TIMEOUT_MS,
          'chatgpt platform',
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
        const isAbort = err && /** @type {{ name?: string }} */ (err).name === 'AbortError';
        if (isAbort) break;
        terminalStatus = isTimeout ? 'timeout' : 'unavailable';
        emitIfActive(
          createResultChunk({
            requestId,
            platform: platformId,
            status: terminalStatus,
            capability: PLATFORMS.chatgpt.capability,
            results: [],
            errorCode: isTimeout ? 'timeout' : 'adapter_error',
            message: unavailableCopy('chatgpt'),
            loginUrl: PLATFORMS.chatgpt.loginUrl,
          }),
          requestId,
        );
      }

      if (tracker.isActive(requestId)) {
        state.completed.add(platformId);
        emitIfActive(
          createPlatformDone({ requestId, platform: platformId, status: terminalStatus }),
          requestId,
        );
      }
    }
  } finally {
    clearTimeout(wallTimer);
    if (tracker.getActiveId() === requestId) {
      tracker.cancel(requestId);
    }
    searchState.delete(requestId);
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') return false;

  if (message.type === MSG.SEARCH_CANCEL) {
    void cancelSearch(message.requestId).then(() => sendResponse({ ok: true }));
    return true;
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
      void cancelSearch(prior);
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
