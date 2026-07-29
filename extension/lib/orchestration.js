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
