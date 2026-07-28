import { MSG } from '../lib/messaging.js';
import { searchChatgpt } from '../lib/chatgpt-adapter.js';
import { getPlatformSelectors } from '../lib/selectors/loader.js';

/**
 * ChatGPT content script — same-origin session fetch + search endpoint.
 * Access tokens stay in memory for the request only.
 */

function isLoginButtonVisible() {
  const pack = getPlatformSelectors('chatgpt');
  const sel = pack?.selectors?.loginButton ?? '[data-testid="login-button"]';
  try {
    const el = document.querySelector(sel);
    if (!el) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  } catch {
    return false;
  }
}

async function handleSearch(message) {
  const { requestId, query } = message;
  try {
    const outcome = await searchChatgpt({
      query,
      origin: location.origin.startsWith('http') ? location.origin : 'https://chatgpt.com',
      fetchImpl: fetch.bind(globalThis),
      isLoginButtonVisible,
    });
    return {
      type: MSG.CHATGPT_SEARCH_RESULT,
      requestId,
      platform: 'chatgpt',
      ...outcome,
    };
  } catch {
    return {
      type: MSG.CHATGPT_SEARCH_RESULT,
      requestId,
      platform: 'chatgpt',
      status: 'unavailable',
      results: [],
      message: 'ChatGPT is temporarily unavailable.',
      errorCode: 'content_exception',
    };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== MSG.CHATGPT_SEARCH) {
    return false;
  }
  handleSearch(message).then(sendResponse);
  return true; // async sendResponse
});
