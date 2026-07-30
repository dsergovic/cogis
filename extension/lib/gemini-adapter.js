import { getPlatformSelectors } from './selectors/loader.js';
import {
  dedupePointers,
  filterPointersByTitle,
  normalizeGeminiHit,
  extractGeminiConversationId,
} from './results.js';
import { loginRequiredCopy, unavailableCopy } from './platforms.js';
import { MAX_RESULTS_PER_PLATFORM, PLATFORM_TIMEOUT_MS } from './timeouts.js';
import { waitForReady } from './readiness.js';

const CAPABILITY = 'title-match';

/**
 * Soft scroll rounds for the history rail (S6). Completing this many stable
 * rounds still authorizes `empty` by design — unread older history is a
 * platform limit, not failure truncation. See BL-024 precedent / README.
 */
export const HISTORY_SCROLL_MAX_ROUNDS = 8;

/** Minimum remaining budget (ms) before starting another scroll round. */
export const MIN_SCROLL_BUDGET_MS = 350;

/** Pause between scroll steps so virtualized lists can paint (ms). */
export const SCROLL_SETTLE_MS = 180;

/** Soft ceiling on distinct history items collected in one scan. */
export const HISTORY_ITEM_SOFT_CAP = 120;

/**
 * @param {any} err
 */
function isAbortError(err) {
  return !!err && (err.name === 'AbortError' || err.code === 'ABORT_ERR');
}

/**
 * @param {AbortSignal|undefined} signal
 */
function throwIfAborted(signal) {
  if (signal?.aborted) {
    const err = new Error('aborted');
    err.name = 'AbortError';
    throw err;
  }
}

/**
 * @param {number} ms
 * @param {AbortSignal|undefined} signal
 */
function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      const err = new Error('aborted');
      err.name = 'AbortError';
      reject(err);
      return;
    }
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      const err = new Error('aborted');
      err.name = 'AbortError';
      reject(err);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Classify Gemini auth from DOM signals (S5).
 * @param {{
 *   signInVisible: boolean,
 *   signInToSaveVisible: boolean,
 *   hasHistoryItems: boolean,
 *   hasAccountChip: boolean,
 * }} input
 * @returns {'authenticated'|'login_required'|'unavailable'}
 */
export function classifyGeminiAuth(input) {
  const { signInVisible, signInToSaveVisible, hasHistoryItems, hasAccountChip } = input;

  // Logged out: Sign in CTAs + "Sign in to save activity" without owner signals.
  if ((signInVisible || signInToSaveVisible) && !hasHistoryItems && !hasAccountChip) {
    return 'login_required';
  }
  if (hasHistoryItems || hasAccountChip) {
    return 'authenticated';
  }
  // Ambiguous shell (no history, no login upsell, no account chip).
  if (signInVisible || signInToSaveVisible) {
    return 'login_required';
  }
  return 'unavailable';
}

/**
 * True when a completed scan coverage is enough to trust an `empty` chip.
 * Incomplete / budget / missing-rail coverage must never authorize empty.
 * @param {string|undefined} coverage
 */
export function geminiCoverageEstablished(coverage) {
  return coverage === 'ok' || coverage === 'soft_ceiling';
}

/**
 * Parse raw history item records collected from the DOM into uncapped pointers.
 * Caller title-filters then caps (SC-6).
 * @param {Record<string, unknown>[]} items
 * @returns {import('./messaging.js').PointerRecord[]}
 */
export function normalizeGeminiHistoryItems(items) {
  if (!Array.isArray(items)) return [];
  const pointers = [];
  for (const item of items) {
    const p = normalizeGeminiHit(item);
    if (p) pointers.push(p);
  }
  return pointers;
}

/**
 * Default DOM collectors used when the content script does not inject helpers.
 * @param {Document} doc
 * @param {{
 *   signIn?: string,
 *   signInToSaveActivity?: string,
 *   accountChip?: string,
 *   historyItem?: string,
 *   historyScrollContainer?: string,
 * }} selectors
 */
export function createGeminiDomHelpers(doc, selectors) {
  const signInSel =
    selectors.signIn ||
    'a[href*="accounts.google.com"], button[aria-label*="Sign in" i], a[aria-label*="Sign in" i]';
  const saveSel =
    selectors.signInToSaveActivity ||
    '[aria-label*="Sign in to save activity" i], button, a, p, span, div';
  const accountSel =
    selectors.accountChip ||
    'img[alt*="Google Account" i], button[aria-label*="Google Account" i], a[aria-label*="Google Account" i]';
  const itemSel = selectors.historyItem || 'a[href*="/app/"]';
  const scrollSel = selectors.historyScrollContainer || '';

  function isVisible(el) {
    if (!el) return false;
    try {
      const style = doc.defaultView?.getComputedStyle?.(el);
      if (!style) return true;
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    } catch {
      return false;
    }
  }

  function textIncludesSignInToSave() {
    try {
      const nodes = doc.querySelectorAll(saveSel);
      for (const node of nodes) {
        if (!isVisible(node)) continue;
        const text = String(node.textContent || '').toLowerCase();
        if (text.includes('sign in to save activity')) return true;
      }
    } catch {
      // ignore
    }
    return false;
  }

  function anyVisible(sel) {
    try {
      const nodes = doc.querySelectorAll(sel);
      for (const node of nodes) {
        if (isVisible(node)) return true;
      }
    } catch {
      // ignore
    }
    return false;
  }

  return {
    isSignInVisible: () => anyVisible(signInSel),
    isSignInToSaveVisible: () => textIncludesSignInToSave(),
    hasAccountChip: () => anyVisible(accountSel),
    collectHistoryItems: () => {
      /** @type {Record<string, unknown>[]} */
      const out = [];
      const seen = new Set();
      try {
        const nodes = doc.querySelectorAll(itemSel);
        for (const node of nodes) {
          let href = null;
          try {
            const Anchor = globalThis.HTMLAnchorElement;
            if (typeof Anchor === 'function' && node instanceof Anchor) {
              href = node.href || null;
            }
          } catch {
            href = null;
          }
          if (!href) {
            href =
              node.getAttribute?.('href') || (typeof node.href === 'string' ? node.href : null);
          }
          const id = extractGeminiConversationId(href);
          if (!id || seen.has(id)) continue;
          // Skip bare /app home link.
          if (/\/app\/?$/i.test(String(href || '').split('?')[0])) continue;
          const title = String(node.textContent || node.getAttribute?.('aria-label') || '')
            .replace(/\s+/g, ' ')
            .trim();
          if (!title) continue;
          seen.add(id);
          out.push({ id, title, href });
        }
      } catch {
        // ignore
      }
      return out;
    },
    getScrollRoot: () => {
      if (scrollSel) {
        try {
          const el = doc.querySelector(scrollSel);
          if (el) return el;
        } catch {
          // ignore
        }
      }
      // Prefer a scrollable ancestor of the first history link; else documentElement.
      try {
        const first = doc.querySelector(itemSel);
        let node = first?.parentElement ?? null;
        while (node && node !== doc.body) {
          const style = doc.defaultView?.getComputedStyle?.(node);
          const overflowY = style?.overflowY || '';
          if (
            (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') &&
            node.scrollHeight > node.clientHeight + 8
          ) {
            return node;
          }
          node = node.parentElement;
        }
      } catch {
        // ignore
      }
      return doc.scrollingElement || doc.documentElement || doc.body;
    },
    scrollHistory: (root) => {
      if (!root) return;
      try {
        if (typeof root.scrollBy === 'function') {
          root.scrollBy(0, Math.max(240, Math.floor((root.clientHeight || 400) * 0.85)));
        } else {
          root.scrollTop = (root.scrollTop || 0) + 400;
        }
      } catch {
        // ignore
      }
    },
  };
}

/**
 * Scan Gemini history DOM with scroll-with-budget (S4/S6).
 * Returns raw items + coverage; caller applies title filter and empty honesty.
 *
 * @param {{
 *   helpers: ReturnType<typeof createGeminiDomHelpers>,
 *   signal?: AbortSignal,
 *   platformBudgetMs?: number,
 *   now?: () => number,
 *   sleepImpl?: (ms: number, signal?: AbortSignal) => Promise<void>,
 *   maxRounds?: number,
 *   itemSoftCap?: number,
 * }} opts
 */
export async function scanGeminiHistory(opts) {
  const {
    helpers,
    signal,
    platformBudgetMs = PLATFORM_TIMEOUT_MS,
    now = () => Date.now(),
    sleepImpl = sleep,
    maxRounds = HISTORY_SCROLL_MAX_ROUNDS,
    itemSoftCap = HISTORY_ITEM_SOFT_CAP,
  } = opts;

  const started = now();
  const remaining = () => platformBudgetMs - (now() - started);

  throwIfAborted(signal);

  /** @type {Map<string, Record<string, unknown>>} */
  const byId = new Map();

  const ingest = (items) => {
    for (const item of items) {
      const id =
        (typeof item.id === 'string' && item.id) ||
        extractGeminiConversationId(typeof item.href === 'string' ? item.href : null);
      if (!id || byId.has(id)) continue;
      byId.set(id, item);
    }
  };

  ingest(helpers.collectHistoryItems());

  let rounds = 0;
  let stableRounds = 0;
  let coverage = 'ok';
  let errorCode;

  while (rounds < maxRounds) {
    throwIfAborted(signal);
    if (remaining() < MIN_SCROLL_BUDGET_MS) {
      coverage = 'budget_exhausted';
      errorCode = 'history_budget_exhausted';
      break;
    }
    if (byId.size >= itemSoftCap) {
      coverage = 'soft_ceiling';
      errorCode = 'history_soft_ceiling';
      break;
    }

    const before = byId.size;
    const root = helpers.getScrollRoot();
    helpers.scrollHistory(root);
    await sleepImpl(SCROLL_SETTLE_MS, signal);
    ingest(helpers.collectHistoryItems());
    rounds += 1;

    if (byId.size === before) {
      stableRounds += 1;
      // Two consecutive no-growth rounds ⇒ end of virtualized list.
      if (stableRounds >= 2) {
        coverage = 'ok';
        errorCode = undefined;
        break;
      }
    } else {
      stableRounds = 0;
    }

    if (rounds >= maxRounds) {
      coverage = 'soft_ceiling';
      errorCode = 'history_soft_ceiling';
    }
  }

  return {
    items: [...byId.values()],
    coverage,
    errorCode,
    rounds,
  };
}

/**
 * Gemini DOM-first title-match search (S4).
 *
 * @param {{
 *   query: string,
 *   document?: Document,
 *   selectors?: Record<string, string>,
 *   helpers?: ReturnType<typeof createGeminiDomHelpers>,
 *   signal?: AbortSignal,
 *   platformBudgetMs?: number,
 *   waitForReadyImpl?: typeof waitForReady,
 *   now?: () => number,
 *   sleepImpl?: (ms: number, signal?: AbortSignal) => Promise<void>,
 *   maxResults?: number,
 * }} input
 */
export async function searchGemini(input) {
  const {
    query,
    document: doc,
    selectors: selectorsOverride,
    helpers: helpersOverride,
    signal,
    platformBudgetMs = PLATFORM_TIMEOUT_MS,
    waitForReadyImpl = waitForReady,
    now = () => Date.now(),
    sleepImpl = sleep,
    maxResults = MAX_RESULTS_PER_PLATFORM,
  } = input;

  const pack = getPlatformSelectors('gemini') || {};
  const selectors = {
    ...(pack.selectors || {}),
    ...(selectorsOverride || {}),
  };
  const loginUrl = pack.loginUrl || 'https://gemini.google.com/app';

  try {
    throwIfAborted(signal);

    const helpers = helpersOverride || (doc ? createGeminiDomHelpers(doc, selectors) : null);
    if (!helpers) {
      return {
        status: 'unavailable',
        results: [],
        capability: CAPABILITY,
        message: unavailableCopy('gemini'),
        errorCode: 'dom_unavailable',
        loginUrl,
      };
    }

    // Wait briefly for either history links or a login shell to appear.
    const root = doc?.documentElement || doc?.body;
    if (root && waitForReadyImpl) {
      await waitForReadyImpl({
        root,
        isReady: () =>
          helpers.collectHistoryItems().length > 0 ||
          helpers.isSignInVisible() ||
          helpers.isSignInToSaveVisible() ||
          helpers.hasAccountChip(),
        timeoutMs: Math.min(2500, Math.max(400, platformBudgetMs * 0.35)),
        pollMs: 150,
        signal,
      });
    }

    throwIfAborted(signal);

    const historyProbe = helpers.collectHistoryItems();
    const auth = classifyGeminiAuth({
      signInVisible: helpers.isSignInVisible(),
      signInToSaveVisible: helpers.isSignInToSaveVisible(),
      hasHistoryItems: historyProbe.length > 0,
      hasAccountChip: helpers.hasAccountChip(),
    });

    if (auth === 'login_required') {
      return {
        status: 'login_required',
        results: [],
        capability: CAPABILITY,
        message: loginRequiredCopy('gemini'),
        errorCode: 'login_shell',
        loginUrl,
      };
    }

    if (auth === 'unavailable') {
      return {
        status: 'unavailable',
        results: [],
        capability: CAPABILITY,
        message: unavailableCopy('gemini'),
        errorCode: 'auth_ambiguous',
        loginUrl,
      };
    }

    const spentBeforeScan = now();
    // Approximate remaining budget for scroll scan (caller already spent tab prep).
    const scanBudget = Math.max(400, platformBudgetMs - 0);
    const scan = await scanGeminiHistory({
      helpers,
      signal,
      platformBudgetMs: scanBudget,
      now,
      sleepImpl,
    });

    // Normalize full collected window uncapped → title filter → cap (SC-6).
    const uncapped = normalizeGeminiHistoryItems(scan.items);
    const matched = filterPointersByTitle(uncapped, query);
    const results = dedupePointers(matched, maxResults);

    if (results.length > 0) {
      // Partial hits are success even when coverage was truncated (SC-2).
      return {
        status: 'ready',
        results,
        capability: CAPABILITY,
        errorCode: geminiCoverageEstablished(scan.coverage) ? undefined : scan.errorCode,
        loginUrl,
      };
    }

    if (!geminiCoverageEstablished(scan.coverage)) {
      const isBudget = scan.coverage === 'budget_exhausted';
      console.debug('[cogis:gemini] incomplete history coverage', {
        coverage: scan.coverage,
        errorCode: scan.errorCode,
        itemCount: scan.items.length,
        rounds: scan.rounds,
        spentMs: now() - spentBeforeScan,
      });
      return {
        status: isBudget ? 'timeout' : 'unavailable',
        results: [],
        capability: CAPABILITY,
        message: unavailableCopy('gemini'),
        errorCode: scan.errorCode ?? 'history_coverage_unproven',
        loginUrl,
      };
    }

    return {
      status: 'empty',
      results: [],
      capability: CAPABILITY,
      errorCode: scan.coverage === 'soft_ceiling' ? 'history_soft_ceiling' : undefined,
      loginUrl,
    };
  } catch (err) {
    if (isAbortError(err)) {
      const abortErr = /** @type {Error & { name: string }} */ (err);
      throw abortErr;
    }
    console.debug('[cogis:gemini] search exception', err);
    return {
      status: 'unavailable',
      results: [],
      capability: CAPABILITY,
      message: unavailableCopy('gemini'),
      errorCode: 'adapter_exception',
      loginUrl,
    };
  }
}
