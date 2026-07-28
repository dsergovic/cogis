import { describe, it, expect } from 'vitest';
import {
  PLATFORMS,
  PLATFORM_ORDER,
  FOOTNOTE_TEXT,
  loginRequiredCopy,
  unavailableCopy,
} from '../../extension/lib/platforms.js';

describe('platforms (M1)', () => {
  it('exposes ChatGPT as full-text only in order', () => {
    expect(PLATFORM_ORDER).toEqual(['chatgpt']);
    expect(PLATFORMS.chatgpt.capability).toBe('full-text');
    expect(PLATFORMS.chatgpt.loginUrl).toBe('https://chatgpt.com/');
  });

  it('uses approved auth failure copy', () => {
    expect(loginRequiredCopy('chatgpt')).toBe('Please log in to ChatGPT');
    expect(unavailableCopy('chatgpt')).toBe('ChatGPT is temporarily unavailable.');
  });

  it('keeps full-text footnote text', () => {
    expect(FOOTNOTE_TEXT).toBe('Some AIs do not support full-text search.');
  });
});
