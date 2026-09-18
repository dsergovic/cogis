import { describe, it, expect } from 'vitest';
import { claudeDeepLink, normalizeClaudeHit } from '../../extension/lib/claude-adapter.js';

describe('claudeDeepLink', () => {
  it('builds a /chat/{uuid} url', () => {
    expect(claudeDeepLink('conv-1')).toBe('https://claude.ai/chat/conv-1');
  });

  it('returns null for invalid input', () => {
    expect(claudeDeepLink('')).toBeNull();
    expect(claudeDeepLink('   ')).toBeNull();
    expect(claudeDeepLink(null)).toBeNull();
  });
});

describe('normalizeClaudeHit', () => {
  const baseItem = {
    conversation: {
      uuid: 'conv-1',
      name: 'Zero to One Council',
      updated_at: '2026-08-05T00:16:32.997316Z',
      project_uuid: null,
    },
    matched_snippet: 'message body content',
    // Character ranges into `conversation.name`, as verified live 2026-09-17.
    title_matches: [{ start: 0, end: 4 }],
    semantic_distance: 0.251,
    semantic_rank: 1,
    sources: ['keyword_summary', 'semantic_summary'],
  };

  it('normalizes a conversation search hit from the nested conversation object', () => {
    expect(normalizeClaudeHit(baseItem)).toEqual({
      platform: 'claude',
      title: 'Zero to One Council',
      dateIso: '2026-08-05T00:16:32.997Z',
      deepLinkUrl: 'https://claude.ai/chat/conv-1',
      prefillSupported: false,
      evidence: {
        matchedWords: ['Zero'],
        semanticDistance: 0.251,
        semanticRank: 1,
        sources: ['keyword_summary', 'semantic_summary'],
      },
    });
  });

  it('recovers matched words from title_matches ranges, and never carries a snippet', () => {
    const hit = normalizeClaudeHit({
      ...baseItem,
      conversation: { ...baseItem.conversation, name: 'GitHub vs DevOps for project management' },
      title_matches: [
        { start: 0, end: 6 },
        { start: 7, end: 9 },
        { start: 10, end: 16 },
      ],
    });
    expect(hit.evidence.matchedWords).toEqual(['GitHub', 'vs', 'DevOps']);
    expect(JSON.stringify(hit)).not.toContain('message body content');
  });

  it('reports an empty matched-word list when the title matched nothing', () => {
    const hit = normalizeClaudeHit({ ...baseItem, title_matches: [] });
    expect(hit.evidence.matchedWords).toEqual([]);
  });

  it('drops a hit missing a uuid or name', () => {
    expect(normalizeClaudeHit({ conversation: { uuid: null, name: 'x' } })).toBeNull();
    expect(normalizeClaudeHit({ conversation: { uuid: 'conv-1', name: '' } })).toBeNull();
  });

  it('never leaks the matched_snippet field onto the pointer', () => {
    const pointer = normalizeClaudeHit(baseItem);
    expect(pointer).not.toHaveProperty('matched_snippet');
    expect(pointer).not.toHaveProperty('snippet');
  });

  it('returns null for non-object input or a missing conversation field', () => {
    expect(normalizeClaudeHit(null)).toBeNull();
    expect(normalizeClaudeHit({})).toBeNull();
  });
});
