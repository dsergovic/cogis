import { MSG, createResultChunk, createPlatformDone, normalizeQuery } from '../lib/messaging.js';
import { PLATFORMS, PLATFORM_ORDER, unavailableCopy } from '../lib/platforms.js';
import {
  PLATFORM_TIMEOUT_MS,
  OVERALL_WALL_MS,
  TAB_COMPLETE_MS,
  createRequestTracker,
  withTimeout,
} from '../lib/timeouts.js';
import {
  pendingTerminalPlatforms,
  pickLabTabCandidate,
  resolveWallExpiry,
  shouldCloseSearchTab,
  shouldReloadLabTab,
} from '../lib/orchestration.js';
import { getSelectorPackStatus, refreshSelectorPack } from '../lib/selectors/loader.js';

const tracker = createRequestTracker();

/**
 * Best-effort remote pack refresh. Failures stay on the local pack and never block search.
 */
function kickSelectorPackRefresh() {
  void refreshSelectorPack().then(() => {
    const status = getSelectorPackStatus();
    if (status.lastRefreshOk === false) {
      console.info('[cogis] selector pack refresh failed closed to local', {
        errorCode: status.lastErrorCode,
        activeVersion: status.activeVersion,
      });
    } else if (status.source === 'merged') {
      console.info('[cogis] selector pack merged', {
        activeVersion: status.activeVersion,
        localVersion: status.localVersion,
      });
    }
  });
}

kickSelectorPackRefresh();
chrome.runtime.onInstalled.addListener(() => {
  kickSelectorPackRefresh();
});
chrome.runtime.onStartup.addListener(() => {
  kickSelectorPackRefresh();
});

const IMPLEMENTED = new Set(PLATFORM_ORDER);

const PLATFORM_SEARCH_MSG = {
  chatgpt: MSG.CHATGPT_SEARCH,
  perplexity: MSG.PERPLEXITY_SEARCH,
  claude: MSG.CLAUDE_SEARCH,
  gemini: MSG.GEMINI_SEARCH,
};

const PLATFORM_CANCEL_MSG = {
  chatgpt: MSG.CHATGPT_SEARCH_CANCEL,
  perplexity: MSG.PERPLEXITY_SEARCH_CANCEL,
  claude: MSG.CLAUDE_SEARCH_CANCEL,
  gemini: MSG.GEMINI_SEARCH_CANCEL,
};

/**
 * @typedef {{ tabId: number|null, created: boolean }} PlatformTab
 */

/**
 * @typedef {{
 *   platforms: string[],
 *   completed: Set<string>,
 *   tabs: Map<string, PlatformTab>,
 * }} SearchState
 */

/** @type {Map<string, SearchState>} */
const searchState = new Map();

/**
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Prove the classic content script is reachable before adopting a tab (SC-7).
 * @param {number} tabId
 * @returns {Promise<boolean>}
 */
async function pingContentScript(tabId) {
  try {
    const res = await chrome.tabs.sendMessage(tabId, { type: MSG.COGIS_PING });
    return Boolean(res && res.ok);
  } catch {
    return false;
  }
}

/**
 * Reload a discarded/unloaded lab tab and wait for complete (SC-8).
 * @param {number} tabId
 * @param {number} tabCompleteMs
 */
async function reloadLabTab(tabId, tabCompleteMs) {
  await chrome.tabs.reload(tabId);
  await waitForTabComplete(tabId, tabCompleteMs);
  // Content scripts inject at document_idle; brief settle before ping.
  await sleep(250);
}

/**
 * Find an existing lab tab (only after content-script reachability) or open one.
 * Discarded / frozen tabs are reloaded, never treated as ready (SC-7/SC-8).
 * @param {string} platformId
 * @param {number} tabCompleteMs
 * @returns {Promise<{ tabId: number, created: boolean }>}
 */
async function ensurePlatformTab(platformId, tabCompleteMs = TAB_COMPLETE_MS) {
  const platform = PLATFORMS[platformId];
  if (!platform) throw new Error(`Unknown platform ${platformId}`);

  const existing = await chrome.tabs.query({ url: platform.hostPatterns });
  const candidate = pickLabTabCandidate(existing);
  if (candidate?.id != null) {
    let tabId = candidate.id;
    if (shouldReloadLabTab(candidate)) {
      await reloadLabTab(tabId, tabCompleteMs);
    }
    if (await pingContentScript(tabId)) {
      return { tabId, created: false };
    }
    // Tab predates extension load or CS never matched — reload once to inject.
    await reloadLabTab(tabId, tabCompleteMs);
    if (await pingContentScript(tabId)) {
      return { tabId, created: false };
    }
  }

  const homeUrl = platformId === 'gemini' ? `${platform.origin}/app` : `${platform.origin}/`;
  const tab = await chrome.tabs.create({
    url: homeUrl,
    active: false,
  });
  if (tab.id == null) {
    throw new Error(`Failed to open ${platform.label} tab`);
  }

  await waitForTabComplete(tab.id, tabCompleteMs);
  await sleep(250);
  return { tabId: tab.id, created: true };
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
 * Close background tabs Cogis opened for this search.
 * @param {SearchState|undefined} state
 */
async function maybeCloseCreatedTabs(state) {
  if (!state?.tabs) return;
  for (const tab of state.tabs.values()) {
    if (!shouldCloseSearchTab({ createdByUs: tab.created, tabId: tab.tabId })) continue;
    try {
      await chrome.tabs.remove(/** @type {number} */ (tab.tabId));
    } catch {
      // Tab may already be closed.
    }
  }
}

/**
 * Abort in-flight content-script fetches for a requestId / platform.
 * @param {string} requestId
 * @param {string} platformId
 * @param {number|null|undefined} tabId
 */
async function abortContentSearch(requestId, platformId, tabId) {
  if (tabId == null) return;
  const type = PLATFORM_CANCEL_MSG[platformId];
  if (!type) return;
  try {
    await chrome.tabs.sendMessage(tabId, { type, requestId });
  } catch {
    // Tab or content script may be gone.
  }
}

/**
 * @param {string} requestId
 * @param {SearchState|undefined} state
 */
async function abortAllContentSearches(requestId, state) {
  if (!state?.tabs) return;
  for (const [platformId, tab] of state.tabs.entries()) {
    await abortContentSearch(requestId, platformId, tab.tabId);
  }
}

/**
 * Message the classic content script; retry briefly if it is not ready yet.
 * @param {string} platformId
 * @param {number} tabId
 * @param {{ requestId: string, query: string, platformBudgetMs?: number }} payload
 */
async function sendPlatformSearch(platformId, tabId, payload) {
  const type = PLATFORM_SEARCH_MSG[platformId];
  if (!type) throw new Error(`No search message for ${platformId}`);

  const message = {
    type,
    requestId: payload.requestId,
    query: payload.query,
    platformBudgetMs: payload.platformBudgetMs,
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
  throw lastErr ?? new Error(`${platformId} content script unreachable`);
}

/**
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
 * @param {string} wallRequestId
 */
async function onWallExpiry(wallRequestId) {
  const state = searchState.get(wallRequestId);
  const platforms = state?.platforms ?? [...PLATFORM_ORDER];
  const completed = state?.completed ?? new Set();
  const pending = pendingTerminalPlatforms(platforms, completed);

  const decision = resolveWallExpiry({
    activeRequestId: tracker.getActiveId(),
    wallRequestId,
    platformsPendingTerminal: pending,
  });

  if (decision.kind === 'superseded') return;

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
  await abortAllContentSearches(wallRequestId, state);
  await maybeCloseCreatedTabs(state);
  searchState.delete(wallRequestId);
}

/**
 * @param {string} requestId
 */
async function cancelSearch(requestId) {
  const state = searchState.get(requestId);
  await abortAllContentSearches(requestId, state);
  tracker.cancel(requestId);
  await maybeCloseCreatedTabs(state);
  searchState.delete(requestId);
}

/**
 * Run one platform adapter under the 8s budget.
 * @param {string} requestId
 * @param {string} query
 * @param {string} platformId
 * @param {SearchState} state
 */
async function runPlatform(requestId, query, platformId, state) {
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
    const platformStarted = Date.now();
    const result = await withTimeout(
      (async () => {
        const ensured = await ensurePlatformTab(platformId, TAB_COMPLETE_MS);
        const current = searchState.get(requestId);
        if (current) {
          current.tabs.set(platformId, { tabId: ensured.tabId, created: ensured.created });
        }
        if (!tracker.isActive(requestId)) {
          const err = new Error('aborted');
          err.name = 'AbortError';
          throw err;
        }
        // Remaining wall inside the 8s platform budget after tab ensure (I-5).
        const spent = Date.now() - platformStarted;
        const platformBudgetMs = Math.max(400, PLATFORM_TIMEOUT_MS - spent);
        return sendPlatformSearch(platformId, ensured.tabId, {
          requestId,
          query,
          platformBudgetMs,
        });
      })(),
      PLATFORM_TIMEOUT_MS,
      `${platformId} platform`,
    );

    if (!tracker.isActive(requestId)) return;

    terminalStatus = result?.status ?? 'unavailable';
    emitIfActive(
      createResultChunk({
        requestId,
        platform: platformId,
        status: terminalStatus,
        capability: result?.capability ?? PLATFORMS[platformId]?.capability,
        results: result?.results ?? [],
        errorCode: result?.errorCode,
        message: result?.message,
        loginUrl: result?.loginUrl ?? PLATFORMS[platformId]?.loginUrl,
      }),
      requestId,
    );
  } catch (err) {
    if (!tracker.isActive(requestId)) return;
    const isTimeout = err && /** @type {{ code?: string }} */ (err).code === 'timeout';
    const isAbort = err && /** @type {{ name?: string }} */ (err).name === 'AbortError';
    if (isAbort) return;
    if (isTimeout) {
      const tab = state.tabs.get(platformId);
      await abortContentSearch(requestId, platformId, tab?.tabId ?? null);
    }
    terminalStatus = isTimeout ? 'timeout' : 'unavailable';
    emitIfActive(
      createResultChunk({
        requestId,
        platform: platformId,
        status: terminalStatus,
        capability: PLATFORMS[platformId]?.capability,
        results: [],
        errorCode: isTimeout ? 'timeout' : 'adapter_error',
        message: unavailableCopy(platformId),
        loginUrl: PLATFORMS[platformId]?.loginUrl,
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

/**
 * @param {{ requestId: string, query: string, platforms: string[] }} request
 */
async function runSearch(request) {
  const { requestId, query } = request;
  const platforms = (request.platforms?.length ? request.platforms : PLATFORM_ORDER).filter((id) =>
    IMPLEMENTED.has(id),
  );

  tracker.begin(requestId);
  /** @type {SearchState} */
  const state = {
    platforms,
    completed: new Set(),
    tabs: new Map(),
  };
  searchState.set(requestId, state);

  const wallTimer = setTimeout(() => {
    void onWallExpiry(requestId);
  }, OVERALL_WALL_MS);

  try {
    // Fan-out platforms in parallel; each has its own 8s budget; wall cancels stragglers.
    await Promise.all(
      platforms.map((platformId) => runPlatform(requestId, query, platformId, state)),
    );
  } finally {
    clearTimeout(wallTimer);
    if (tracker.getActiveId() === requestId) {
      tracker.cancel(requestId);
    }
    await maybeCloseCreatedTabs(searchState.get(requestId));
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
