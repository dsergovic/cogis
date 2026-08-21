import { describe, it, expect } from 'vitest';
import {
  extractGeminiId,
  geminiDeepLink,
  parseGeminiDisplayDate,
  normalizeGeminiHit,
} from '../../extension/lib/gemini-adapter.js';

describe('extractGeminiId', () => {
  it('extracts the id from an /app/{id} href', () => {
    expect(extractGeminiId('/app/8a0f1d0dad3e529f')).toBe('8a0f1d0dad3e529f');
  });

  it('returns null for hrefs without an /app/ segment', () => {
    expect(extractGeminiId('/search')).toBeNull();
    expect(extractGeminiId(null)).toBeNull();
  });
});

describe('geminiDeepLink', () => {
  it('builds an /app/{id} url', () => {
    expect(geminiDeepLink('abc123')).toBe('https://gemini.google.com/app/abc123');
  });

  it('returns null for invalid input', () => {
    expect(geminiDeepLink('')).toBeNull();
    expect(geminiDeepLink(null)).toBeNull();
  });
});

describe('parseGeminiDisplayDate', () => {
  const now = new Date('2026-08-21T12:00:00Z');

  it('parses "Today" and "Yesterday"', () => {
    expect(parseGeminiDisplayDate('Today', now)).toBe('2026-08-21T00:00:00.000Z');
    expect(parseGeminiDisplayDate('Yesterday', now)).toBe('2026-08-20T00:00:00.000Z');
  });

  it('parses a month/day/year date', () => {
    expect(parseGeminiDisplayDate('May 2, 2025', now)).toBe('2025-05-02T00:00:00.000Z');
  });

  it('parses a year-less month/day as the current year', () => {
    expect(parseGeminiDisplayDate('Jul 3', now)).toBe('2026-07-03T00:00:00.000Z');
  });

  it('rolls a year-less date more than a day in the future back to last year', () => {
    // "Dec 25" relative to an August "now" would be in the future this year.
    expect(parseGeminiDisplayDate('Dec 25', now)).toBe('2025-12-25T00:00:00.000Z');
  });

  it('returns null for unrecognized formats', () => {
    expect(parseGeminiDisplayDate('a while ago', now)).toBeNull();
    expect(parseGeminiDisplayDate('', now)).toBeNull();
    expect(parseGeminiDisplayDate(null, now)).toBeNull();
  });
});

describe('normalizeGeminiHit', () => {
  it('normalizes a scraped result', () => {
    expect(
      normalizeGeminiHit({
        title: 'Changing Your GitHub Username',
        dateText: 'Jul 3',
        href: '/app/8a0f1d0dad3e529f',
      }),
    ).toEqual({
      platform: 'gemini',
      title: 'Changing Your GitHub Username',
      dateIso: parseGeminiDisplayDate('Jul 3'),
      deepLinkUrl: 'https://gemini.google.com/app/8a0f1d0dad3e529f',
      prefillSupported: false,
    });
  });

  it('drops a hit missing an id or title', () => {
    expect(normalizeGeminiHit({ title: 'x', href: '/search' })).toBeNull();
    expect(normalizeGeminiHit({ title: '', href: '/app/abc' })).toBeNull();
  });

  it('never leaks a snippet field onto the pointer', () => {
    const pointer = normalizeGeminiHit({
      title: 'x',
      href: '/app/abc',
      snippet: 'body content',
    });
    expect(pointer).not.toHaveProperty('snippet');
  });

  it('returns null for non-object input', () => {
    expect(normalizeGeminiHit(null)).toBeNull();
  });
});
