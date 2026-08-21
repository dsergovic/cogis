/**
 * Shared helpers for adapters that must run inside a real tab rather than
 * the background service worker (see the long comment in
 * perplexity-adapter.js for why that's sometimes required). Used by both
 * the Perplexity and Gemini adapters.
 */

/**
 * @param {number} tabId
 * @param {number} timeoutMs
 * @returns {Promise<void>}
 */
export function waitForTabComplete(tabId, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(listener);
      clearTimeout(timer);
      resolve();
    };
    const listener = (updatedTabId, info) => {
      if (updatedTabId === tabId && info.status === 'complete') finish();
    };
    chrome.tabs.onUpdated.addListener(listener);
    const timer = setTimeout(finish, timeoutMs);
    chrome.tabs.get(tabId).then((t) => {
      if (t.status === 'complete') finish();
    }, finish);
  });
}

/**
 * @param {number} tabId
 * @param {unknown} message
 * @returns {Promise<any>}
 */
export function sendMessageToTab(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

/**
 * Send to a tab, and if nothing is listening — most commonly a tab that was
 * already open before this extension (re)loaded, since Chrome does not
 * retroactively inject content scripts into already-open tabs — inject the
 * given content script file and retry once.
 * @param {number} tabId
 * @param {unknown} message
 * @param {string} contentScriptFile e.g. 'content/perplexity.js'
 * @returns {Promise<any>}
 */
export async function sendMessageWithInjectRetry(tabId, message, contentScriptFile) {
  try {
    return await sendMessageToTab(tabId, message);
  } catch {
    await chrome.scripting.executeScript({ target: { tabId }, files: [contentScriptFile] });
    return sendMessageToTab(tabId, message);
  }
}
