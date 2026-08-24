/**
 * Per-lab enable/disable preference. Persisted with `chrome.storage.local`
 * (not `.sync`) — this is a per-machine choice, not something that should
 * silently follow the user's Google account to a different computer.
 */

const STORAGE_KEY = 'cogisDisabledPlatforms';

/**
 * Pure toggle logic: given the full platform list, the currently-disabled
 * ids, and the id being toggled, returns the next disabled-id list. Refuses
 * to disable the last remaining enabled platform — at least one lab always
 * stays searchable.
 * @param {string[]} allPlatformIds
 * @param {string[]} disabledIds
 * @param {string} toggledId
 * @returns {string[]}
 */
export function toggleDisabledPlatform(allPlatformIds, disabledIds, toggledId) {
  const validIds = new Set(allPlatformIds);
  const disabled = new Set(disabledIds.filter((id) => validIds.has(id)));
  const isCurrentlyEnabled = !disabled.has(toggledId);
  const enabledCount = allPlatformIds.filter((id) => !disabled.has(id)).length;

  if (isCurrentlyEnabled && enabledCount <= 1) return [...disabled];

  if (disabled.has(toggledId)) {
    disabled.delete(toggledId);
  } else {
    disabled.add(toggledId);
  }
  return [...disabled];
}

/**
 * @returns {Promise<string[]>}
 */
export async function loadDisabledPlatforms() {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const value = stored?.[STORAGE_KEY];
    return Array.isArray(value) ? value.filter((v) => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * @param {string[]} disabledIds
 * @returns {Promise<void>}
 */
export async function saveDisabledPlatforms(disabledIds) {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: disabledIds });
  } catch {
    // Best-effort; a failed save just means the preference resets next open.
  }
}
