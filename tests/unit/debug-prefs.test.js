import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DEBUG_PREFS_STORAGE_KEY,
  defaultDebugPrefs,
  loadDebugPrefs,
  sanitizeDebugPrefs,
  savePingOptIn,
} from '../../extension/lib/debug-prefs.js';
import { DEFAULT_PING_OPT_IN } from '../../extension/lib/ping.js';

describe('debug prefs (M6)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults ping opt-in to off', () => {
    expect(defaultDebugPrefs()).toEqual({ pingOptIn: DEFAULT_PING_OPT_IN });
    expect(defaultDebugPrefs().pingOptIn).toBe(false);
  });

  it('sanitizes storage bags and drops query-like keys', () => {
    const cleaned = sanitizeDebugPrefs({
      pingOptIn: true,
      query: 'should vanish',
      lastQuery: 'also gone',
      results: [{ title: 'nope' }],
    });
    expect(cleaned).toEqual({ pingOptIn: true });
    expect(cleaned).not.toHaveProperty('query');
    expect(JSON.stringify(cleaned)).not.toMatch(/should vanish|also gone|nope/);
  });

  it('loads and saves only the opt-in flag via storage', async () => {
    const store = {};
    const storageArea = {
      get: vi.fn(async (key) => {
        const k = typeof key === 'string' ? key : Object.keys(key)[0];
        return { [k]: store[k] };
      }),
      set: vi.fn(async (items) => {
        Object.assign(store, items);
      }),
    };

    expect(await loadDebugPrefs(storageArea)).toEqual({ pingOptIn: false });

    const saved = await savePingOptIn(true, storageArea);
    expect(saved).toEqual({ pingOptIn: true });
    expect(storageArea.set).toHaveBeenCalledWith({
      [DEBUG_PREFS_STORAGE_KEY]: { pingOptIn: true },
    });
    expect(JSON.stringify(store)).not.toMatch(/query|title|body/i);
    expect(await loadDebugPrefs(storageArea)).toEqual({ pingOptIn: true });
  });
});
