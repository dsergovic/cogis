/**
 * Session-only per-lab collapse helpers (BL-020). Pure — no chrome.storage.
 */

/**
 * @param {boolean} currentlyCollapsed
 * @returns {boolean}
 */
export function nextCollapsedState(currentlyCollapsed) {
  return !currentlyCollapsed;
}

/**
 * Build the group element className while preserving collapse across status updates.
 * @param {string} status
 * @param {boolean} collapsed
 */
export function groupClassName(status, collapsed) {
  const base = `cogis-group cogis-group--${status}`;
  return collapsed ? `${base} cogis-group--collapsed` : base;
}
