import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  HISTORY_SCROLL_MAX_ROUNDS,
  HISTORY_ITEM_SOFT_CAP,
  classifyGeminiAuth,
  geminiCoverageEstablished,
  normalizeGeminiHistoryItems,
  scanGeminiHistory,
  searchGemini,
} from '../../extension/lib/gemini-adapter.js';
import {
  extractGeminiConversationId,
  geminiDeepLink,
  normalizeGeminiHit,
  pointerHasForbiddenFields,
} from '../../extension/lib/results.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const fixturesDir = join(root, 'tests/fixtures/gemini');

function loadFixture(name) {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf8'));
}

function makeHelpers(opts = {}) {
  let items = opts.items ? [...opts.items] : [];
  let scrollCalls = 0;
  const growthPerScroll = opts.growthPerScroll ?? 0;
  const maxItems = opts.maxItems ?? (growthPerScroll > 0 ? Number.POSITIVE_INFINITY : items.length);

  return {
    isSignInVisible: () => Boolean(opts.signInVisible),
    isSignInToSaveVisible: () => Boolean(opts.signInToSaveVisible),
    hasAccountChip: () => Boolean(opts.hasAccountChip ?? (!opts.signInVisible && !opts.loginOnly)),
    hasHistoryRail: () => {
      if (typeof opts.hasHistoryRail === 'boolean') return opts.hasHistoryRail;
      if (typeof opts.hasHistoryRail === 'function') return opts.hasHistoryRail(() => items);
      return items.length > 0;
    },
    collectHistoryItems: () => items.map((x) => ({ ...x })),
    getScrollRoot: () => ({ scrollTop: 0, clientHeight: 400, scrollBy() {} }),
    scrollHistory: () => {
      scrollCalls += 1;
      if (growthPerScroll > 0 && items.length < maxItems) {
        const next = [];
        for (let i = 0; i < growthPerScroll && items.length + next.length < maxItems; i += 1) {
          const id = `grown-${items.length + next.length}`;
          next.push({
            id,
            title: opts.growthTitle ?? `Older chat ${id}`,
            href: `https://gemini.google.com/app/${id}`,
          });
        }
        items = items.concat(next);
      }
    },
    _scrollCalls: () => scrollCalls,
  };
}

describe('gemini deep link + normalize', () => {
  it('builds /app/{id} deep links', () => {
    expect(geminiDeepLink('abc123')).toBe('https://gemini.google.com/app/abc123');
    expect(geminiDeepLink('')).toBeNull();
  });

  it('extracts conversation ids from hrefs', () => {
    expect(extractGeminiConversationId('https://gemini.google.com/app/abc123')).toBe('abc123');
    expect(extractGeminiConversationId('/app/xyz')).toBe('xyz');
    expect(extractGeminiConversationId('https://gemini.google.com/app')).toBeNull();
  });

  it('normalizes hits and drops forbidden body fields', () => {
    const raw = loadFixture('history.with-body.stub.json')[0];
    const pointer = normalizeGeminiHit(raw);
    expect(pointer).toMatchObject({
      platform: 'gemini',
      title: 'Secret planning notes',
      deepLinkUrl: 'https://gemini.google.com/app/bodyleak1',
      prefillSupported: false,
    });
    expect(pointerHasForbiddenFields(pointer)).toBe(false);
    expect(JSON.stringify(pointer)).not.toMatch(/secret body/i);
  });

  it('normalizes a full history window uncapped', () => {
    const pointers = normalizeGeminiHistoryItems(loadFixture('history.hits.stub.json'));
    expect(pointers).toHaveLength(2);
    expect(pointers[0].deepLinkUrl).toContain('/app/abc123def456');
  });
});

describe('classifyGeminiAuth (S5)', () => {
  it('maps full sign-in shell (Sign in AND save-activity) without owner to login_required', () => {
    expect(
      classifyGeminiAuth({
        signInVisible: true,
        signInToSaveVisible: true,
        hasHistoryItems: false,
        hasAccountChip: false,
      }),
    ).toBe('login_required');
  });

  it('maps one-signal-only shells to unavailable (S5 combination required)', () => {
    expect(
      classifyGeminiAuth({
        signInVisible: true,
        signInToSaveVisible: false,
        hasHistoryItems: false,
        hasAccountChip: false,
      }),
    ).toBe('unavailable');
    expect(
      classifyGeminiAuth({
        signInVisible: false,
        signInToSaveVisible: true,
        hasHistoryItems: false,
        hasAccountChip: false,
      }),
    ).toBe('unavailable');
  });

  it('maps history items, account chip, or proven history rail to authenticated', () => {
    expect(
      classifyGeminiAuth({
        signInVisible: false,
        signInToSaveVisible: false,
        hasHistoryItems: true,
        hasAccountChip: false,
      }),
    ).toBe('authenticated');
    expect(
      classifyGeminiAuth({
        signInVisible: false,
        signInToSaveVisible: false,
        hasHistoryItems: false,
        hasAccountChip: true,
      }),
    ).toBe('authenticated');
    expect(
      classifyGeminiAuth({
        signInVisible: false,
        signInToSaveVisible: false,
        hasHistoryItems: false,
        hasAccountChip: false,
        hasHistoryRail: true,
      }),
    ).toBe('authenticated');
  });

  it('maps signal-free shell to unavailable', () => {
    expect(
      classifyGeminiAuth({
        signInVisible: false,
        signInToSaveVisible: false,
        hasHistoryItems: false,
        hasAccountChip: false,
      }),
    ).toBe('unavailable');
  });
});

describe('gemini coverage honesty', () => {
  it('documents soft ceiling constants separately from truncation', () => {
    expect(HISTORY_SCROLL_MAX_ROUNDS).toBe(8);
    expect(HISTORY_ITEM_SOFT_CAP).toBe(120);
    expect(geminiCoverageEstablished('ok')).toBe(true);
    expect(geminiCoverageEstablished('soft_ceiling')).toBe(true);
    expect(geminiCoverageEstablished('budget_exhausted')).toBe(false);
    expect(geminiCoverageEstablished('rail_missing')).toBe(false);
  });

  it('returns timeout + history_budget_exhausted when scroll budget is exhausted mid-scan', async () => {
    let t = 0;
    const helpers = makeHelpers({
      items: [{ id: 'a', title: 'Nope', href: 'https://gemini.google.com/app/a' }],
      growthPerScroll: 3,
      maxItems: 40,
      hasAccountChip: true,
      hasHistoryRail: true,
    });

    const outcome = await searchGemini({
      query: 'tomato',
      helpers,
      platformBudgetMs: 500,
      now: () => {
        const cur = t;
        t += 200;
        return cur;
      },
      sleepImpl: async () => {},
      waitForReadyImpl: async () => true,
    });

    expect(outcome.status).toBe('timeout');
    expect(outcome.errorCode).toBe('history_budget_exhausted');
  });

  it('returns unavailable + history_rail_missing when authenticated but rail never proven', async () => {
    const helpers = makeHelpers({
      items: [],
      hasAccountChip: true,
      hasHistoryRail: false,
    });

    const outcome = await searchGemini({
      query: 'zzzz-no-such-chat',
      helpers,
      platformBudgetMs: 8000,
      sleepImpl: async () => {},
      waitForReadyImpl: async () => true,
    });

    expect(outcome.status).toBe('unavailable');
    expect(outcome.errorCode).toBe('history_rail_missing');
    expect(outcome.status).not.toBe('empty');
  });

  it('never returns empty when chip is visible first and rail arrives later mid-scan', async () => {
    let items = [];
    const helpers = {
      isSignInVisible: () => false,
      isSignInToSaveVisible: () => false,
      hasAccountChip: () => true,
      hasHistoryRail: () => items.length > 0,
      collectHistoryItems: () => items.map((x) => ({ ...x })),
      getScrollRoot: () => ({ scrollTop: 0, clientHeight: 400, scrollBy() {} }),
      scrollHistory: () => {
        if (items.length === 0) {
          items = [
            {
              id: 'late-1',
              title: 'Late-loaded tomato soup',
              href: 'https://gemini.google.com/app/late-1',
            },
          ];
        }
      },
    };

    const outcome = await searchGemini({
      query: 'tomato',
      helpers,
      platformBudgetMs: 8000,
      sleepImpl: async () => {},
      waitForReadyImpl: async () => true,
    });

    expect(outcome.status).toBe('ready');
    expect(outcome.results[0].title).toMatch(/tomato/i);
  });

  it('returns ready with partial hits even when coverage is truncated', async () => {
    let t = 0;
    const helpers = makeHelpers({
      items: loadFixture('history.hits.stub.json'),
      growthPerScroll: 5,
      maxItems: 50,
      growthTitle: 'Extra older tomato notes',
      hasAccountChip: true,
      hasHistoryRail: true,
    });

    const outcome = await searchGemini({
      query: 'tomato',
      helpers,
      platformBudgetMs: 600,
      now: () => {
        const cur = t;
        t += 250;
        return cur;
      },
      sleepImpl: async () => {},
      waitForReadyImpl: async () => true,
    });

    expect(outcome.status).toBe('ready');
    expect(outcome.results.length).toBeGreaterThan(0);
    expect(outcome.results.every((r) => r.title.toLowerCase().includes('tomato'))).toBe(true);
  });

  it('returns empty when rail is proven and there are no title matches', async () => {
    const helpers = makeHelpers({
      items: loadFixture('history.empty.stub.json'),
      hasAccountChip: true,
      hasHistoryRail: true,
    });

    const outcome = await searchGemini({
      query: 'zzzz-no-such-chat',
      helpers,
      platformBudgetMs: 8000,
      sleepImpl: async () => {},
      waitForReadyImpl: async () => true,
    });

    expect(outcome.status).toBe('empty');
    expect(outcome.capability).toBe('title-match');
  });

  it('returns empty when rail is proven with zero items and no account chip (S5 owner = rail)', async () => {
    const helpers = makeHelpers({
      items: [],
      hasAccountChip: false,
      hasHistoryRail: true,
      loginOnly: true,
    });

    const outcome = await searchGemini({
      query: 'zzzz-no-such-chat',
      helpers,
      platformBudgetMs: 8000,
      sleepImpl: async () => {},
      waitForReadyImpl: async () => true,
    });

    expect(outcome.status).toBe('empty');
    expect(outcome.errorCode).not.toBe('auth_ambiguous');
    expect(outcome.errorCode).not.toBe('history_rail_missing');
  });

  it('returns empty when rail has items but none match the title filter', async () => {
    const helpers = makeHelpers({
      items: loadFixture('history.hits.stub.json'),
      hasAccountChip: true,
      hasHistoryRail: true,
    });

    const outcome = await searchGemini({
      query: 'zzzz-no-such-chat',
      helpers,
      platformBudgetMs: 8000,
      sleepImpl: async () => {},
      waitForReadyImpl: async () => true,
    });

    expect(outcome.status).toBe('empty');
  });

  it('returns login_required for full S5 sign-in shell', async () => {
    const helpers = makeHelpers({
      items: [],
      signInVisible: true,
      signInToSaveVisible: true,
      hasAccountChip: false,
      hasHistoryRail: false,
      loginOnly: true,
    });

    const outcome = await searchGemini({
      query: 'x',
      helpers,
      sleepImpl: async () => {},
      waitForReadyImpl: async () => true,
    });

    expect(outcome.status).toBe('login_required');
    expect(outcome.errorCode).toBe('login_shell');
    expect(outcome.message).toMatch(/Please log in to Gemini/);
  });

  it('returns unavailable for one-signal login shell', async () => {
    const helpers = makeHelpers({
      items: [],
      signInVisible: true,
      signInToSaveVisible: false,
      hasAccountChip: false,
      hasHistoryRail: false,
      loginOnly: true,
    });

    const outcome = await searchGemini({
      query: 'x',
      helpers,
      sleepImpl: async () => {},
      waitForReadyImpl: async () => true,
    });

    expect(outcome.status).toBe('unavailable');
    expect(outcome.errorCode).toBe('auth_ambiguous');
  });

  it('caps after title filter, not before (SC-6)', async () => {
    const many = [];
    for (let i = 0; i < 30; i += 1) {
      many.push({
        id: `id-${i}`,
        title: i === 25 ? 'Unique tomato feast' : `Unrelated chat ${i}`,
        href: `https://gemini.google.com/app/id-${i}`,
      });
    }
    const helpers = makeHelpers({ items: many, hasAccountChip: true, hasHistoryRail: true });

    const outcome = await searchGemini({
      query: 'tomato',
      helpers,
      maxResults: 5,
      sleepImpl: async () => {},
      waitForReadyImpl: async () => true,
    });

    expect(outcome.status).toBe('ready');
    expect(outcome.results).toHaveLength(1);
    expect(outcome.results[0].title).toMatch(/tomato/i);
  });

  it('aborts when signal is aborted', async () => {
    const ac = new AbortController();
    ac.abort();
    const helpers = makeHelpers({
      items: loadFixture('history.hits.stub.json'),
      hasAccountChip: true,
      hasHistoryRail: true,
    });

    await expect(
      searchGemini({
        query: 'tomato',
        helpers,
        signal: ac.signal,
        waitForReadyImpl: async () => true,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('scanGeminiHistory', () => {
  it('stops after consecutive no-growth rounds with coverage ok when items exist', async () => {
    const helpers = makeHelpers({
      items: [{ id: 'a', title: 'A', href: 'https://gemini.google.com/app/a' }],
      growthPerScroll: 0,
      hasHistoryRail: true,
    });
    const scan = await scanGeminiHistory({
      helpers,
      platformBudgetMs: 8000,
      sleepImpl: async () => {},
    });
    expect(scan.coverage).toBe('ok');
    expect(scan.items).toHaveLength(1);
  });

  it('marks rail_missing when zero items and rail not proven', async () => {
    const helpers = makeHelpers({
      items: [],
      growthPerScroll: 0,
      hasHistoryRail: false,
    });
    const scan = await scanGeminiHistory({
      helpers,
      platformBudgetMs: 8000,
      sleepImpl: async () => {},
    });
    expect(scan.coverage).toBe('rail_missing');
    expect(scan.errorCode).toBe('history_rail_missing');
  });

  it('marks soft_ceiling when item soft cap is hit', async () => {
    const helpers = makeHelpers({
      items: [],
      growthPerScroll: 20,
      maxItems: 200,
      hasHistoryRail: true,
    });
    const scan = await scanGeminiHistory({
      helpers,
      platformBudgetMs: 8000,
      itemSoftCap: 25,
      sleepImpl: async () => {},
    });
    expect(scan.coverage).toBe('soft_ceiling');
    expect(scan.items.length).toBeGreaterThanOrEqual(25);
  });
});
