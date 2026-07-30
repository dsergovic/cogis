import { describe, it, expect, vi } from 'vitest';
import { createRequestTracker } from '../../extension/lib/timeouts.js';
import {
  collectProtectedTabIds,
  isSearchEpochCurrent,
  requestIdsToCancelOnSupersede,
  resolveEnsuredTabOwnership,
  shouldCloseSearchTab,
  tabIdsSafeToClose,
} from '../../extension/lib/orchestration.js';

/**
 * Minimal in-memory stand-in for the SW searchState + close loop (BL-001).
 * Drives the real CANCEL→REQUEST / A→B→C orders the popup uses.
 */
function createLifecycleHarness() {
  const tracker = createRequestTracker();
  /** @type {Map<string, { tabs: Map<string, { tabId: number|null, created: boolean }> }>} */
  const searchState = new Map();
  let searchEpoch = 0;
  /** @type {number[]} */
  const removed = [];
  const removeTab = vi.fn(async (tabId) => {
    removed.push(tabId);
  });

  function protectedExcept(exceptId) {
    return collectProtectedTabIds(searchState.entries(), exceptId);
  }

  async function closeCreatedTabs(state, closingRequestId) {
    if (!state?.tabs) return;
    const toClose = tabIdsSafeToClose(state.tabs.values(), {
      protectedTabIds: protectedExcept(closingRequestId),
    });
    for (const tabId of toClose) {
      await removeTab(tabId);
    }
  }

  async function cancelSearch(requestId) {
    const state = searchState.get(requestId);
    tracker.cancel(requestId);
    await closeCreatedTabs(state, requestId);
    searchState.delete(requestId);
  }

  async function cancelOtherSearches(keepRequestId) {
    const ids = requestIdsToCancelOnSupersede({
      searchStateKeys: searchState.keys(),
      activeRequestId: tracker.getActiveId(),
      incomingRequestId: keepRequestId,
    });
    for (const id of ids) {
      await cancelSearch(id);
    }
  }

  /**
   * @param {string} requestId
   * @param {Array<[string, { tabId: number, created: boolean }]>} [tabEntries]
   */
  function beginSearch(requestId, tabEntries = []) {
    tracker.begin(requestId);
    const tabs = new Map(tabEntries);
    searchState.set(requestId, { tabs });
    return searchState.get(requestId);
  }

  async function onSearchRequest(requestId) {
    const epoch = (searchEpoch += 1);
    await cancelOtherSearches(requestId);
    if (!isSearchEpochCurrent(epoch, searchEpoch)) {
      return { started: false, epoch };
    }
    beginSearch(requestId);
    return { started: true, epoch };
  }

  return {
    tracker,
    searchState,
    removed,
    removeTab,
    cancelSearch,
    cancelOtherSearches,
    beginSearch,
    onSearchRequest,
    get searchEpoch() {
      return searchEpoch;
    },
    set searchEpoch(value) {
      searchEpoch = value;
    },
  };
}

describe('BL-001 tab lifecycle (behavioral)', () => {
  it('CANCEL(A) then REQUEST(B): closes A-created tabs even when activeId is already null', async () => {
    const h = createLifecycleHarness();
    h.beginSearch('A', [
      ['chatgpt', { tabId: 101, created: true }],
      ['claude', { tabId: 202, created: false }],
    ]);

    // Popup cancelActive → SEARCH_CANCEL nulls tracker before REQUEST.
    await h.cancelSearch('A');
    expect(h.tracker.getActiveId()).toBeNull();
    expect(h.removed).toEqual([101]);
    expect(h.removed).not.toContain(202);

    const result = await h.onSearchRequest('B');
    expect(result.started).toBe(true);
    expect(h.searchState.has('A')).toBe(false);
    expect(h.searchState.has('B')).toBe(true);
    expect(h.removed).toEqual([101]);
  });

  it('closes A orphans while B is active, but keeps tabIds B already claimed', async () => {
    const h = createLifecycleHarness();
    h.beginSearch('A', [
      ['chatgpt', { tabId: 11, created: true }],
      ['perplexity', { tabId: 22, created: true }],
    ]);
    // B has begun and adopted tab 11 (as created:false — session reuse).
    h.beginSearch('B', [['chatgpt', { tabId: 11, created: false }]]);

    await h.cancelSearch('A');
    expect(h.removed).toEqual([22]);
    expect(h.removed).not.toContain(11);
  });

  it('does not skip all closes merely because a newer requestId is active', () => {
    expect(
      shouldCloseSearchTab({
        createdByUs: true,
        tabId: 7,
        protectedTabIds: new Set(),
      }),
    ).toBe(true);
    expect(
      shouldCloseSearchTab({
        createdByUs: true,
        tabId: 7,
        protectedTabIds: new Set([7]),
      }),
    ).toBe(false);
    expect(
      tabIdsSafeToClose(
        [
          { created: true, tabId: 1 },
          { created: true, tabId: 2 },
          { created: false, tabId: 3 },
        ],
        { protectedTabIds: new Set([2]) },
      ),
    ).toEqual([1]);
  });

  it('resolveEnsuredTabOwnership does not yank a tab claimed by a newer search', () => {
    expect(
      resolveEnsuredTabOwnership({
        requestStillActive: false,
        createdByUs: true,
        tabId: 55,
        protectedTabIds: new Set([55]),
      }),
    ).toEqual({ keep: false, close: false });

    expect(
      resolveEnsuredTabOwnership({
        requestStillActive: false,
        createdByUs: true,
        tabId: 56,
        protectedTabIds: new Set([55]),
      }),
    ).toEqual({ keep: false, close: true });
  });

  it('A→B→C: stale epoch after await does not start fan-out or reclaim activeId', async () => {
    const tracker = createRequestTracker();
    /** @type {Map<string, { tabs: Map<string, { tabId: number, created: boolean }> }>} */
    const searchState = new Map();
    let searchEpoch = 0;
    /** @type {number[]} */
    const removed = [];

    searchState.set('A', {
      tabs: new Map([['chatgpt', { tabId: 1, created: true }]]),
    });
    tracker.begin('A');

    async function cancelSearch(requestId) {
      const state = searchState.get(requestId);
      tracker.cancel(requestId);
      const toClose = tabIdsSafeToClose(state?.tabs?.values() ?? [], {
        protectedTabIds: collectProtectedTabIds(searchState.entries(), requestId),
      });
      removed.push(...toClose);
      searchState.delete(requestId);
    }

    let releaseA;
    const gateA = new Promise((resolve) => {
      releaseA = resolve;
    });

    const bRun = (async () => {
      const epoch = (searchEpoch += 1);
      const ids = requestIdsToCancelOnSupersede({
        searchStateKeys: searchState.keys(),
        activeRequestId: tracker.getActiveId(),
        incomingRequestId: 'B',
      });
      for (const id of ids) {
        if (id === 'A') await gateA;
        await cancelSearch(id);
      }
      if (!isSearchEpochCurrent(epoch, searchEpoch)) return { started: false };
      tracker.begin('B');
      searchState.set('B', { tabs: new Map() });
      return { started: true };
    })();

    const cRun = (async () => {
      const epoch = (searchEpoch += 1);
      const ids = requestIdsToCancelOnSupersede({
        searchStateKeys: searchState.keys(),
        activeRequestId: tracker.getActiveId(),
        incomingRequestId: 'C',
      });
      for (const id of ids) {
        await cancelSearch(id);
      }
      if (!isSearchEpochCurrent(epoch, searchEpoch)) return { started: false };
      tracker.begin('C');
      searchState.set('C', { tabs: new Map() });
      return { started: true };
    })();

    // C completes while B is still awaiting A's cancel gate.
    const cResult = await cRun;
    expect(cResult.started).toBe(true);
    expect(tracker.getActiveId()).toBe('C');

    releaseA();
    const bResult = await bRun;
    expect(bResult.started).toBe(false);
    expect(tracker.getActiveId()).toBe('C');
    expect(searchState.has('B')).toBe(false);
    expect(searchState.has('C')).toBe(true);
    expect(removed).toContain(1);
  });

  it('requestIdsToCancelOnSupersede uses searchState when activeId is already null', () => {
    expect(
      requestIdsToCancelOnSupersede({
        searchStateKeys: ['A'],
        activeRequestId: null,
        incomingRequestId: 'B',
      }),
    ).toEqual(['A']);
  });
});
