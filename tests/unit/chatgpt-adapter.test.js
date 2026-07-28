import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  extractAccessToken,
  searchChatgpt,
  buildSearchUrls,
} from '../../extension/lib/chatgpt-adapter.js';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '../fixtures/chatgpt');

function loadFixture(name) {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf8'));
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('extractAccessToken', () => {
  it('reads accessToken from authenticated stub', () => {
    const session = loadFixture('session.authenticated.stub.json');
    expect(extractAccessToken(session)).toBe('stub_access_token_not_real');
  });

  it('returns null when logged out', () => {
    expect(extractAccessToken(loadFixture('session.logged-out.stub.json'))).toBeNull();
  });
});

describe('buildSearchUrls', () => {
  it('prefers query then q param names', () => {
    const urls = buildSearchUrls('https://chatgpt.com', 'tomato soup');
    expect(urls[0]).toContain('/backend-api/conversations/search');
    expect(urls[0]).toContain('query=tomato');
    expect(urls.some((u) => u.includes('q=tomato'))).toBe(true);
  });
});

describe('searchChatgpt', () => {
  it('returns login_required when session has no token', async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).includes('/api/auth/session')) {
        return jsonResponse(loadFixture('session.logged-out.stub.json'));
      }
      throw new Error('unexpected ' + url);
    });

    const outcome = await searchChatgpt({ query: 'x', fetchImpl });
    expect(outcome.status).toBe('login_required');
    expect(outcome.message).toMatch(/Please log in to ChatGPT/);
    expect(outcome.loginUrl).toBe('https://chatgpt.com/');
  });

  it('returns ready with full-text pointers on search hits (no cache; fresh fetch)', async () => {
    const fetchImpl = vi.fn(async (url, init) => {
      if (String(url).includes('/api/auth/session')) {
        return jsonResponse(loadFixture('session.authenticated.stub.json'));
      }
      if (String(url).includes('/backend-api/conversations/search')) {
        expect(init?.headers?.Authorization).toMatch(/^Bearer stub_access_token_not_real$/);
        return jsonResponse(loadFixture('search.hits.stub.json'));
      }
      throw new Error('unexpected ' + url);
    });

    const outcome = await searchChatgpt({ query: 'tomato', fetchImpl });
    expect(outcome.status).toBe('ready');
    expect(outcome.capability).toBe('full-text');
    expect(outcome.results.length).toBeGreaterThan(0);
    expect(JSON.stringify(outcome.results)).not.toMatch(/secret body/i);

    // No cache — second identical query invokes fetch again
    await searchChatgpt({ query: 'tomato', fetchImpl });
    const searchCalls = fetchImpl.mock.calls.filter((c) =>
      String(c[0]).includes('/backend-api/conversations/search'),
    );
    expect(searchCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('returns empty for zero hits', async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).includes('/api/auth/session')) {
        return jsonResponse(loadFixture('session.authenticated.stub.json'));
      }
      if (String(url).includes('/backend-api/conversations/search')) {
        return jsonResponse(loadFixture('search.empty.stub.json'));
      }
      throw new Error('unexpected ' + url);
    });

    const outcome = await searchChatgpt({ query: 'zzzz-no-hit', fetchImpl });
    expect(outcome.status).toBe('empty');
    expect(outcome.results).toEqual([]);
  });

  it('returns unavailable on forced 500', async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).includes('/api/auth/session')) {
        return jsonResponse(loadFixture('session.authenticated.stub.json'));
      }
      return jsonResponse({ error: 'boom' }, 500);
    });

    const outcome = await searchChatgpt({ query: 'x', fetchImpl });
    expect(outcome.status).toBe('unavailable');
    expect(outcome.message).toMatch(/temporarily unavailable/);
  });

  it('returns login_required on search 401', async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).includes('/api/auth/session')) {
        return jsonResponse(loadFixture('session.authenticated.stub.json'));
      }
      return new Response('unauthorized', { status: 401 });
    });

    const outcome = await searchChatgpt({ query: 'x', fetchImpl });
    expect(outcome.status).toBe('login_required');
  });
});
