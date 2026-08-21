/**
 * Runs the Gemini "Search chats" flow inside an actual gemini.google.com/search
 * tab. There is no first-party search endpoint this extension can call
 * directly (see the long comment in extension/lib/gemini-adapter.js for why
 * — it's Google's `batchexecute` RPC with a session-bound token, and
 * replaying that outside the page is exactly the kind of fragile
 * reverse-engineering this project avoids). So this drives the real search
 * UI: type into the search box the same way a user would, wait for results
 * to settle, and scrape title/date/href only — the body-snippet text is
 * never read.
 *
 * Classic (non-module) content script — no imports.
 */

const GEMINI_TAB_SEARCH = 'COGIS_GEMINI_TAB_SEARCH';
const SEARCH_INPUT_SELECTOR = 'input[aria-label="Search chats"]';
const RESULT_LINK_SELECTOR = 'a.snippet-container[href^="/app/"]';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForSearchInput(budgetMs) {
  const start = Date.now();
  while (Date.now() - start < budgetMs) {
    const input = document.querySelector(SEARCH_INPUT_SELECTOR);
    if (input) return input;
    await sleep(150);
  }
  return null;
}

function looksLoggedOut() {
  if (document.querySelector('a[href*="accounts.google.com"]')) return true;
  const signInText = /sign in/i;
  return [...document.querySelectorAll('a, button')].some((el) =>
    signInText.test(el.textContent || ''),
  );
}

function scrapeResults() {
  return [...document.querySelectorAll(RESULT_LINK_SELECTOR)].map((a) => {
    const title = a.querySelector('.title')?.textContent ?? '';
    const dateText = a.querySelector('.date')?.textContent ?? '';
    return { title: title.trim(), dateText: dateText.trim(), href: a.getAttribute('href') };
  });
}

async function waitForResultsToSettle() {
  await sleep(500);
  let lastCount = -1;
  for (let i = 0; i < 6; i++) {
    const count = document.querySelectorAll(RESULT_LINK_SELECTOR).length;
    if (count === lastCount) break;
    lastCount = count;
    await sleep(300);
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== GEMINI_TAB_SEARCH) return false;

  (async () => {
    try {
      const input = await waitForSearchInput(4000);
      if (!input) {
        if (looksLoggedOut()) {
          sendResponse({ status: 'login_required' });
        } else {
          sendResponse({ status: 'error', message: 'Gemini search box did not load.' });
        }
        return;
      }

      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      ).set;
      setter.call(input, message.query);
      input.dispatchEvent(new Event('input', { bubbles: true }));

      await waitForResultsToSettle();

      sendResponse({ status: 'ok', hits: scrapeResults() });
    } catch (err) {
      sendResponse({ status: 'error', message: String(err?.message ?? err) });
    }
  })();

  return true;
});
