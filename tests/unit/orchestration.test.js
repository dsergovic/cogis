import { describe, it, expect } from 'vitest';
import {
  resolveWallExpiry,
  pendingTerminalPlatforms,
  shouldWatchdogTimeout,
  shouldCloseSearchTab,
  shouldReloadLabTab,
  pickLabTabCandidate,
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
  it('only closes tabs Cogis created', () => {
    expect(shouldCloseSearchTab({ createdByUs: true, tabId: 3 })).toBe(true);
    expect(shouldCloseSearchTab({ createdByUs: false, tabId: 3 })).toBe(false);
    expect(shouldCloseSearchTab({ createdByUs: true, tabId: null })).toBe(false);
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
