import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  normalizeChatgptHit,
  normalizeChatgptSearchResponse,
  stripForbiddenFields,
  pointerHasForbiddenFields,
  chatgptDeepLink,
  unixSecondsToIso,
  FORBIDDEN_BODY_KEYS,
} from '../../extension/lib/results.js';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '../fixtures/chatgpt');

function loadFixture(name) {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf8'));
}

describe('chatgptDeepLink', () => {
  it('builds https://chatgpt.com/c/{id}', () => {
    expect(chatgptDeepLink('abc-123')).toBe('https://chatgpt.com/c/abc-123');
  });
});

describe('unixSecondsToIso', () => {
  it('converts unix seconds', () => {
    expect(unixSecondsToIso(1720000000)).toBe(new Date(1720000000 * 1000).toISOString());
  });

  it('returns null for invalid', () => {
    expect(unixSecondsToIso(null)).toBeNull();
    expect(unixSecondsToIso('nope')).toBeNull();
  });
});

describe('body / token rejection', () => {
  it('strips forbidden fields from raw lab payloads', () => {
    const stripped = stripForbiddenFields({
      id: '1',
      title: 't',
      mapping: { x: 1 },
      accessToken: 'secret',
      content: 'body',
    });
    expect(stripped).toEqual({ id: '1', title: 't' });
    for (const key of ['mapping', 'accessToken', 'content']) {
      expect(stripped).not.toHaveProperty(key);
    }
  });

  it('normalized pointers never retain forbidden keys', () => {
    const hit = normalizeChatgptHit({
      id: '11111111-1111-1111-1111-111111111111',
      title: 'Keep title only',
      update_time: 1720000000,
      mapping: { message: { content: { parts: ['nope'] } } },
      snippet: 'nope',
      accessToken: 'nope',
    });
    expect(hit).not.toBeNull();
    expect(pointerHasForbiddenFields(hit)).toBe(false);
    for (const key of FORBIDDEN_BODY_KEYS) {
      expect(hit).not.toHaveProperty(key);
    }
    expect(hit.deepLinkUrl).toBe('https://chatgpt.com/c/11111111-1111-1111-1111-111111111111');
    expect(hit.prefillSupported).toBe(false);
    expect(hit.platform).toBe('chatgpt');
  });
});

describe('normalizeChatgptSearchResponse', () => {
  it('normalizes stub hits including project-like titles and strips bodies', () => {
    const payload = loadFixture('search.hits.stub.json');
    const results = normalizeChatgptSearchResponse(payload);
    expect(results).toHaveLength(2);
    expect(results[0].title).toMatch(/tomato soup/i);
    expect(results[1].title).toMatch(/Project-only/i);
    expect(results.every((r) => r.deepLinkUrl?.startsWith('https://chatgpt.com/c/'))).toBe(true);
    expect(results.every((r) => !pointerHasForbiddenFields(r))).toBe(true);
    expect(JSON.stringify(results)).not.toMatch(/secret body/i);
  });

  it('returns empty array for empty stub', () => {
    const payload = loadFixture('search.empty.stub.json');
    expect(normalizeChatgptSearchResponse(payload)).toEqual([]);
  });

  it('caps at max results', () => {
    const items = Array.from({ length: 30 }, (_, i) => ({
      id: `id-${i}`,
      title: `T${i}`,
      update_time: 1720000000 + i,
    }));
    expect(normalizeChatgptSearchResponse({ items }, { max: 20 })).toHaveLength(20);
  });
});
