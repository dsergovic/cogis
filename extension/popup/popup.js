import { MSG, createSearchRequest, shouldApplyChunk, normalizeQuery } from '../lib/messaging.js';
import { PLATFORM_ORDER, getPlatform, FOOTNOTE_TEXT } from '../lib/platforms.js';
import { resolveResultHref, truncateTitle } from '../lib/results.js';
import { POPUP_WATCHDOG_MS } from '../lib/timeouts.js';
import { perplexityPrefillUrl } from '../lib/perplexity-adapter.js';

/** Per-platform prefill URL builders, for platforms whose adapter supports one. */
const PREFILL_BUILDERS = {
  perplexity: perplexityPrefillUrl,
};

const form = document.getElementById('search-form');
const input = document.getElementById('query-input');
const resultsEl = document.getElementById('results');
const emptyHintEl = document.getElementById('empty-hint');
const footnoteEl = document.getElementById('footnote');

let activeRequestId = null;
let activeQuery = '';
let watchdogTimer = null;
/** @type {Record<string, { status: string, results: import('../lib/messaging.js').PointerRecord[], message?: string, loginUrl?: string }>} */
let groups = {};

function resetGroups() {
  groups = {};
  for (const platformId of PLATFORM_ORDER) {
    groups[platformId] = { status: 'loading', results: [] };
  }
}

function render() {
  resultsEl.replaceChildren();

  if (PLATFORM_ORDER.length === 0) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = 'No labs configured yet.';
    resultsEl.appendChild(p);
    footnoteEl.hidden = true;
    return;
  }

  const anyTitleMatch = PLATFORM_ORDER.some((id) => getPlatform(id)?.capability === 'title-match');
  footnoteEl.hidden = !anyTitleMatch;
  footnoteEl.textContent = FOOTNOTE_TEXT;

  for (const platformId of PLATFORM_ORDER) {
    const platform = getPlatform(platformId);
    const group = groups[platformId] ?? { status: 'idle', results: [] };

    const section = document.createElement('div');
    section.className = 'group';

    const heading = document.createElement('h2');
    const nameSpan = document.createElement('span');
    nameSpan.textContent = platform?.label ?? platformId;
    heading.appendChild(nameSpan);
    if (platform) {
      const capSpan = document.createElement('span');
      capSpan.className = 'capability';
      capSpan.textContent = platform.capability === 'full-text' ? 'full-text' : 'title-match';
      heading.appendChild(capSpan);
    }
    section.appendChild(heading);

    if (group.status === 'loading') {
      const note = document.createElement('p');
      note.className = 'status-note';
      note.textContent = 'Searching…';
      section.appendChild(note);
    } else if (group.status === 'login_required') {
      const note = document.createElement('p');
      note.className = 'status-note';
      note.textContent = group.message || `Please log in to ${platform?.label ?? platformId}`;
      section.appendChild(note);
    } else if (group.status === 'unavailable' || group.status === 'timeout') {
      const note = document.createElement('p');
      note.className = 'status-note';
      note.textContent =
        group.message ||
        (group.status === 'timeout'
          ? `${platform?.label ?? platformId} timed out.`
          : `${platform?.label ?? platformId} is temporarily unavailable.`);
      section.appendChild(note);
    } else if (group.status === 'empty') {
      const note = document.createElement('p');
      note.className = 'status-note';
      note.textContent = 'No results.';
      section.appendChild(note);
    } else if (group.status === 'ready') {
      const list = document.createElement('ul');
      for (const hit of group.results) {
        const li = document.createElement('li');
        const a = document.createElement('a');
        const prefillUrl = PREFILL_BUILDERS[platformId]?.(activeQuery) ?? null;
        a.href = resolveResultHref(hit, prefillUrl, platform?.origin ?? '#');
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.title = hit.title;
        a.textContent = truncateTitle(hit.title);
        li.appendChild(a);
        list.appendChild(li);
      }
      section.appendChild(list);
    }

    resultsEl.appendChild(section);
  }
}

function clearWatchdog() {
  if (watchdogTimer) {
    clearTimeout(watchdogTimer);
    watchdogTimer = null;
  }
}

function startSearch(query) {
  const requestId = crypto.randomUUID();
  activeRequestId = requestId;
  activeQuery = query;
  resetGroups();
  render();

  chrome.runtime.sendMessage(createSearchRequest({ requestId, query })).catch(() => {});

  clearWatchdog();
  watchdogTimer = setTimeout(() => {
    if (activeRequestId !== requestId) return;
    for (const platformId of PLATFORM_ORDER) {
      if (groups[platformId]?.status === 'loading') {
        groups[platformId] = { status: 'timeout', results: [] };
      }
    }
    render();
  }, POPUP_WATCHDOG_MS);
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const query = normalizeQuery(input.value);
  if (!query) return;
  emptyHintEl.hidden = true;
  startSearch(query);
});

chrome.runtime.onMessage.addListener((message) => {
  if (!message || typeof message.type !== 'string') return;
  if (!shouldApplyChunk(activeRequestId, message)) return;

  if (message.type === MSG.SEARCH_RESULT_CHUNK) {
    groups[message.platform] = {
      status: message.status,
      results: message.results ?? [],
      message: message.message,
      loginUrl: message.loginUrl,
    };
    render();
  } else if (message.type === MSG.SEARCH_PLATFORM_DONE) {
    if (groups[message.platform]) {
      groups[message.platform].status = message.status;
    }
    render();
  }
});

// The popup is now its own small centered window (background/service-worker.js
// opens it via chrome.windows.create), not the toolbar's anchored dropdown, so
// it doesn't get the dropdown's built-in focus/dismiss behavior for free.
input.focus();

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') window.close();
});

window.addEventListener('blur', () => window.close());

resetGroups();
render();
