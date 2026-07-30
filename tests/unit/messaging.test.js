import { describe, it, expect } from 'vitest';
import {
  MSG,
  createSearchRequest,
  createSearchCancel,
  createResultChunk,
  createPlatformDone,
  createDebugSetPingOptIn,
  createDebugSendPing,
  shouldApplyChunk,
  normalizeQuery,
} from '../../extension/lib/messaging.js';

describe('normalizeQuery', () => {
  it('accepts a non-whitespace query', () => {
    expect(normalizeQuery('  soup  ')).toBe('soup');
  });

  it('treats empty and whitespace as empty submit', () => {
    expect(normalizeQuery('')).toBeNull();
    expect(normalizeQuery('   ')).toBeNull();
    expect(normalizeQuery('\n\t')).toBeNull();
  });
});

describe('message factories', () => {
  it('builds SEARCH_REQUEST', () => {
    const msg = createSearchRequest({ requestId: 'r1', query: 'pasta', platforms: ['chatgpt'] });
    expect(msg.type).toBe(MSG.SEARCH_REQUEST);
    expect(msg.requestId).toBe('r1');
    expect(msg.query).toBe('pasta');
    expect(msg.platforms).toEqual(['chatgpt']);
  });

  it('builds SEARCH_CANCEL', () => {
    expect(createSearchCancel({ requestId: 'r1' })).toEqual({
      type: MSG.SEARCH_CANCEL,
      requestId: 'r1',
    });
  });

  it('builds result chunk and platform done', () => {
    const chunk = createResultChunk({
      requestId: 'r1',
      platform: 'chatgpt',
      status: 'ready',
      capability: 'full-text',
      results: [],
    });
    expect(chunk.type).toBe(MSG.SEARCH_RESULT_CHUNK);
    expect(createPlatformDone({ requestId: 'r1', platform: 'chatgpt', status: 'ready' }).type).toBe(
      MSG.SEARCH_PLATFORM_DONE,
    );
  });
});

describe('debug message factories (M6)', () => {
  it('builds DEBUG_SET_PING_OPT_IN coerced to boolean', () => {
    expect(createDebugSetPingOptIn({ pingOptIn: true })).toEqual({
      type: MSG.DEBUG_SET_PING_OPT_IN,
      pingOptIn: true,
    });
    expect(createDebugSetPingOptIn({ pingOptIn: 1 })).toEqual({
      type: MSG.DEBUG_SET_PING_OPT_IN,
      pingOptIn: false,
    });
  });

  it('builds DEBUG_SEND_PING', () => {
    expect(createDebugSendPing({ platformId: 'chatgpt' })).toEqual({
      type: MSG.DEBUG_SEND_PING,
      platformId: 'chatgpt',
    });
  });
});

describe('shouldApplyChunk', () => {
  it('applies only matching active requestId', () => {
    expect(shouldApplyChunk('a', { requestId: 'a' })).toBe(true);
    expect(shouldApplyChunk('a', { requestId: 'b' })).toBe(false);
    expect(shouldApplyChunk(null, { requestId: 'a' })).toBe(false);
  });

  it('isolates in-flight cancel semantics (US-7)', () => {
    const activeAfterCancel = 'req-b';
    const lateChunkFromA = { requestId: 'req-a', type: MSG.SEARCH_RESULT_CHUNK };
    expect(shouldApplyChunk(activeAfterCancel, lateChunkFromA)).toBe(false);
  });
});
