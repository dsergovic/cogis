import { describe, it, expect } from 'vitest';
import {
  perplexityDeepLink,
  perplexityPrefillUrl,
  normalizePerplexityHit,
} from '../../extension/lib/perplexity-adapter.js';

describe('perplexityDeepLink', () => {
  it('builds a /search/{slug} url', () => {
    expect(perplexityDeepLink('thread-1')).toBe('https://www.perplexity.ai/search/thread-1');
  });

  it('returns null for invalid input', () => {
    expect(perplexityDeepLink('')).toBeNull();
    expect(perplexityDeepLink('   ')).toBeNull();
    expect(perplexityDeepLink(null)).toBeNull();
  });
});

describe('perplexityPrefillUrl', () => {
  it('builds a ?q= prefill url', () => {
    expect(perplexityPrefillUrl('brussels sprouts')).toBe(
      'https://www.perplexity.ai/search?q=brussels+sprouts',
    );
  });
});

describe('normalizePerplexityHit', () => {
  const threadEdge = {
    highlightQuery: 'cogis',
    node: {
      title: 'Cogis backlog review',
      subtitle: 'message body snippet content',
      type: 'SEARCH_THREAD',
      object: {
        __typename: 'Thread',
        id: 'TH:abc',
        threadSlug: 'thread-1',
        updatedAt: '2026-08-01T22:19:03.084905Z',
      },
    },
  };

  it('normalizes a Thread hit regardless of the type tag', () => {
    expect(normalizePerplexityHit(threadEdge)).toEqual({
      platform: 'perplexity',
      title: 'Cogis backlog review',
      dateIso: '2026-08-01T22:19:03.084Z',
      deepLinkUrl: 'https://www.perplexity.ai/search/thread-1',
      prefillSupported: true,
    });
  });

  it('accepts a COMPUTER_TASK entry, since it is also a Thread object', () => {
    const computerTask = {
      node: { ...threadEdge.node, type: 'COMPUTER_TASK' },
    };
    expect(normalizePerplexityHit(computerTask)?.title).toBe('Cogis backlog review');
  });

  it('skips PROJECT/ThreadSpace entries — a container, not a conversation', () => {
    const projectEdge = {
      node: {
        title: 'Cogis',
        type: 'PROJECT',
        object: { __typename: 'ThreadSpace', spaceUuid: 'space-1', projectSlug: 'cogis-x' },
      },
    };
    expect(normalizePerplexityHit(projectEdge)).toBeNull();
  });

  it('never leaks the subtitle field onto the pointer', () => {
    const pointer = normalizePerplexityHit(threadEdge);
    expect(pointer).not.toHaveProperty('subtitle');
  });

  it('drops a hit missing a thread slug or title', () => {
    expect(
      normalizePerplexityHit({
        node: { title: 'x', object: { __typename: 'Thread', threadSlug: null } },
      }),
    ).toBeNull();
    expect(
      normalizePerplexityHit({
        node: { title: '', object: { __typename: 'Thread', threadSlug: 'thread-1' } },
      }),
    ).toBeNull();
  });

  it('returns null for non-object or missing node input', () => {
    expect(normalizePerplexityHit(null)).toBeNull();
    expect(normalizePerplexityHit({})).toBeNull();
  });
});
