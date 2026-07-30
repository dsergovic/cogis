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

/**
 * Only close lab tabs Cogis opened for search — never user-owned tabs.
 * @param {{ createdByUs: boolean, tabId: number|null|undefined }} input
 */
export function shouldCloseSearchTab(input) {
  return Boolean(input.createdByUs && input.tabId != null);
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
