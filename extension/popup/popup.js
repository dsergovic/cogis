import {
  MSG,
  createSearchRequest,
  createSearchCancel,
  normalizeQuery,
  shouldApplyChunk,
} from '../lib/messaging.js';
import { PLATFORMS, PLATFORM_ORDER, loginRequiredCopy, unavailableCopy } from '../lib/platforms.js';
import { resolveResultHref } from '../lib/results.js';
import { POPUP_WATCHDOG_MS } from '../lib/timeouts.js';
import { shouldWatchdogTimeout } from '../lib/orchestration.js';

const form = document.getElementById('cogis-search-form');
const input = /** @type {HTMLInputElement} */ (document.getElementById('cogis-query'));
const hint = document.getElementById('cogis-hint');

/** @type {string|null} */
let activeRequestId = null;
/** @type {string|null} */
let activeQuery = null;
/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const watchdogTimers = new Map();

function newRequestId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * @param {string} platformId
 */
function groupEl(platformId) {
  return document.querySelector(`[data-cogis-platform="${platformId}"]`);
}

/**
 * @param {string} [platformId]
 */
function clearWatchdog(platformId) {
  if (platformId) {
    const timer = watchdogTimers.get(platformId);
    if (timer != null) {
      clearTimeout(timer);
      watchdogTimers.delete(platformId);
    }
    return;
  }
  for (const timer of watchdogTimers.values()) clearTimeout(timer);
  watchdogTimers.clear();
}

/**
 * @param {string} requestId
 * @param {string} platformId
 */
function armWatchdog(requestId, platformId) {
  clearWatchdog(platformId);
  const timer = setTimeout(() => {
    const el = groupEl(platformId);
    const status = el?.dataset.cogisStatus ?? 'idle';
    if (
      shouldWatchdogTimeout({
        activeRequestId,
        watchdogRequestId: requestId,
        status,
      })
    ) {
      setGroupState(platformId, 'timeout', {
        message: unavailableCopy(platformId),
      });
    }
  }, POPUP_WATCHDOG_MS);
  watchdogTimers.set(platformId, timer);
}

/**
 * @param {string} platformId
 * @param {string} status
 * @param {{ message?: string, loginUrl?: string, results?: import('../lib/messaging.js').PointerRecord[] }} [opts]
 */
function setGroupState(platformId, status, opts = {}) {
  const el = groupEl(platformId);
  if (!el) return;

  el.dataset.cogisStatus = status;
  el.className = `cogis-group cogis-group--${status}`;

  const statusText = el.querySelector('[data-cogis-status-text]');
  const list = el.querySelector('[data-cogis-list]');
  if (!statusText || !list) return;

  list.replaceChildren();
  statusText.replaceChildren();

  const platform = PLATFORMS[platformId];
  const loginUrl = opts.loginUrl ?? platform?.loginUrl ?? '#';

  switch (status) {
    case 'idle':
      break;
    case 'loading':
      statusText.textContent = 'Searching…';
      break;
    case 'ready':
      renderResults(list, opts.results ?? [], platformId);
      break;
    case 'empty':
      statusText.textContent = 'No matching chats.';
      break;
    case 'login_required':
      statusText.append(
        document.createTextNode(`${opts.message ?? loginRequiredCopy(platformId)} `),
      );
      {
        const a = document.createElement('a');
        a.href = loginUrl;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.className = 'cogis-login-link';
        a.textContent = `Open ${platform?.label ?? platformId}`;
        statusText.append(a);
      }
      break;
    case 'unavailable':
    case 'timeout':
      statusText.textContent = opts.message ?? unavailableCopy(platformId);
      break;
    default:
      break;
  }

  if (status !== 'loading') {
    clearWatchdog(platformId);
  }
}

/**
 * @param {Element} list
 * @param {import('../lib/messaging.js').PointerRecord[]} results
 * @param {string} platformId
 */
function renderResults(list, results, platformId) {
  for (const hit of results) {
    const li = document.createElement('li');
    li.className = 'cogis-result-item';

    const a = document.createElement('a');
    a.className = 'cogis-result-link';
    a.href = resolveResultHref(hit, platformId, activeQuery, PLATFORMS[platformId]?.origin);
    a.target = '_blank';
    a.rel = 'noopener noreferrer';

    const title = document.createElement('span');
    title.className = 'cogis-result-title';
    title.textContent = hit.title;

    a.append(title);

    if (hit.dateIso) {
      const date = document.createElement('span');
      date.className = 'cogis-result-date';
      date.textContent = formatDate(hit.dateIso);
      a.append(date);
    }

    li.append(a);
    list.append(li);
  }
}

/**
 * @param {string} iso
 */
function formatDate(iso) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

function clearResultsUi() {
  for (const id of PLATFORM_ORDER) {
    setGroupState(id, 'idle');
  }
}

function showHint(visible) {
  if (!hint) return;
  hint.hidden = !visible;
}

function cancelActive() {
  if (!activeRequestId) return;
  const id = activeRequestId;
  activeRequestId = null;
  activeQuery = null;
  clearWatchdog();
  chrome.runtime.sendMessage(createSearchCancel({ requestId: id })).catch(() => {});
}

function submitSearch(rawQuery) {
  const query = normalizeQuery(rawQuery);
  if (!query) {
    cancelActive();
    clearResultsUi();
    showHint(true);
    return;
  }

  showHint(false);
  cancelActive();

  const requestId = newRequestId();
  activeRequestId = requestId;
  activeQuery = query;

  for (const id of PLATFORM_ORDER) {
    setGroupState(id, 'loading');
    armWatchdog(requestId, id);
  }

  const msg = createSearchRequest({
    requestId,
    query,
    platforms: [...PLATFORM_ORDER],
  });

  chrome.runtime.sendMessage(msg).catch(() => {
    if (shouldApplyChunk(activeRequestId, { requestId })) {
      for (const id of PLATFORM_ORDER) {
        setGroupState(id, 'unavailable');
      }
    }
  });
}

form?.addEventListener('submit', (event) => {
  event.preventDefault();
  submitSearch(input?.value ?? '');
});

// No live-as-you-type search — only Enter / Search button via form submit.

chrome.runtime.onMessage.addListener((message) => {
  if (!message || typeof message.type !== 'string') return;

  if (message.type === MSG.SEARCH_RESULT_CHUNK) {
    if (!shouldApplyChunk(activeRequestId, message)) return;
    if (!PLATFORM_ORDER.includes(message.platform)) return;

    if (
      message.errorCode &&
      message.status &&
      message.status !== 'loading' &&
      message.status !== 'ready' &&
      message.status !== 'idle'
    ) {
      console.info('[cogis]', message.platform, message.status, message.errorCode);
    }

    setGroupState(message.platform, message.status, {
      message: message.message,
      loginUrl: message.loginUrl,
      results: message.results,
    });
  }
});
