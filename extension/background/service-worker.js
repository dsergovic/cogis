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
  canCreateLabTab,
  collectProtectedTabIds,
  isSearchEpochCurrent,
  pendingTerminalPlatforms,
  pickLabTabCandidate,
  requestIdsToCancelOnSupersede,
  resolveEnsuredTabOwnership,
  resolveWallExpiry,
  shouldReloadLabTab,
  tabIdsSafeToClose,
} from '../lib/orchestration.js';
import { getSelectorPackStatus, refreshSelectorPack } from '../lib/selectors/loader.js';
import { getDebugStatsSnapshot, getPlatformStat, recordPlatformStat } from '../lib/debug-stats.js';
import { loadDebugPrefs, savePingOptIn } from '../lib/debug-prefs.js';
import { buildPingPayload, maybeSendAnonymousPing, PING_ENDPOINT_URL } from '../lib/ping.js';

const tracker = createRequestTracker();

/**
 * Monotonic epoch for SEARCH_REQUEST acceptance (BL-001 / B3).
 * Cancel does not bump this — only a newer SEARCH_REQUEST does — so an older
 * async run cannot reclaim fan-out after A→B→C.
 */
let searchEpoch = 0;

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
 * At most one `tabs.create` per call (BL-001 bound — no create storm on ping-fail).
 * @param {string} platformId
 * @param {number} tabCompleteMs
 * @returns {Promise<{ tabId: number, created: boolean }>}
 */
async function ensurePlatformTab(platformId, tabCompleteMs = TAB_COMPLETE_MS) {
  const platform = PLATFORMS[platformId];
  if (!platform) throw new Error(`Unknown platform ${platformId}`);

  let createCount = 0;
  const existing = await chrome.tabs.query({ url: platform.hostPatterns });
  const candidate = pickLabTabCandidate(existing);
  if (candidate?.id != null) {
    const tabId = candidate.id;
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

  if (!canCreateLabTab(createCount)) {
    throw new Error(`${platform.label} tab unreachable (create bound)`);
  }
  createCount += 1;

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
  // Single create only — do not open another tab if ping is still cold.
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
 * TabIds claimed by every live search except `exceptRequestId`.
 * @param {string|null|undefined} exceptRequestId
 */
function protectedTabIdsExcept(exceptRequestId) {
  return collectProtectedTabIds(searchState.entries(), exceptRequestId);
}

/**
 * Close Cogis-created tabs for a finishing search.
 * Closes orphans even when a newer request is active; never closes user-owned
 * tabs or tabIds already recorded on another live search (BL-001).
 * @param {SearchState|undefined} state
 * @param {string} [closingRequestId]
 */
async function maybeCloseCreatedTabs(state, closingRequestId) {
  if (!state?.tabs) return;
  const protectedTabIds = protectedTabIdsExcept(closingRequestId ?? null);
  const toClose = tabIdsSafeToClose(state.tabs.values(), { protectedTabIds });
  for (const tabId of toClose) {
    try {
      await chrome.tabs.remove(tabId);
    } catch {
      // Tab may already be closed.
    }
  }
}

/**
 * Close a Cogis-created tab that a superseded ensure left behind (BL-001).
 * Skips if a newer search already claimed the tabId.
 * @param {{ tabId: number, created: boolean }} ensured
 * @param {string} ensuringRequestId
 */
async function discardSupersededCreatedTab(ensured, ensuringRequestId) {
  if (!ensured?.created || ensured.tabId == null) return;
  const protectedTabIds = protectedTabIdsExcept(ensuringRequestId);
  const ownership = resolveEnsuredTabOwnership({
    requestStillActive: false,
    createdByUs: true,
    tabId: ensured.tabId,
    protectedTabIds,
  });
  if (!ownership.close) return;
  try {
    await chrome.tabs.remove(ensured.tabId);
  } catch {
    // Already gone.
  }
}

/**
 * Cancel every in-flight search except `keepRequestId`.
 * Uses searchState keys so popup CANCEL→REQUEST (activeId already null) still
 * finds and cleans prior work (BL-001 / B1).
 * @param {string} keepRequestId
 */
async function cancelOtherSearches(keepRequestId) {
  const ids = requestIdsToCancelOnSupersede({
    searchStateKeys: searchState.keys(),
    activeRequestId: tracker.getActiveId(),
    incomingRequestId: keepRequestId,
  });
  for (const id of ids) {
    await cancelSearch(id);
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
 * @param {{
 *   platformId: string,
 *   latencyMs: number,
 *   hitCount: number,
 *   status: string,
 *   errorCode?: string,
 * }} input
 */
function notePlatformTerminal(input) {
  recordPlatformStat({
    platformId: input.platformId,
    latencyMs: input.latencyMs,
    hitCount: input.hitCount,
    status: input.status,
    errorCode: input.errorCode ?? null,
  });
}

/**
 * Extension version from the installed manifest (optional ping field).
 * @returns {string|undefined}
 */
function extensionVersion() {
  try {
    return chrome.runtime.getManifest()?.version;
  } catch {
    return undefined;
  }
}

/**
 * Build the debug panel snapshot (stats + pack + prefs). No query text.
 */
async function buildDebugSnapshot() {
  const prefs = await loadDebugPrefs();
  const pack = getSelectorPackStatus();
  return {
    ok: true,
    prefs,
    pingEndpointConfigured: Boolean(PING_ENDPOINT_URL),
    selectorPack: {
      localVersion: pack.localVersion,
      activeVersion: pack.activeVersion,
      source: pack.source,
      lastRefreshOk: pack.lastRefreshOk,
      lastErrorCode: pack.lastErrorCode,
    },
    ...getDebugStatsSnapshot(),
    extensionVersion: extensionVersion() ?? null,
  };
}

/**
 * Opt-in anonymous ping for one platform's last error class. Default-off / no URL ⇒ no network.
 * @param {string} platformId
 */
async function sendDebugPing(platformId) {
  const prefs = await loadDebugPrefs();
  const stat = getPlatformStat(platformId);
  const errorClass = stat.errorCode || stat.status;
  if (!errorClass) {
    return { ok: false, sent: false, reason: 'no_error_class' };
  }
  const pack = getSelectorPackStatus();
  const payload = buildPingPayload({
    platformId,
    selectorPackVersion: pack.activeVersion || pack.localVersion || 'unknown',
    errorClass,
    extensionVersion: extensionVersion(),
  });
  const result = await maybeSendAnonymousPing({
    optIn: prefs.pingOptIn,
    endpointUrl: PING_ENDPOINT_URL,
    payload,
  });
  return { ok: true, ...result, payload };
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
    notePlatformTerminal({
      platformId,
      latencyMs: OVERALL_WALL_MS,
      hitCount: 0,
      status: 'timeout',
      errorCode: 'wall_timeout',
    });
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
  await maybeCloseCreatedTabs(state, wallRequestId);
  searchState.delete(wallRequestId);
}

/**
 * @param {string} requestId
 */
async function cancelSearch(requestId) {
  const state = searchState.get(requestId);
  // Clear active id first so in-flight ensurePlatformTab sees superseded promptly.
  tracker.cancel(requestId);
  await abortAllContentSearches(requestId, state);
  await maybeCloseCreatedTabs(state, requestId);
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
  const platformStarted = Date.now();

  try {
    const result = await withTimeout(
      (async () => {
        const ensured = await ensurePlatformTab(platformId, TAB_COMPLETE_MS);
        const ownership = resolveEnsuredTabOwnership({
          requestStillActive: tracker.isActive(requestId),
          createdByUs: ensured.created,
          tabId: ensured.tabId,
          protectedTabIds: protectedTabIdsExcept(requestId),
        });
        if (!ownership.keep) {
          if (ownership.close) {
            await discardSupersededCreatedTab(ensured, requestId);
          }
          const err = new Error('aborted');
          err.name = 'AbortError';
          throw err;
        }
        const current = searchState.get(requestId);
        if (current) {
          current.tabs.set(platformId, { tabId: ensured.tabId, created: ensured.created });
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
    const results = result?.results ?? [];
    notePlatformTerminal({
      platformId,
      latencyMs: Date.now() - platformStarted,
      hitCount: Array.isArray(results) ? results.length : 0,
      status: terminalStatus,
      errorCode: result?.errorCode,
    });
    emitIfActive(
      createResultChunk({
        requestId,
        platform: platformId,
        status: terminalStatus,
        capability: result?.capability ?? PLATFORMS[platformId]?.capability,
        results,
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
    const errorCode = isTimeout ? 'timeout' : 'adapter_error';
    notePlatformTerminal({
      platformId,
      latencyMs: Date.now() - platformStarted,
      hitCount: 0,
      status: terminalStatus,
      errorCode,
    });
    emitIfActive(
      createResultChunk({
        requestId,
        platform: platformId,
        status: terminalStatus,
        capability: PLATFORMS[platformId]?.capability,
        results: [],
        errorCode,
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
 * @param {{ requestId: string, query: string, platforms: string[], epoch: number }} request
 */
async function runSearch(request) {
  const { requestId, query, epoch } = request;
  // Stale after await cancelOthers / A→B→C — do not reclaim activeId (B3).
  if (!isSearchEpochCurrent(epoch, searchEpoch)) return;

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
    if (!isSearchEpochCurrent(epoch, searchEpoch)) return;
    // Fan-out platforms in parallel; each has its own 8s budget; wall cancels stragglers.
    await Promise.all(
      platforms.map((platformId) => runPlatform(requestId, query, platformId, state)),
    );
  } finally {
    clearTimeout(wallTimer);
    if (tracker.getActiveId() === requestId) {
      tracker.cancel(requestId);
    }
    await maybeCloseCreatedTabs(searchState.get(requestId), requestId);
    searchState.delete(requestId);
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') return false;

  if (message.type === MSG.SEARCH_CANCEL) {
    void cancelSearch(message.requestId).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === MSG.DEBUG_GET_SNAPSHOT) {
    void buildDebugSnapshot().then(sendResponse);
    return true;
  }

  if (message.type === MSG.DEBUG_SET_PING_OPT_IN) {
    void savePingOptIn(message.pingOptIn === true)
      .then((prefs) => sendResponse({ ok: true, prefs }))
      .catch((err) => sendResponse({ ok: false, error: String(err?.message ?? err) }));
    return true;
  }

  if (message.type === MSG.DEBUG_SEND_PING) {
    void sendDebugPing(message.platformId)
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, sent: false, error: String(err?.message ?? err) }));
    return true;
  }

  if (message.type === MSG.SEARCH_REQUEST) {
    const query = normalizeQuery(message.query);
    if (!query) {
      sendResponse({ ok: false, error: 'empty_query' });
      return false;
    }

    const requestId = message.requestId;
    // Epoch + cancel-by-searchState (not activeId): popup CANCEL nulls the
    // tracker before REQUEST arrives, so getActiveId()-only supersede is a no-op (B1).
    const epoch = (searchEpoch += 1);
    void (async () => {
      await cancelOtherSearches(requestId);
      if (!isSearchEpochCurrent(epoch, searchEpoch)) return;
      await runSearch({
        requestId,
        query,
        platforms: message.platforms ?? PLATFORM_ORDER,
        epoch,
      });
    })();

    sendResponse({ ok: true, requestId });
    return false;
  }

  return false;
});
