/**
 * MutationObserver + debounced poll helper for DOM readiness.
 * Prefer observer; polling is Tier 2 fallback when observer thrashes.
 *
 * @param {object} options
 * @param {Element|Document} options.root
 * @param {() => boolean} options.isReady
 * @param {number} [options.timeoutMs=8000]
 * @param {number} [options.pollMs=200]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<boolean>} resolves true when ready, false on timeout/abort
 */
export function waitForReady(options) {
  const { root, isReady, timeoutMs = 8000, pollMs = 200, signal } = options;

  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve(false);
      return;
    }
    if (isReady()) {
      resolve(true);
      return;
    }

    let settled = false;
    let observer = null;
    let pollTimer = null;
    let timeoutTimer = null;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      if (observer) observer.disconnect();
      if (pollTimer) clearTimeout(pollTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      signal?.removeEventListener('abort', onAbort);
      resolve(value);
    };

    const onAbort = () => finish(false);

    const check = () => {
      if (isReady()) finish(true);
    };

    try {
      observer = new MutationObserver(() => {
        check();
      });
      observer.observe(root, { childList: true, subtree: true, attributes: true });
    } catch {
      // Observer unavailable — rely on poll only (Tier 2).
    }

    const poll = () => {
      check();
      if (!settled) {
        pollTimer = setTimeout(poll, pollMs);
      }
    };
    pollTimer = setTimeout(poll, pollMs);

    timeoutTimer = setTimeout(() => finish(false), timeoutMs);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
