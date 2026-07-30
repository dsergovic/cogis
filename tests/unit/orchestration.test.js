import { describe, it, expect } from 'vitest';
import {
  resolveWallExpiry,
  pendingTerminalPlatforms,
  shouldWatchdogTimeout,
  shouldCloseSearchTab,
  shouldReloadLabTab,
  pickLabTabCandidate,
  canCreateLabTab,
  MAX_ENSURE_TAB_CREATES,
  resolveEnsuredTabOwnership,
  tabIdsSafeToClose,
  collectProtectedTabIds,
  requestIdsToCancelOnSupersede,
  isSearchEpochCurrent,
} from '../../extension/lib/orchestration.js';
import {
  PLATFORM_TIMEOUT_MS,
  OVERALL_WALL_MS,
  TAB_COMPLETE_MS,
  POPUP_WATCHDOG_MS,
  withTimeout,
} from '../../extension/lib/timeouts.js';

describe('timeout budgets', () => {
  it('keeps platform budget covering tab prep sub-budget', () => {
    expect(PLATFORM_TIMEOUT_MS).toBe(8000);
    expect(TAB_COMPLETE_MS).toBeLessThan(PLATFORM_TIMEOUT_MS);
    expect(OVERALL_WALL_MS).toBe(15000);
    expect(POPUP_WATCHDOG_MS).toBe(OVERALL_WALL_MS + 500);
  });
});

describe('resolveWallExpiry', () => {
  it('emits timeout platforms when wall request is still active', () => {
    expect(
      resolveWallExpiry({
        activeRequestId: 'a',
        wallRequestId: 'a',
        platformsPendingTerminal: ['chatgpt'],
      }),
    ).toEqual({ kind: 'wall_timeout', platforms: ['chatgpt'] });
  });

  it('stays silent when superseded by a newer requestId', () => {
    expect(
      resolveWallExpiry({
        activeRequestId: 'b',
        wallRequestId: 'a',
        platformsPendingTerminal: ['chatgpt'],
      }),
    ).toEqual({ kind: 'superseded' });
  });
});

describe('pendingTerminalPlatforms', () => {
  it('filters completed platforms across the four-platform fan-out', () => {
    expect(
      pendingTerminalPlatforms(
        ['chatgpt', 'perplexity', 'claude', 'gemini'],
        new Set(['chatgpt', 'claude']),
      ),
    ).toEqual(['perplexity', 'gemini']);
  });
});

describe('shouldWatchdogTimeout', () => {
  it('force-times-out stuck loading for the active request', () => {
    expect(
      shouldWatchdogTimeout({
        activeRequestId: 'r1',
        watchdogRequestId: 'r1',
        status: 'loading',
      }),
    ).toBe(true);
    expect(
      shouldWatchdogTimeout({
        activeRequestId: 'r2',
        watchdogRequestId: 'r1',
        status: 'loading',
      }),
    ).toBe(false);
    expect(
      shouldWatchdogTimeout({
        activeRequestId: 'r1',
        watchdogRequestId: 'r1',
        status: 'ready',
      }),
    ).toBe(false);
  });
});

describe('withTimeout platform envelope', () => {
  it('rejects slow tab+search work under one budget', async () => {
    await expect(
      withTimeout(
        new Promise((resolve) => {
          setTimeout(resolve, 50);
        }),
        10,
        'chatgpt platform',
      ),
    ).rejects.toMatchObject({ code: 'timeout' });
  });
});

describe('shouldCloseSearchTab', () => {
  it('only closes tabs Cogis created — never user-owned (created:false)', () => {
    expect(shouldCloseSearchTab({ createdByUs: true, tabId: 3 })).toBe(true);
    expect(shouldCloseSearchTab({ createdByUs: false, tabId: 3 })).toBe(false);
    expect(shouldCloseSearchTab({ createdByUs: true, tabId: null })).toBe(false);
  });

  it('closes orphans even when another search is live; skips protected tabIds only', () => {
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
  });
});

describe('superseding-search helpers (BL-001)', () => {
  it('bounds ensurePlatformTab creates to one per call', () => {
    expect(MAX_ENSURE_TAB_CREATES).toBe(1);
    expect(canCreateLabTab(0)).toBe(true);
    expect(canCreateLabTab(1)).toBe(false);
  });

  it('discards Cogis-created tabs when ensure finishes after supersede', () => {
    expect(
      resolveEnsuredTabOwnership({
        requestStillActive: false,
        createdByUs: true,
        tabId: 11,
      }),
    ).toEqual({ keep: false, close: true });
  });

  it('never closes user-owned tabs after supersede', () => {
    expect(
      resolveEnsuredTabOwnership({
        requestStillActive: false,
        createdByUs: false,
        tabId: 11,
      }),
    ).toEqual({ keep: false, close: false });
  });

  it('keeps tabs for the still-active request', () => {
    expect(
      resolveEnsuredTabOwnership({
        requestStillActive: true,
        createdByUs: true,
        tabId: 11,
      }),
    ).toEqual({ keep: true, close: false });
  });

  it('lists orphan created tab ids; excludes protected and user-owned', () => {
    const tabs = [
      { created: true, tabId: 1 },
      { created: false, tabId: 2 },
      { created: true, tabId: 3 },
      { created: true, tabId: null },
    ];
    expect(tabIdsSafeToClose(tabs, { protectedTabIds: new Set([3]) })).toEqual([1]);
    expect(tabIdsSafeToClose(tabs, { protectedTabIds: new Set() })).toEqual([1, 3]);
  });

  it('collectProtectedTabIds skips the closing request', () => {
    const entries = [
      ['A', { tabs: new Map([['chatgpt', { tabId: 1, created: true }]]) }],
      ['B', { tabs: new Map([['chatgpt', { tabId: 1, created: false }]]) }],
    ];
    expect([...collectProtectedTabIds(entries, 'A')]).toEqual([1]);
    expect([...collectProtectedTabIds(entries, 'B')]).toEqual([1]);
  });

  it('requestIdsToCancelOnSupersede finds state keys when activeId is null', () => {
    expect(
      requestIdsToCancelOnSupersede({
        searchStateKeys: ['A', 'B'],
        activeRequestId: null,
        incomingRequestId: 'B',
      }),
    ).toEqual(['A']);
  });

  it('isSearchEpochCurrent rejects stale fan-out', () => {
    expect(isSearchEpochCurrent(1, 1)).toBe(true);
    expect(isSearchEpochCurrent(1, 2)).toBe(false);
  });
});

describe('lab tab adoption (SC-7 / SC-8)', () => {
  it('reloads discarded or unloaded tabs', () => {
    expect(shouldReloadLabTab({ discarded: true, status: 'complete' })).toBe(true);
    expect(shouldReloadLabTab({ discarded: false, status: 'unloaded' })).toBe(true);
    expect(shouldReloadLabTab({ discarded: false, status: 'complete' })).toBe(false);
  });

  it('prefers a non-discarded candidate when adopting', () => {
    expect(
      pickLabTabCandidate([
        { id: 1, discarded: true, status: 'unloaded' },
        { id: 2, discarded: false, status: 'complete' },
      ]),
    ).toEqual({ id: 2, discarded: false, status: 'complete' });

    expect(pickLabTabCandidate([{ id: 9, discarded: true }])?.id).toBe(9);
    expect(pickLabTabCandidate([])).toBeNull();
  });
});
