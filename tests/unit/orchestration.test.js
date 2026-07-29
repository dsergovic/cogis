import { describe, it, expect } from 'vitest';
import {
  resolveWallExpiry,
  pendingTerminalPlatforms,
  shouldWatchdogTimeout,
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
  it('filters completed platforms', () => {
    expect(pendingTerminalPlatforms(['chatgpt', 'claude'], new Set(['chatgpt']))).toEqual([
      'claude',
    ]);
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
