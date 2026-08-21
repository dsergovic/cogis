import { MSG, createResultChunk, createPlatformDone } from '../lib/messaging.js';
import { PLATFORM_ORDER } from '../lib/platforms.js';
import { createRequestTracker, OVERALL_WALL_MS } from '../lib/timeouts.js';

const tracker = createRequestTracker();

/**
 * Runs one platform's search and reports back to the popup via runtime
 * messages. No lab adapters are wired up yet — each one lands as its own
 * step once its live contract has been verified. Until then every platform
 * reports `unavailable`.
 * @param {string} requestId
 * @param {string} query
 * @param {string} platformId
 */
async function runPlatform(requestId, query, platformId) {
  if (!tracker.isActive(requestId)) return;

  chrome.runtime
    .sendMessage(
      createResultChunk({
        requestId,
        platform: platformId,
        status: 'unavailable',
        message: `${platformId} adapter not implemented yet`,
      }),
    )
    .catch(() => {});

  if (!tracker.isActive(requestId)) return;
  chrome.runtime
    .sendMessage(createPlatformDone({ requestId, platform: platformId, status: 'unavailable' }))
    .catch(() => {});
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') return false;
  // Only the extension itself may drive a search (no externally_connectable,
  // no web-accessible message surface — sender.tab is only ever a lab tab
  // this same code opened, and lab tabs never send SEARCH_REQUEST).
  if (sender.id !== chrome.runtime.id) return false;

  if (message.type === MSG.SEARCH_REQUEST) {
    const requestId = message.requestId;
    const query = message.query;
    const platforms =
      Array.isArray(message.platforms) && message.platforms.length
        ? message.platforms
        : PLATFORM_ORDER;

    tracker.begin(requestId);
    const wallTimer = setTimeout(() => {
      tracker.cancel(requestId);
    }, OVERALL_WALL_MS);

    Promise.all(platforms.map((platformId) => runPlatform(requestId, query, platformId))).finally(
      () => clearTimeout(wallTimer),
    );

    sendResponse({ ok: true });
    return false;
  }

  if (message.type === MSG.SEARCH_CANCEL) {
    tracker.cancel(message.requestId);
    sendResponse({ ok: true });
    return false;
  }

  return false;
});
