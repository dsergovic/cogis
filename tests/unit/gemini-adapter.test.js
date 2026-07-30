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
  const maxItems = opts.maxItems ?? items.length;

  return {
    isSignInVisible: () => Boolean(opts.signInVisible),
    isSignInToSaveVisible: () => Boolean(opts.signInToSaveVisible),
    hasAccountChip: () => Boolean(opts.hasAccountChip ?? (!opts.signInVisible && !opts.loginOnly)),
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
  it('maps sign-in shell without history to login_required', () => {
    expect(
      classifyGeminiAuth({
        signInVisible: true,
        signInToSaveVisible: true,
        hasHistoryItems: false,
        hasAccountChip: false,
      }),
    ).toBe('login_required');
  });

  it('maps history items or account chip to authenticated', () => {
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
  });

  it('maps ambiguous shell to unavailable', () => {
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
  });

  it('does not authorize empty when scroll budget is exhausted mid-scan', async () => {
    let t = 0;
    const helpers = makeHelpers({
      items: [{ id: 'a', title: 'Nope', href: 'https://gemini.google.com/app/a' }],
      growthPerScroll: 3,
      maxItems: 40,
      hasAccountChip: true,
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

    expect(outcome.status).not.toBe('empty');
    expect(['timeout', 'unavailable']).toContain(outcome.status);
    expect(outcome.errorCode).toBeTruthy();
  });

  it('returns ready with partial hits even when coverage is truncated', async () => {
    let t = 0;
    const helpers = makeHelpers({
      items: loadFixture('history.hits.stub.json'),
      growthPerScroll: 5,
      maxItems: 50,
      growthTitle: 'Extra older tomato notes',
      hasAccountChip: true,
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

  it('returns empty only when coverage is established and there are no matches', async () => {
    const helpers = makeHelpers({
      items: loadFixture('history.empty.stub.json'),
      hasAccountChip: true,
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

  it('returns login_required for sign-in shell', async () => {
    const helpers = makeHelpers({
      items: [],
      signInVisible: true,
      signInToSaveVisible: true,
      hasAccountChip: false,
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

  it('caps after title filter, not before (SC-6)', async () => {
    const many = [];
    for (let i = 0; i < 30; i += 1) {
      many.push({
        id: `id-${i}`,
        title: i === 25 ? 'Unique tomato feast' : `Unrelated chat ${i}`,
        href: `https://gemini.google.com/app/id-${i}`,
      });
    }
    const helpers = makeHelpers({ items: many, hasAccountChip: true });

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
  it('stops after consecutive no-growth rounds with coverage ok', async () => {
    const helpers = makeHelpers({
      items: [{ id: 'a', title: 'A', href: 'https://gemini.google.com/app/a' }],
      growthPerScroll: 0,
    });
    const scan = await scanGeminiHistory({
      helpers,
      platformBudgetMs: 8000,
      sleepImpl: async () => {},
    });
    expect(scan.coverage).toBe('ok');
    expect(scan.items).toHaveLength(1);
  });

  it('marks soft_ceiling when item soft cap is hit', async () => {
    const helpers = makeHelpers({
      items: [],
      growthPerScroll: 20,
      maxItems: 200,
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
