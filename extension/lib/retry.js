/**
 * Retry a genuinely transient failure once, after a short delay. Only for
 * transient failures — a network blip, a window-manager hiccup creating an
 * off-screen tab — never for a definitive outcome (a 401, a non-ok HTTP
 * status, a JSON parse failure): retrying those just spends timeout budget
 * without changing the result. An AbortError (the caller's own timeout
 * firing) is never retried — retrying past a deliberate timeout would
 * defeat its purpose.
 * @template T
 * @param {() => Promise<T>} fn
 * @param {number} [delayMs]
 * @returns {Promise<T>}
 */
export async function retryOnce(fn, delayMs = 300) {
  try {
    return await fn();
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return fn();
  }
}
