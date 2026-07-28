/** Per-platform search budget (ms). */
export const PLATFORM_TIMEOUT_MS = 8000;

/** Overall wall clock for a search request (ms). */
export const OVERALL_WALL_MS = 15000;

/** Default max results rendered per platform (Tier 2). */
export const MAX_RESULTS_PER_PLATFORM = 20;

/**
 * Race a promise against a timeout. Rejects with a TimeoutError-like Error.
 * @param {Promise<T>} promise
 * @param {number} ms
 * @param {string} [label]
 * @returns {Promise<T>}
 * @template T
 */
export function withTimeout(promise, ms, label = 'operation') {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const err = new Error(`${label} timed out after ${ms}ms`);
      err.name = 'TimeoutError';
      err.code = 'timeout';
      reject(err);
    }, ms);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * Create a cancelable request tracker for requestId isolation.
 * @returns {{ getActiveId: () => string|null, begin: (id: string) => void, cancel: (id?: string) => boolean, isActive: (id: string) => boolean }}
 */
export function createRequestTracker() {
  let activeId = null;

  return {
    getActiveId() {
      return activeId;
    },
    begin(id) {
      activeId = id;
    },
    cancel(id) {
      if (id === undefined || id === activeId) {
        activeId = null;
        return true;
      }
      return false;
    },
    isActive(id) {
      return activeId !== null && activeId === id;
    },
  };
}
