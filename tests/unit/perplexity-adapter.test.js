import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  buildListAskThreadsUrl,
  buildPerplexityHeaders,
  classifyListAskThreadsOutcome,
  collectDomSpacePointers,
  extractSpaces,
  filterPointersByTitle,
  searchPerplexity,
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

describe('collectDomSpacePointers', () => {
  it('normalizes DOM links and title-filters', () => {
    const pointers = collectDomSpacePointers(
      () => [
        { slug: 'space-only-planning-notes-xyz789', title: 'Space-only planning notes' },
        { slug: 'unrelated', title: 'Something else' },
      ],
      'space-only',
      20,
    );
    expect(pointers).toHaveLength(1);
    expect(pointers[0].deepLinkUrl).toBe(
      'https://www.perplexity.ai/search/space-only-planning-notes-xyz789',
    );
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
        return jsonResponse(loadFixture('list.hits.stub.json'));
      }
      if (String(url).includes('/rest/spaces')) {
        return jsonResponse(loadFixture('spaces.stub.json'));
      }
      return new Response('not found', { status: 404 });
    });

    const outcome = await searchPerplexity({ query: 'tomato', fetchImpl });
    expect(outcome.status).toBe('ready');
    expect(outcome.capability).toBe('title-match');
    expect(outcome.results.length).toBeGreaterThan(0);
    expect(outcome.results.every((r) => r.prefillSupported)).toBe(true);
    expect(outcome.results[0].deepLinkUrl).toMatch(/^https:\/\/www\.perplexity\.ai\/search\//);
    expect(JSON.stringify(outcome.results)).not.toMatch(/secret body/i);

    await searchPerplexity({ query: 'tomato', fetchImpl });
    const listCalls = fetchImpl.mock.calls.filter((c) =>
      String(c[0]).includes('/rest/thread/list_ask_threads'),
    );
    expect(listCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('returns empty for zero hits (not unavailable)', async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).includes('/rest/thread/list_ask_threads')) {
        return jsonResponse(loadFixture('list.empty.stub.json'));
      }
      if (String(url).includes('/rest/spaces')) {
        return jsonResponse(loadFixture('spaces.stub.json'));
      }
      return new Response('not found', { status: 404 });
    });

    const outcome = await searchPerplexity({ query: 'zzzz-no-hit', fetchImpl });
    expect(outcome.status).toBe('empty');
    expect(outcome.results).toEqual([]);
    expect(outcome.capability).toBe('title-match');
  });

  it('merges Spaces ladder A hits when C is empty', async () => {
    const spaceThread = {
      title: 'Space-only planning notes',
      slug: 'space-only-planning-notes-xyz789',
      last_query_datetime: '2024-06-01T08:30:00.000Z',
      uuid: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    };

    const fetchImpl = vi.fn(async (url, init) => {
      if (String(url).includes('/rest/thread/list_ask_threads')) {
        const body = JSON.parse(String(init?.body ?? '{}'));
        if (body.collection_uuid || body.space_uuid || body.filter_collection_uuid) {
          return jsonResponse([spaceThread]);
        }
        return jsonResponse([]);
      }
      if (String(url).includes('/rest/spaces')) {
        return jsonResponse(loadFixture('spaces.stub.json'));
      }
      return new Response('not found', { status: 404 });
    });

    const outcome = await searchPerplexity({ query: 'Space-only', fetchImpl });
    expect(outcome.status).toBe('ready');
    expect(outcome.results.some((r) => /Space-only/i.test(r.title))).toBe(true);
  });

  it('merges DOM ladder B when endpoints return empty', async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).includes('/rest/thread/list_ask_threads')) {
        return jsonResponse([]);
      }
      if (String(url).includes('/rest/spaces')) {
        return jsonResponse({ private_spaces: [] });
      }
      return new Response('not found', { status: 404 });
    });

    const outcome = await searchPerplexity({
      query: 'Space-only',
      fetchImpl,
      getDomSpaceThreadLinks: () => [
        { slug: 'space-only-planning-notes-xyz789', title: 'Space-only planning notes' },
      ],
    });
    expect(outcome.status).toBe('ready');
    expect(outcome.results[0].deepLinkUrl).toContain('space-only-planning-notes-xyz789');
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
