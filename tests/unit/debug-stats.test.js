import { describe, it, expect, beforeEach } from 'vitest';
import {
  getDebugStatsSnapshot,
  getPlatformStat,
  recordPlatformStat,
  resetDebugStatsForTests,
} from '../../extension/lib/debug-stats.js';
import { PLATFORM_ORDER } from '../../extension/lib/platforms.js';

describe('debug stats (M6)', () => {
  beforeEach(() => {
    resetDebugStatsForTests();
  });

  it('records per-platform latency, hit count, status, and errorCode', () => {
    recordPlatformStat({
      platformId: 'chatgpt',
      latencyMs: 421.7,
      hitCount: 3,
      status: 'ready',
      errorCode: null,
    });
    const stat = getPlatformStat('chatgpt');
    expect(stat.latencyMs).toBe(422);
    expect(stat.hitCount).toBe(3);
    expect(stat.status).toBe('ready');
    expect(stat.errorCode).toBeNull();
  });

  it('ignores query / body / title fields and never surfaces them in the snapshot', () => {
    recordPlatformStat({
      platformId: 'claude',
      latencyMs: 100,
      hitCount: 0,
      status: 'unavailable',
      errorCode: 'adapter_error',
      // intentional privacy traps
      query: 'do not store',
      title: 'secret title',
      body: 'message body',
      results: [{ title: 'hit' }],
    });
    const snap = getDebugStatsSnapshot();
    const json = JSON.stringify(snap);
    expect(json).not.toMatch(/do not store|secret title|message body/);
    expect(snap.platforms.claude.status).toBe('unavailable');
    expect(snap.platforms.claude.errorCode).toBe('adapter_error');
    for (const id of PLATFORM_ORDER) {
      expect(snap.platforms[id]).toBeDefined();
      expect(snap.platforms[id]).not.toHaveProperty('query');
      expect(snap.platforms[id]).not.toHaveProperty('body');
      expect(snap.platforms[id]).not.toHaveProperty('results');
    }
  });

  it('does not treat loading chunks as terminal stats', () => {
    recordPlatformStat({
      platformId: 'gemini',
      latencyMs: 50,
      hitCount: 1,
      status: 'ready',
    });
    recordPlatformStat({
      platformId: 'gemini',
      status: 'loading',
      latencyMs: 999,
      hitCount: 99,
    });
    expect(getPlatformStat('gemini').status).toBe('ready');
    expect(getPlatformStat('gemini').latencyMs).toBe(50);
  });
});
