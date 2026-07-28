import { describe, it, expect, vi } from 'vitest';
import {
  PLATFORM_TIMEOUT_MS,
  OVERALL_WALL_MS,
  MAX_RESULTS_PER_PLATFORM,
  withTimeout,
  createRequestTracker,
} from '../../extension/lib/timeouts.js';

describe('timeout constants', () => {
  it('matches blueprint budgets', () => {
    expect(PLATFORM_TIMEOUT_MS).toBe(8000);
    expect(OVERALL_WALL_MS).toBe(15000);
    expect(MAX_RESULTS_PER_PLATFORM).toBe(20);
  });
});

describe('withTimeout', () => {
  it('resolves when promise wins', async () => {
    await expect(withTimeout(Promise.resolve(42), 1000)).resolves.toBe(42);
  });

  it('rejects with TimeoutError when budget exceeded', async () => {
    vi.useFakeTimers();
    const pending = withTimeout(new Promise(() => {}), 50, 'test');
    const assertion = expect(pending).rejects.toMatchObject({
      name: 'TimeoutError',
      code: 'timeout',
    });
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
    vi.useRealTimers();
  });
});

describe('createRequestTracker', () => {
  it('tracks begin/cancel/isActive for request isolation', () => {
    const t = createRequestTracker();
    t.begin('a');
    expect(t.isActive('a')).toBe(true);
    t.begin('b');
    expect(t.isActive('a')).toBe(false);
    expect(t.isActive('b')).toBe(true);
    t.cancel('b');
    expect(t.getActiveId()).toBeNull();
  });

  it('cancel without id clears active', () => {
    const t = createRequestTracker();
    t.begin('x');
    expect(t.cancel()).toBe(true);
    expect(t.isActive('x')).toBe(false);
  });
});
