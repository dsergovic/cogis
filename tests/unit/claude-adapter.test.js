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
  pickOrganizationId,
  searchClaude,
  shouldAttemptProjectsSupplement,
} from '../../extension/lib/claude-adapter.js';

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
  it('maps 401 to login_required and 5xx/HTML to unavailable', () => {
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
        status: 500,
        ok: false,
        contentType: 'application/json',
        parseOk: true,
      }),
    ).toBe('unavailable');

    expect(
      classifyClaudeApiOutcome({
        status: 200,
        ok: true,
        contentType: 'text/html',
        parseOk: false,
        isLoginShell: true,
      }),
    ).toBe('login_required');
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

describe('extractProjects', () => {
  it('extracts project uuids', () => {
    const projects = extractProjects(loadFixture('projects.stub.json'));
    expect(projects).toHaveLength(1);
    expect(projects[0].uuid).toBe('cccccccc-cccc-cccc-cccc-cccccccccccc');
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
        return jsonResponse(loadFixture('conversations.hits.stub.json'));
      }
      if (u.includes('/projects/') && u.includes('/conversations')) {
        return jsonResponse([]);
      }
      if (u.includes('/projects')) {
        return jsonResponse(loadFixture('projects.stub.json'));
      }
      return new Response('not found', { status: 404 });
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
        return jsonResponse(loadFixture('conversations.empty.stub.json'));
      }
      if (u.includes('/projects/') && u.includes('/conversations')) {
        return jsonResponse(loadFixture('project-conversations.stub.json'));
      }
      if (u.includes('/projects')) {
        return jsonResponse(loadFixture('projects.stub.json'));
      }
      return new Response('not found', { status: 404 });
    });

    const outcome = await searchClaude({
      query: 'tomato',
      fetchImpl,
      platformBudgetMs: 8000,
    });

    expect(outcome.status).toBe('ready');
    expect(outcome.results).toHaveLength(1);
    expect(outcome.results[0].title).toMatch(/Project-only/i);
    expect(outcome.results[0].deepLinkUrl).toMatch(/^https:\/\/claude\.ai\/chat\//);
  });

  it('returns empty when no title matches', async () => {
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
        return jsonResponse(loadFixture('conversations.hits.stub.json'));
      }
      if (u.includes('/projects/') && u.includes('/conversations')) {
        return jsonResponse([]);
      }
      if (u.includes('/projects')) {
        return jsonResponse([]);
      }
      return new Response('not found', { status: 404 });
    });

    const outcome = await searchClaude({
      query: 'zzzz-no-match',
      fetchImpl,
      platformBudgetMs: 8000,
    });

    expect(outcome.status).toBe('empty');
    expect(outcome.capability).toBe('title-match');
    expect(outcome.results).toEqual([]);
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

  it('aborts when signal already aborted', async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(
      searchClaude({ query: 'x', fetchImpl: vi.fn(), signal: ac.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
