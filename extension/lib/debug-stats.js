import { PLATFORM_ORDER } from './platforms.js';

/**
 * @typedef {object} PlatformDebugStat
 * @property {number|null} latencyMs
 * @property {number|null} hitCount
 * @property {string|null} status
 * @property {string|null} errorCode
 * @property {number|null} updatedAt
 */

/**
 * In-memory last-search diagnostics for the M6 debug panel.
 * Never stores query text, titles, message bodies, or cookies.
 * @type {Map<string, PlatformDebugStat>}
 */
const platformStats = new Map();

/**
 * @returns {PlatformDebugStat}
 */
function emptyStat() {
  return {
    latencyMs: null,
    hitCount: null,
    status: null,
    errorCode: null,
    updatedAt: null,
  };
}

/**
 * @param {string} platformId
 * @returns {PlatformDebugStat}
 */
export function getPlatformStat(platformId) {
  return { ...(platformStats.get(platformId) ?? emptyStat()) };
}

/**
 * Record a terminal (non-loading) platform outcome.
 * Unknown keys such as `query` / `results` / `body` are ignored.
 *
 * @param {{
 *   platformId: string,
 *   latencyMs?: number|null,
 *   hitCount?: number|null,
 *   status?: string|null,
 *   errorCode?: string|null,
 *   updatedAt?: number,
 * }} input
 * @returns {PlatformDebugStat|null}
 */
export function recordPlatformStat(input) {
  if (!input || typeof input.platformId !== 'string' || !input.platformId) {
    return null;
  }
  if (input.status === 'loading' || input.status === 'idle') {
    return getPlatformStat(input.platformId);
  }

  /** @type {PlatformDebugStat} */
  const next = {
    latencyMs:
      typeof input.latencyMs === 'number' && Number.isFinite(input.latencyMs)
        ? Math.max(0, Math.round(input.latencyMs))
        : null,
    hitCount:
      typeof input.hitCount === 'number' && Number.isFinite(input.hitCount)
        ? Math.max(0, Math.round(input.hitCount))
        : null,
    status: typeof input.status === 'string' ? input.status : null,
    errorCode: typeof input.errorCode === 'string' ? input.errorCode : null,
    updatedAt:
      typeof input.updatedAt === 'number' && Number.isFinite(input.updatedAt)
        ? input.updatedAt
        : Date.now(),
  };

  platformStats.set(input.platformId, next);
  return { ...next };
}

/**
 * Snapshot for the debug panel — platforms in UI order; no query fields.
 * @returns {{ platforms: Record<string, PlatformDebugStat> }}
 */
export function getDebugStatsSnapshot() {
  /** @type {Record<string, PlatformDebugStat>} */
  const platforms = {};
  for (const id of PLATFORM_ORDER) {
    platforms[id] = getPlatformStat(id);
  }
  return { platforms };
}

/**
 * @returns {void}
 */
export function resetDebugStatsForTests() {
  platformStats.clear();
}
