/**
 * Pure helpers for search orchestration (wall expiry, cancel reasons).
 * Kept chrome-free so unit tests can cover the blocker paths.
 */

/**
 * Decide what to do when the overall wall timer fires.
 * Superseded requests stay silent; wall expiry must emit terminal timeouts.
 *
 * @param {{
 *   activeRequestId: string|null,
 *   wallRequestId: string,
 *   platformsPendingTerminal: string[],
 * }} input
 * @returns {{ kind: 'superseded' } | { kind: 'wall_timeout', platforms: string[] }}
 */
export function resolveWallExpiry(input) {
  if (input.activeRequestId !== input.wallRequestId) {
    return { kind: 'superseded' };
  }
  return {
    kind: 'wall_timeout',
    platforms: [...input.platformsPendingTerminal],
  };
}

/**
 * Platforms that still need a terminal chunk.
 * @param {string[]} platforms
 * @param {Iterable<string>} completed
 */
export function pendingTerminalPlatforms(platforms, completed) {
  const done = new Set(completed);
  return platforms.filter((id) => !done.has(id));
}

/**
 * Whether a popup group stuck in loading should be force-timed-out by the watchdog.
 * @param {{ activeRequestId: string|null, watchdogRequestId: string, status: string }} input
 */
export function shouldWatchdogTimeout(input) {
  return (
    input.activeRequestId === input.watchdogRequestId &&
    (input.status === 'loading' || input.status === 'idle')
  );
}

/** Max `tabs.create` calls allowed inside one `ensurePlatformTab` (BL-001). */
export const MAX_ENSURE_TAB_CREATES = 1;

/**
 * @param {Iterable<number>|Set<number>|null|undefined} protectedTabIds
 * @returns {Set<number>}
 */
function asProtectedSet(protectedTabIds) {
  if (!protectedTabIds) return new Set();
  return protectedTabIds instanceof Set ? protectedTabIds : new Set(protectedTabIds);
}

/**
 * Only close lab tabs Cogis opened for search — never user-owned tabs.
 * When a newer request is alive, still close **orphan** created tabs; skip only
 * tabIds the newer request has already recorded in its `state.tabs` (BL-001).
 *
 * @param {{
 *   createdByUs: boolean,
 *   tabId: number|null|undefined,
 *   protectedTabIds?: Iterable<number>|Set<number>|null,
 * }} input
 */
export function shouldCloseSearchTab(input) {
  if (!input.createdByUs || input.tabId == null) return false;
  if (asProtectedSet(input.protectedTabIds).has(input.tabId)) return false;
  return true;
}

/**
 * Whether ensurePlatformTab may call tabs.create (bounded — BL-001).
 * @param {number} createCount
 */
export function canCreateLabTab(createCount) {
  return createCount < MAX_ENSURE_TAB_CREATES;
}

/**
 * After ensurePlatformTab returns: keep for an active request, or discard a
 * Cogis-created tab when the request was superseded mid-ensure (BL-001 litter).
 * Never closes user-owned tabs, and never closes a tabId already claimed by a
 * newer search's `state.tabs`.
 *
 * @param {{
 *   requestStillActive: boolean,
 *   createdByUs: boolean,
 *   tabId: number|null|undefined,
 *   protectedTabIds?: Iterable<number>|Set<number>|null,
 * }} input
 * @returns {{ keep: boolean, close: boolean }}
 */
export function resolveEnsuredTabOwnership(input) {
  if (input.requestStillActive) {
    return { keep: true, close: false };
  }
  if (input.createdByUs && input.tabId != null) {
    if (asProtectedSet(input.protectedTabIds).has(input.tabId)) {
      return { keep: false, close: false };
    }
    return { keep: false, close: true };
  }
  return { keep: false, close: false };
}

/**
 * Tab ids a finishing request may close under BL-001 rules.
 * @param {Iterable<{ created: boolean, tabId: number|null|undefined }>} tabs
 * @param {{ protectedTabIds?: Iterable<number>|Set<number>|null }} [ctx]
 * @returns {number[]}
 */
export function tabIdsSafeToClose(tabs, ctx = {}) {
  const ids = [];
  for (const tab of tabs) {
    if (
      shouldCloseSearchTab({
        createdByUs: tab.created,
        tabId: tab.tabId,
        protectedTabIds: ctx.protectedTabIds,
      })
    ) {
      ids.push(/** @type {number} */ (tab.tabId));
    }
  }
  return ids;
}

/**
 * TabIds recorded on every search except `exceptRequestId` — do not close these.
 * @param {Iterable<[string, { tabs?: Map<string, { tabId: number|null|undefined }> }]>} searchStateEntries
 * @param {string|null|undefined} exceptRequestId
 * @returns {Set<number>}
 */
export function collectProtectedTabIds(searchStateEntries, exceptRequestId) {
  /** @type {Set<number>} */
  const protectedIds = new Set();
  for (const [requestId, state] of searchStateEntries) {
    if (exceptRequestId != null && requestId === exceptRequestId) continue;
    if (!state?.tabs) continue;
    for (const tab of state.tabs.values()) {
      if (tab?.tabId != null) protectedIds.add(tab.tabId);
    }
  }
  return protectedIds;
}

/**
 * Request ids that must be cancelled when `incomingId` supersedes — based on
 * `searchState` keys and optional tracker active id (popup CANCEL may already
 * have nulled activeId; state keys still identify in-flight work).
 *
 * @param {{
 *   searchStateKeys: Iterable<string>,
 *   activeRequestId?: string|null,
 *   incomingRequestId: string,
 * }} input
 * @returns {string[]}
 */
export function requestIdsToCancelOnSupersede(input) {
  const ids = new Set();
  for (const id of input.searchStateKeys) {
    if (id && id !== input.incomingRequestId) ids.add(id);
  }
  if (input.activeRequestId && input.activeRequestId !== input.incomingRequestId) {
    ids.add(input.activeRequestId);
  }
  return [...ids];
}

/**
 * @param {number} myEpoch
 * @param {number} currentEpoch
 */
export function isSearchEpochCurrent(myEpoch, currentEpoch) {
  return myEpoch === currentEpoch;
}

/**
 * Whether an existing lab tab must be reloaded before adoption (SC-8).
 * Discarded / frozen / unloaded tabs are not ready for content-script messaging.
 * @param {{ discarded?: boolean, status?: string|null }|null|undefined} tab
 */
export function shouldReloadLabTab(tab) {
  if (!tab) return false;
  if (tab.discarded === true) return true;
  if (tab.status === 'unloaded') return true;
  return false;
}

/**
 * Prefer a non-discarded tab when adopting an existing lab session (SC-7/SC-8).
 * @param {Array<{ id?: number|null, discarded?: boolean, status?: string|null }>} tabs
 * @returns {{ id: number, discarded?: boolean, status?: string|null }|null}
 */
export function pickLabTabCandidate(tabs) {
  if (!Array.isArray(tabs) || tabs.length === 0) return null;
  const withId = tabs.filter((t) => t && t.id != null);
  if (withId.length === 0) return null;
  const ready = withId.find((t) => !shouldReloadLabTab(t));
  return /** @type {{ id: number, discarded?: boolean, status?: string|null }} */ (
    ready ?? withId[0]
  );
}
