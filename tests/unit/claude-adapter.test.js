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
    title_matches: true,
  };

  it('normalizes a conversation search hit from the nested conversation object', () => {
    expect(normalizeClaudeHit(baseItem)).toEqual({
      platform: 'claude',
      title: 'Zero to One Council',
      dateIso: '2026-08-05T00:16:32.997Z',
      deepLinkUrl: 'https://claude.ai/chat/conv-1',
      prefillSupported: false,
    });
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
