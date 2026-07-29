import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  buildListAskThreadsUrl,
  buildPerplexityHeaders,
  classifyListAskThreadsOutcome,
  extractSpaces,
  filterPointersByTitle,
  searchPerplexity,
  shouldAttemptSpacesSupplement,
  SPACE_THREAD_ENUMERATION_ENABLED,
} from '../../extension/lib/perplexity-adapter.js';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '../fixtures/perplexity');

function loadFixture(name) {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf8'));
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('buildListAskThreadsUrl', () => {
  it('includes version and source query params', () => {
    const url = buildListAskThreadsUrl('https://www.perplexity.ai', {
      apiVersion: '2.18',
      apiClient: 'default',
      endpoints: { listAskThreads: '/rest/thread/list_ask_threads' },
    });
    expect(url).toContain('/rest/thread/list_ask_threads');
    expect(url).toContain('version=2.18');
    expect(url).toContain('source=default');
  });
});

describe('buildPerplexityHeaders', () => {
  it('sets x-app-apiversion and x-app-apiclient', () => {
    expect(buildPerplexityHeaders()).toMatchObject({
      'x-app-apiversion': '2.18',
      'x-app-apiclient': 'default',
      'Content-Type': 'application/json',
    });
  });
});

describe('classifyListAskThreadsOutcome', () => {
  it('maps 401 to login_required and 5xx/HTML to unavailable', () => {
    expect(
      classifyListAskThreadsOutcome({
        status: 401,
        ok: false,
        contentType: 'application/json',
        parseOk: true,
      }),
    ).toBe('login_required');

    expect(
      classifyListAskThreadsOutcome({
        status: 500,
        ok: false,
        contentType: 'application/json',
        parseOk: true,
      }),
    ).toBe('unavailable');

    expect(
      classifyListAskThreadsOutcome({
        status: 200,
        ok: true,
        contentType: 'text/html',
        parseOk: false,
        isSignInVisible: true,
      }),
    ).toBe('login_required');
  });

  it('treats 200 JSON as authenticated (even empty array)', () => {
    expect(
      classifyListAskThreadsOutcome({
        status: 200,
        ok: true,
        contentType: 'application/json',
        parseOk: true,
      }),
    ).toBe('authenticated');
  });
});

describe('extractSpaces / filterPointersByTitle', () => {
  it('extracts private spaces from stub', () => {
    const spaces = extractSpaces(loadFixture('spaces.stub.json'));
    expect(spaces).toHaveLength(1);
    expect(spaces[0].uuid).toBe('cccccccc-cccc-cccc-cccc-cccccccccccc');
  });

  it('filters by title substring', () => {
    const filtered = filterPointersByTitle(
      [
        {
          platform: 'perplexity',
          title: 'Tomato soup',
          dateIso: null,
          deepLinkUrl: 'https://www.perplexity.ai/search/a',
          prefillSupported: true,
        },
        {
          platform: 'perplexity',
          title: 'Other',
          dateIso: null,
          deepLinkUrl: 'https://www.perplexity.ai/search/b',
          prefillSupported: true,
        },
      ],
      'tomato',
    );
    expect(filtered).toHaveLength(1);
  });
});

describe('shouldAttemptSpacesSupplement', () => {
  it('is gated off by default (no unproven Space probe storm)', () => {
    expect(SPACE_THREAD_ENUMERATION_ENABLED).toBe(false);
    expect(
      shouldAttemptSpacesSupplement({
        cHitCount: 0,
        remainingMs: 5000,
      }),
    ).toBe(false);
  });

  it('requires zero C hits, remaining budget, and enumeration enabled', () => {
    expect(
      shouldAttemptSpacesSupplement({
        cHitCount: 0,
        remainingMs: 5000,
        enumerationEnabled: true,
      }),
    ).toBe(true);
    expect(
      shouldAttemptSpacesSupplement({
        cHitCount: 1,
        remainingMs: 5000,
        enumerationEnabled: true,
      }),
    ).toBe(false);
    expect(
      shouldAttemptSpacesSupplement({
        cHitCount: 0,
        remainingMs: 500,
        enumerationEnabled: true,
        minRemainingMs: 1500,
      }),
    ).toBe(false);
    expect(
      shouldAttemptSpacesSupplement({
        cHitCount: 20,
        remainingMs: 5000,
        enumerationEnabled: true,
      }),
    ).toBe(false);
  });
});

describe('searchPerplexity', () => {
  it('returns login_required on list 401', async () => {
    const fetchImpl = vi.fn(async () => new Response('unauthorized', { status: 401 }));
    const outcome = await searchPerplexity({ query: 'x', fetchImpl });
    expect(outcome.status).toBe('login_required');
    expect(outcome.message).toMatch(/Please log in to Perplexity/);
    expect(outcome.loginUrl).toBe('https://www.perplexity.ai/');
  });

  it('returns unavailable on list 500', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'boom' }, 500));
    const outcome = await searchPerplexity({ query: 'x', fetchImpl });
    expect(outcome.status).toBe('unavailable');
  });

  it('returns ready with title-match pointers (no body leak; no cache)', async () => {
    const fetchImpl = vi.fn(async (url, init) => {
      if (String(url).includes('/rest/thread/list_ask_threads')) {
        expect(init?.method).toBe('POST');
        expect(init?.credentials).toBe('include');
        expect(init?.headers?.['x-app-apiversion']).toBe('2.18');
        const body = JSON.parse(String(init?.body ?? '{}'));
        expect(body.search_term).toBe('tomato');
        expect(body.collection_uuid).toBeUndefined();
        expect(body.space_uuid).toBeUndefined();
        expect(body.filter_collection_uuid).toBeUndefined();
        return jsonResponse(loadFixture('list.hits.stub.json'));
      }
      throw new Error('unexpected Space probe ' + url);
    });

    const outcome = await searchPerplexity({ query: 'tomato', fetchImpl });
    expect(outcome.status).toBe('ready');
    expect(outcome.capability).toBe('title-match');
    expect(outcome.results.length).toBeGreaterThan(0);
    expect(outcome.results.every((r) => r.prefillSupported)).toBe(true);
    expect(outcome.results[0].deepLinkUrl).toMatch(/^https:\/\/www\.perplexity\.ai\/search\//);
    expect(JSON.stringify(outcome.results)).not.toMatch(/secret body/i);

    // Space-tagged Library hits from C are fine; no separate Spaces fetch.
    expect(outcome.results.some((r) => /Space-only/i.test(r.title))).toBe(true);
    expect(fetchImpl.mock.calls.every((c) => !String(c[0]).includes('/rest/spaces'))).toBe(true);

    await searchPerplexity({ query: 'tomato', fetchImpl });
    const listCalls = fetchImpl.mock.calls.filter((c) =>
      String(c[0]).includes('/rest/thread/list_ask_threads'),
    );
    expect(listCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('skips Spaces supplement when C already has hits (including full cap)', async () => {
    const items = Array.from({ length: 20 }, (_, i) => ({
      title: `Library hit ${i}`,
      slug: `library-hit-${i}`,
      last_query_datetime: '2024-07-03T12:00:00.000Z',
      uuid: `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
    }));
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).includes('/rest/thread/list_ask_threads')) {
        return jsonResponse(items);
      }
      throw new Error('unexpected ' + url);
    });

    const outcome = await searchPerplexity({ query: 'Library', fetchImpl });
    expect(outcome.status).toBe('ready');
    expect(outcome.results).toHaveLength(20);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('returns empty for zero hits without Space probe storm (gated A)', async () => {
    const fetchImpl = vi.fn(async (url, init) => {
      if (String(url).includes('/rest/thread/list_ask_threads')) {
        const body = JSON.parse(String(init?.body ?? '{}'));
        expect(body.collection_uuid).toBeUndefined();
        return jsonResponse(loadFixture('list.empty.stub.json'));
      }
      throw new Error('unexpected Space probe ' + url);
    });

    const outcome = await searchPerplexity({ query: 'zzzz-no-hit', fetchImpl });
    expect(outcome.status).toBe('empty');
    expect(outcome.results).toEqual([]);
    expect(outcome.capability).toBe('title-match');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls.every((c) => !String(c[0]).includes('/rest/spaces'))).toBe(true);
  });

  it('does not treat page-link scrape as Spaces recovery (B dropped)', async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).includes('/rest/thread/list_ask_threads')) {
        return jsonResponse([]);
      }
      throw new Error('unexpected ' + url);
    });

    const outcome = await searchPerplexity({
      query: 'Space-only',
      fetchImpl,
      // Former B injection — ignored; not a Spaces fallback.
      getDomSpaceThreadLinks: () => [
        { slug: 'space-only-planning-notes-xyz789', title: 'Space-only planning notes' },
      ],
    });
    expect(outcome.status).toBe('empty');
    expect(outcome.results).toEqual([]);
  });

  it('aborts when signal is aborted', async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(
      searchPerplexity({
        query: 'x',
        fetchImpl: vi.fn(),
        signal: ac.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('passes AbortSignal into fetch', async () => {
    const ac = new AbortController();
    const fetchImpl = vi.fn(async (_url, init) => {
      expect(init?.signal).toBe(ac.signal);
      return jsonResponse([]);
    });
    await searchPerplexity({ query: 'x', fetchImpl, signal: ac.signal });
    expect(fetchImpl).toHaveBeenCalled();
  });
});
