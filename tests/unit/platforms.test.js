import { describe, it, expect } from 'vitest';
import {
  PLATFORMS,
  PLATFORM_ORDER,
  FOOTNOTE_TEXT,
  loginRequiredCopy,
  unavailableCopy,
} from '../../extension/lib/platforms.js';

describe('platforms (M2)', () => {
  it('exposes ChatGPT then Perplexity in order', () => {
    expect(PLATFORM_ORDER).toEqual(['chatgpt', 'perplexity']);
    expect(PLATFORMS.chatgpt.capability).toBe('full-text');
    expect(PLATFORMS.perplexity.capability).toBe('title-match');
    expect(PLATFORMS.chatgpt.loginUrl).toBe('https://chatgpt.com/');
    expect(PLATFORMS.perplexity.loginUrl).toBe('https://www.perplexity.ai/');
  });

  it('uses approved auth failure copy', () => {
    expect(loginRequiredCopy('chatgpt')).toBe('Please log in to ChatGPT');
    expect(unavailableCopy('chatgpt')).toBe('ChatGPT is temporarily unavailable.');
    expect(loginRequiredCopy('perplexity')).toBe('Please log in to Perplexity');
    expect(unavailableCopy('perplexity')).toBe('Perplexity is temporarily unavailable.');
  });

  it('keeps full-text footnote text', () => {
    expect(FOOTNOTE_TEXT).toBe('Some AIs do not support full-text search.');
  });
});
