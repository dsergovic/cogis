import { describe, it, expect } from 'vitest';
import {
  MSG,
  createSearchRequest,
  createSearchCancel,
  createResultChunk,
  createPlatformDone,
  shouldApplyChunk,
  normalizeQuery,
} from '../../extension/lib/messaging.js';

describe('createSearchRequest', () => {
  it('builds a well-formed SEARCH_REQUEST', () => {
    const msg = createSearchRequest({ requestId: 'r1', query: 'recipe' });
    expect(msg).toEqual({
      type: MSG.SEARCH_REQUEST,
      requestId: 'r1',
      query: 'recipe',
      platforms: undefined,
    });
  });

  it('throws without a requestId', () => {
    expect(() => createSearchRequest({ query: 'x' })).toThrow();
  });

  it('throws without a query string', () => {
    expect(() => createSearchRequest({ requestId: 'r1' })).toThrow();
  });
});

describe('createSearchCancel', () => {
  it('builds a well-formed SEARCH_CANCEL', () => {
    expect(createSearchCancel({ requestId: 'r1' })).toEqual({
      type: MSG.SEARCH_CANCEL,
      requestId: 'r1',
    });
  });

  it('throws without a requestId', () => {
    expect(() => createSearchCancel({})).toThrow();
  });
});

describe('createResultChunk', () => {
  it('builds a well-formed chunk', () => {
    const msg = createResultChunk({ requestId: 'r1', platform: 'chatgpt', status: 'ready' });
    expect(msg.type).toBe(MSG.SEARCH_RESULT_CHUNK);
    expect(msg.requestId).toBe('r1');
    expect(msg.platform).toBe('chatgpt');
    expect(msg.status).toBe('ready');
  });

  it('throws without required fields', () => {
    expect(() => createResultChunk({ requestId: 'r1' })).toThrow();
  });
});

describe('createPlatformDone', () => {
  it('builds a well-formed done message', () => {
    expect(createPlatformDone({ requestId: 'r1', platform: 'chatgpt', status: 'ready' })).toEqual({
      type: MSG.SEARCH_PLATFORM_DONE,
      requestId: 'r1',
      platform: 'chatgpt',
      status: 'ready',
    });
  });
});

describe('shouldApplyChunk', () => {
  it('is true only when requestId matches the active one', () => {
    expect(shouldApplyChunk('r1', { requestId: 'r1' })).toBe(true);
    expect(shouldApplyChunk('r1', { requestId: 'r2' })).toBe(false);
    expect(shouldApplyChunk(null, { requestId: 'r1' })).toBe(false);
    expect(shouldApplyChunk('r1', {})).toBe(false);
  });
});

describe('normalizeQuery', () => {
  it('trims and rejects empty/whitespace-only input', () => {
    expect(normalizeQuery('  hello  ')).toBe('hello');
    expect(normalizeQuery('   ')).toBeNull();
    expect(normalizeQuery('')).toBeNull();
    expect(normalizeQuery(42)).toBeNull();
  });
});
