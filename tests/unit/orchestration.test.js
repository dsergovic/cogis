import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
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

  it('skips tabs.remove while a newer requestId is active (BL-001)', () => {
    expect(
      shouldCloseSearchTab({
        createdByUs: true,
        tabId: 7,
        activeRequestId: 'req-b',
        closingRequestId: 'req-a',
      }),
    ).toBe(false);
    expect(
      shouldCloseSearchTab({
        createdByUs: true,
        tabId: 7,
        activeRequestId: 'req-a',
        closingRequestId: 'req-a',
      }),
    ).toBe(true);
    expect(
      shouldCloseSearchTab({
        createdByUs: true,
        tabId: 7,
        activeRequestId: null,
        closingRequestId: 'req-a',
      }),
    ).toBe(true);
  });
});

describe('superseding-search tab lifecycle (BL-001)', () => {
  it('bounds ensurePlatformTab creates to one per call', () => {
    expect(MAX_ENSURE_TAB_CREATES).toBe(1);
    expect(canCreateLabTab(0)).toBe(true);
    expect(canCreateLabTab(1)).toBe(false);
    expect(canCreateLabTab(2)).toBe(false);
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

  it('lists only safe-to-close tab ids for a finishing request', () => {
    const tabs = [
      { created: true, tabId: 1 },
      { created: false, tabId: 2 },
      { created: true, tabId: 3 },
      { created: true, tabId: null },
    ];
    expect(tabIdsSafeToClose(tabs, { activeRequestId: 'b', closingRequestId: 'a' })).toEqual([]);
    expect(tabIdsSafeToClose(tabs, { activeRequestId: null, closingRequestId: 'a' })).toEqual([
      1, 3,
    ]);
    expect(tabIdsSafeToClose(tabs, { activeRequestId: 'a', closingRequestId: 'a' })).toEqual([
      1, 3,
    ]);
  });

  it('service worker awaits prior cancel before fan-out and discards superseded creates', () => {
    const sw = readFileSync(
      new URL('../../extension/background/service-worker.js', import.meta.url),
      'utf8',
    );
    expect(sw).toContain('await cancelSearch(prior)');
    expect(sw).toContain('resolveEnsuredTabOwnership');
    expect(sw).toContain('discardSupersededCreatedTab');
    expect(sw).toContain('canCreateLabTab');
    expect(sw).toMatch(/created:\s*false/);
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
