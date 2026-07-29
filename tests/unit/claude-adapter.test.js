import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  buildClaudeHeaders,
  buildClaudeUrl,
  classifyClaudeApiOutcome,
  extractOrganizations,
  extractProjects,
  matchClaudePage,
  pickOrganizationId,
  projectsCoverageEstablished,
  ROOT_CONVERSATION_MAX_PAGES,
  searchClaude,
  shouldAttemptProjectsSupplement,
} from '../../extension/lib/claude-adapter.js';
import { normalizeClaudeListResponse, filterPointersByTitle } from '../../extension/lib/results.js';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '../fixtures/claude');

function loadFixture(name) {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf8'));
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Standard orgs + empty root; customize projects / project conversations. */
function orgRootFetch(overrides = {}) {
  return vi.fn(async (url) => {
    const u = String(url);
    if (
      u.includes('/api/organizations') &&
      !u.includes('chat_conversations') &&
      !u.includes('/projects')
    ) {
      return jsonResponse(loadFixture('organizations.stub.json'));
    }
    if (u.includes('chat_conversations')) {
      return jsonResponse(
        overrides.rootConversations ?? loadFixture('conversations.empty.stub.json'),
      );
    }
    if (u.includes('/projects/') && u.includes('/conversations')) {
      if (overrides.projectConversationsStatus) {
        return new Response('err', {
          status: overrides.projectConversationsStatus,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return jsonResponse(
        overrides.projectConversations ?? loadFixture('project-conversations.stub.json'),
      );
    }
    if (u.includes('/projects')) {
      if (overrides.projectsStatus) {
        return new Response('err', {
          status: overrides.projectsStatus,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return jsonResponse(overrides.projects ?? loadFixture('projects.stub.json'));
    }
    return new Response('not found', { status: 404 });
  });
}

describe('buildClaudeUrl / headers', () => {
  it('builds org-scoped conversation URL with limit/offset', () => {
    const url = buildClaudeUrl('https://claude.ai', '/api/organizations/org-1/chat_conversations', {
      limit: 20,
      offset: 40,
    });
    expect(url).toContain('/api/organizations/org-1/chat_conversations');
    expect(url).toContain('limit=20');
    expect(url).toContain('offset=40');
  });

  it('sets Accept JSON', () => {
    expect(buildClaudeHeaders()).toEqual({ Accept: 'application/json' });
  });
});

describe('classifyClaudeApiOutcome', () => {
  it('maps 401 to login_required; 403 to unavailable unless login shell', () => {
    expect(
      classifyClaudeApiOutcome({
        status: 401,
        ok: false,
        contentType: 'application/json',
        parseOk: true,
      }),
    ).toBe('login_required');

    expect(
      classifyClaudeApiOutcome({
        status: 403,
        ok: false,
        contentType: 'application/json',
        parseOk: true,
      }),
    ).toBe('unavailable');

    expect(
      classifyClaudeApiOutcome({
        status: 403,
        ok: false,
        contentType: 'application/json',
        parseOk: true,
        isLoginShell: true,
      }),
    ).toBe('login_required');

    expect(
      classifyClaudeApiOutcome({
        status: 500,
        ok: false,
        contentType: 'application/json',
        parseOk: true,
      }),
    ).toBe('unavailable');
  });

  it('treats 200 JSON as authenticated', () => {
    expect(
      classifyClaudeApiOutcome({
        status: 200,
        ok: true,
        contentType: 'application/json',
        parseOk: true,
      }),
    ).toBe('authenticated');
  });
});

describe('extractOrganizations / pickOrganizationId', () => {
  it('prefers orgs with chat capability', () => {
    const orgs = extractOrganizations(loadFixture('organizations.stub.json'));
    expect(orgs).toHaveLength(2);
    expect(pickOrganizationId(loadFixture('organizations.stub.json'))).toBe(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    );
  });
});

describe('extractProjects / matchClaudePage / coverage', () => {
  it('extracts project uuids', () => {
    const projects = extractProjects(loadFixture('projects.stub.json'));
    expect(projects).toHaveLength(1);
    expect(projects[0].uuid).toBe('cccccccc-cccc-cccc-cccc-cccccccccccc');
  });

  it('examines full page before applying match budget (I-1)', () => {
    const items = Array.from({ length: 20 }, (_, i) => ({
      uuid: `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
      name: i === 19 ? 'Unique tomato match' : `Other ${i}`,
    }));
    // Uncapped normalize + filter finds the last item even with maxMatches: 1.
    const matched = matchClaudePage(items, 'tomato', 1);
    expect(matched).toHaveLength(1);
    expect(matched[0].title).toMatch(/tomato/i);

    // Old pre-filter pattern would miss it:
    const preTruncated = filterPointersByTitle(
      normalizeClaudeListResponse(items, { max: 1 }),
      'tomato',
    );
    expect(preTruncated).toHaveLength(0);
  });

  it('documents root page ceiling constant', () => {
    expect(ROOT_CONVERSATION_MAX_PAGES).toBe(5);
  });

  it('projectsCoverageEstablished distinguishes soft-fail from empty', () => {
    expect(projectsCoverageEstablished('ok')).toBe(true);
    expect(projectsCoverageEstablished('empty_directory')).toBe(true);
    expect(projectsCoverageEstablished('skipped')).toBe(true);
    expect(projectsCoverageEstablished('directory_failed')).toBe(false);
    expect(projectsCoverageEstablished('all_fetches_failed')).toBe(false);
  });
});

describe('shouldAttemptProjectsSupplement', () => {
  it('requires remaining budget and room under max', () => {
    expect(
      shouldAttemptProjectsSupplement({
        rootHitCount: 0,
        remainingMs: 5000,
        maxResults: 20,
      }),
    ).toBe(true);
    expect(
      shouldAttemptProjectsSupplement({
        rootHitCount: 20,
        remainingMs: 5000,
        maxResults: 20,
      }),
    ).toBe(false);
    expect(
      shouldAttemptProjectsSupplement({
        rootHitCount: 0,
        remainingMs: 500,
        maxResults: 20,
      }),
    ).toBe(false);
  });
});

describe('searchClaude', () => {
  it('returns title-match hits with /chat/{uuid} deep links and strips bodies', async () => {
    const fetchImpl = orgRootFetch({
      rootConversations: loadFixture('conversations.hits.stub.json'),
      projects: [],
      projectConversations: [],
    });

    const outcome = await searchClaude({
      query: 'tomato',
      fetchImpl,
      platformBudgetMs: 8000,
    });

    expect(outcome.status).toBe('ready');
    expect(outcome.capability).toBe('title-match');
    expect(outcome.results.length).toBe(1);
    expect(outcome.results[0].title).toMatch(/tomato soup/i);
    expect(outcome.results[0].deepLinkUrl).toBe(
      'https://claude.ai/chat/11111111-1111-1111-1111-111111111111',
    );
    expect(outcome.results[0].prefillSupported).toBe(false);
    expect(JSON.stringify(outcome.results)).not.toMatch(/secret body/i);
  });

  it('finds Project-only chats via Projects enumeration', async () => {
    const outcome = await searchClaude({
      query: 'tomato',
      fetchImpl: orgRootFetch(),
      platformBudgetMs: 8000,
    });

    expect(outcome.status).toBe('ready');
    expect(outcome.results).toHaveLength(1);
    expect(outcome.results[0].title).toMatch(/Project-only/i);
    expect(outcome.results[0].deepLinkUrl).toMatch(/^https:\/\/claude\.ai\/chat\//);
  });

  it('finds Project match at end of page when residual match budget is 1 (I-1)', async () => {
    const rootHits = Array.from({ length: 19 }, (_, i) => ({
      uuid: `11111111-1111-1111-1111-${String(i).padStart(12, '0')}`,
      name: `Root tomato ${i}`,
      updated_at: '2024-07-01T00:00:00.000Z',
    }));
    const projectPage = Array.from({ length: 20 }, (_, i) => ({
      uuid: `22222222-2222-2222-2222-${String(i).padStart(12, '0')}`,
      name: i === 19 ? 'Project-only late tomato' : `Noise ${i}`,
      updated_at: '2024-07-02T00:00:00.000Z',
    }));

    const outcome = await searchClaude({
      query: 'tomato',
      fetchImpl: orgRootFetch({
        rootConversations: rootHits,
        projectConversations: projectPage,
      }),
      maxResults: 20,
      platformBudgetMs: 8000,
    });

    expect(outcome.status).toBe('ready');
    expect(outcome.results.some((r) => /Project-only late tomato/i.test(r.title))).toBe(true);
  });

  it('keeps earlier root hits when a later page fails (I-3)', async () => {
    const fetchImpl = vi.fn(async (url) => {
      const u = String(url);
      if (
        u.includes('/api/organizations') &&
        !u.includes('chat_conversations') &&
        !u.includes('/projects')
      ) {
        return jsonResponse(loadFixture('organizations.stub.json'));
      }
      if (u.includes('chat_conversations')) {
        const offset = Number(new URL(u).searchParams.get('offset') || '0');
        if (offset === 0) {
          return jsonResponse(
            Array.from({ length: 20 }, (_, i) => ({
              uuid: `aaaaaaaa-aaaa-aaaa-aaaa-${String(i).padStart(12, '0')}`,
              name: i === 0 ? 'Tomato first page' : `Other ${i}`,
              updated_at: '2024-07-03T12:00:00.000000Z',
            })),
          );
        }
        return new Response('err', {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (u.includes('/projects')) {
        return jsonResponse([]);
      }
      return new Response('not found', { status: 404 });
    });

    const outcome = await searchClaude({
      query: 'tomato',
      fetchImpl,
      platformBudgetMs: 8000,
    });

    expect(outcome.status).toBe('ready');
    expect(outcome.results[0].title).toMatch(/Tomato first page/i);
    expect(outcome.results).toHaveLength(1);
  });

  it('returns empty when no title matches and Projects coverage is established', async () => {
    const outcome = await searchClaude({
      query: 'zzzz-no-match',
      fetchImpl: orgRootFetch({
        rootConversations: loadFixture('conversations.hits.stub.json'),
        projects: [],
        projectConversations: [],
      }),
      platformBudgetMs: 8000,
    });

    expect(outcome.status).toBe('empty');
    expect(outcome.capability).toBe('title-match');
    expect(outcome.results).toEqual([]);
  });

  it('returns unavailable (not empty) when Projects directory fails and root has no matches', async () => {
    const outcome = await searchClaude({
      query: 'tomato',
      fetchImpl: orgRootFetch({
        rootConversations: [],
        projectsStatus: 500,
      }),
      platformBudgetMs: 8000,
    });

    expect(outcome.status).toBe('unavailable');
    expect(outcome.errorCode).toMatch(/projects|http_500/);
  });

  it('returns unavailable when all project conversation fetches fail', async () => {
    const outcome = await searchClaude({
      query: 'tomato',
      fetchImpl: orgRootFetch({
        rootConversations: [],
        projectConversationsStatus: 404,
      }),
      platformBudgetMs: 8000,
    });

    expect(outcome.status).toBe('unavailable');
    expect(outcome.errorCode).toBe('projects_fetches_failed');
  });

  it('returns login_required on orgs 401', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response('unauthorized', {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
    );

    const outcome = await searchClaude({ query: 'x', fetchImpl });
    expect(outcome.status).toBe('login_required');
    expect(outcome.message).toBe('Please log in to Claude');
    expect(outcome.loginUrl).toBe('https://claude.ai/login');
  });

  it('returns unavailable on orgs 403 without login shell (S2)', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response('forbidden', {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    const outcome = await searchClaude({ query: 'x', fetchImpl });
    expect(outcome.status).toBe('unavailable');
  });

  it('returns login_required when login shell is visible without fetching', async () => {
    const fetchImpl = vi.fn();
    const outcome = await searchClaude({
      query: 'x',
      fetchImpl,
      isLoginShell: () => true,
    });
    expect(outcome.status).toBe('login_required');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns unavailable on orgs 5xx', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response('err', { status: 500, headers: { 'Content-Type': 'application/json' } }),
    );
    const outcome = await searchClaude({ query: 'x', fetchImpl });
    expect(outcome.status).toBe('unavailable');
    expect(outcome.message).toBe('Claude is temporarily unavailable.');
  });

  it('stops paging when in-loop deadline is exhausted (I-5)', async () => {
    let now = 1000;
    let rootPages = 0;
    const fetchImpl = vi.fn(async (url) => {
      const u = String(url);
      if (
        u.includes('/api/organizations') &&
        !u.includes('chat_conversations') &&
        !u.includes('/projects')
      ) {
        return jsonResponse(loadFixture('organizations.stub.json'));
      }
      if (u.includes('chat_conversations')) {
        rootPages += 1;
        now += 3000; // burn budget after each page
        return jsonResponse(
          Array.from({ length: 20 }, (_, i) => ({
            uuid: `bbbbbbbb-bbbb-bbbb-bbbb-${String(rootPages).padStart(2, '0')}${String(i).padStart(10, '0')}`,
            name: `Page ${rootPages} item ${i}`,
            updated_at: '2024-07-03T12:00:00.000000Z',
          })),
        );
      }
      if (u.includes('/projects')) {
        return jsonResponse([]);
      }
      return new Response('not found', { status: 404 });
    });

    await searchClaude({
      query: 'zzzz',
      fetchImpl,
      now: () => now,
      platformBudgetMs: 4000,
    });

    expect(rootPages).toBeLessThan(ROOT_CONVERSATION_MAX_PAGES);
    expect(rootPages).toBeGreaterThanOrEqual(1);
  });

  it('does not send include_harmony_projects on projects directory (I-7)', async () => {
    const fetchImpl = orgRootFetch({ projects: [], projectConversations: [] });
    await searchClaude({ query: 'x', fetchImpl, platformBudgetMs: 8000 });
    const projectCalls = fetchImpl.mock.calls
      .map((c) => String(c[0]))
      .filter((u) => u.includes('/projects') && !u.includes('/conversations'));
    expect(projectCalls.length).toBeGreaterThan(0);
    expect(projectCalls.every((u) => !u.includes('include_harmony_projects'))).toBe(true);
  });

  it('aborts when signal already aborted', async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(
      searchClaude({ query: 'x', fetchImpl: vi.fn(), signal: ac.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
