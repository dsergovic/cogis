import { describe, it, expect } from 'vitest';
import { toggleDisabledPlatform } from '../../extension/lib/settings.js';

const ALL = ['chatgpt', 'claude', 'perplexity', 'gemini', 'grok'];

describe('toggleDisabledPlatform', () => {
  it('disables an enabled platform', () => {
    expect(toggleDisabledPlatform(ALL, [], 'gemini')).toEqual(['gemini']);
  });

  it('re-enables a disabled platform', () => {
    expect(toggleDisabledPlatform(ALL, ['gemini'], 'gemini')).toEqual([]);
  });

  it('refuses to disable the last enabled platform', () => {
    const disabled = ALL.filter((id) => id !== 'grok');
    expect(toggleDisabledPlatform(ALL, disabled, 'grok')).toEqual(disabled);
  });

  it('allows re-enabling even when it would be the only one enabled first', () => {
    const disabled = ALL.filter((id) => id !== 'grok');
    expect(toggleDisabledPlatform(ALL, disabled, 'gemini')).toEqual(
      disabled.filter((id) => id !== 'gemini'),
    );
  });

  it('ignores stale disabled ids not in the current platform list', () => {
    expect(toggleDisabledPlatform(ALL, ['old-lab'], 'gemini')).toEqual(['gemini']);
  });
});
