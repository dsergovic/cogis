import { describe, it, expect } from 'vitest';
import {
  PLATFORMS,
  PLATFORM_ORDER,
  getPlatform,
  loginRequiredCopy,
  unavailableCopy,
  FOOTNOTE_TEXT,
} from '../../extension/lib/platforms.js';

describe('platform registry', () => {
  it('PLATFORM_ORDER only lists ids present in PLATFORMS', () => {
    for (const id of PLATFORM_ORDER) {
      expect(PLATFORMS[id]).toBeDefined();
    }
  });

  it('getPlatform returns null for an unknown id', () => {
    expect(getPlatform('not-a-real-lab')).toBeNull();
  });

  it('copy helpers fall back to the raw id when a platform is unknown', () => {
    expect(loginRequiredCopy('mystery')).toContain('mystery');
    expect(unavailableCopy('mystery')).toContain('mystery');
  });

  it('exposes the capability footnote text', () => {
    expect(typeof FOOTNOTE_TEXT).toBe('string');
    expect(FOOTNOTE_TEXT.length).toBeGreaterThan(0);
  });
});
