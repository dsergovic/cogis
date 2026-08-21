import { describe, it, expect } from 'vitest';
import {
  unixTimeToIso,
  anyDateToIso,
  stripForbiddenFields,
  pointerHasForbiddenFields,
  filterPointersByTitle,
  dedupePointers,
  resolveResultHref,
  truncateTitle,
  TITLE_DISPLAY_MAX,
} from '../../extension/lib/results.js';

describe('unixTimeToIso', () => {
  it('converts unix seconds', () => {
    expect(unixTimeToIso(1700000000)).toBe(new Date(1700000000 * 1000).toISOString());
  });

  it('converts unix milliseconds', () => {
    const ms = 1700000000000;
    expect(unixTimeToIso(ms)).toBe(new Date(ms).toISOString());
  });

  it('returns null for junk input', () => {
    expect(unixTimeToIso(null)).toBeNull();
    expect(unixTimeToIso('not a number')).toBeNull();
    expect(unixTimeToIso(-5)).toBeNull();
  });
});

describe('anyDateToIso', () => {
  it('parses ISO strings', () => {
    expect(anyDateToIso('2026-01-01T00:00:00Z')).toBe('2026-01-01T00:00:00.000Z');
  });

  it('parses numeric strings as unix time', () => {
    expect(anyDateToIso('1700000000')).toBe(new Date(1700000000 * 1000).toISOString());
  });

  it('returns null for unparseable input', () => {
    expect(anyDateToIso('not a date')).toBeNull();
    expect(anyDateToIso(undefined)).toBeNull();
  });
});

describe('stripForbiddenFields / pointerHasForbiddenFields', () => {
  it('removes forbidden keys and keeps the rest', () => {
    const stripped = stripForbiddenFields({ title: 'x', token: 'secret', id: '1' });
    expect(stripped).toEqual({ title: 'x', id: '1' });
    expect(pointerHasForbiddenFields(stripped)).toBe(false);
  });

  it('flags a pointer that still carries a forbidden key', () => {
    expect(pointerHasForbiddenFields({ title: 'x', snippet: 'leaked' })).toBe(true);
  });

  it('handles non-object input safely', () => {
    expect(stripForbiddenFields(null)).toEqual({});
    expect(pointerHasForbiddenFields(null)).toBe(false);
  });
});

describe('filterPointersByTitle', () => {
  const pointers = [{ title: 'Recipe for bread' }, { title: 'Trip planning' }];

  it('filters case-insensitively by substring', () => {
    expect(filterPointersByTitle(pointers, 'recipe')).toEqual([pointers[0]]);
  });

  it('returns all pointers for an empty query', () => {
    expect(filterPointersByTitle(pointers, '')).toBe(pointers);
  });
});

describe('dedupePointers', () => {
  it('dedupes by deepLinkUrl, preserving first occurrence order', () => {
    const pointers = [
      { title: 'a', deepLinkUrl: 'https://x/1' },
      { title: 'b', deepLinkUrl: 'https://x/2' },
      { title: 'a-dup', deepLinkUrl: 'https://x/1' },
    ];
    expect(dedupePointers(pointers)).toEqual([pointers[0], pointers[1]]);
  });

  it('falls back to title when there is no deep link', () => {
    const pointers = [{ title: 'same' }, { title: 'same' }];
    expect(dedupePointers(pointers)).toEqual([pointers[0]]);
  });

  it('caps output length when max is given', () => {
    const pointers = [
      { title: 'a', deepLinkUrl: '1' },
      { title: 'b', deepLinkUrl: '2' },
      { title: 'c', deepLinkUrl: '3' },
    ];
    expect(dedupePointers(pointers, 2)).toHaveLength(2);
  });
});

describe('resolveResultHref', () => {
  it('prefers the deep link when present', () => {
    expect(
      resolveResultHref({ deepLinkUrl: 'https://deep' }, 'https://prefill', 'https://home'),
    ).toBe('https://deep');
  });

  it('falls back to prefill when supported and no deep link', () => {
    expect(resolveResultHref({ prefillSupported: true }, 'https://prefill', 'https://home')).toBe(
      'https://prefill',
    );
  });

  it('falls back to home otherwise', () => {
    expect(resolveResultHref({}, null, 'https://home')).toBe('https://home');
    expect(resolveResultHref(null, null, 'https://home')).toBe('https://home');
  });
});

describe('truncateTitle', () => {
  it('leaves a short title untouched', () => {
    expect(truncateTitle('Brussels sprouts recipe')).toBe('Brussels sprouts recipe');
  });

  it('truncates a title longer than the default cutoff with an ellipsis', () => {
    const long = 'x'.repeat(TITLE_DISPLAY_MAX + 50);
    const result = truncateTitle(long);
    expect(result.length).toBe(TITLE_DISPLAY_MAX + 1);
    expect(result.endsWith('…')).toBe(true);
  });

  it('honors a custom maxLength', () => {
    expect(truncateTitle('abcdefghij', 5)).toBe('abcde…');
  });

  it('returns an empty string for non-string input', () => {
    expect(truncateTitle(null)).toBe('');
    expect(truncateTitle(undefined)).toBe('');
  });
});
