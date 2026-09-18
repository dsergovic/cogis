import { describe, it, expect } from 'vitest';
import {
  parseQuery,
  tokenize,
  titleContainsPhrase,
  titleHasTerm,
  titleCoversTerms,
  highlightTarget,
  STOPWORDS,
} from '../../extension/lib/query.js';

describe('tokenize', () => {
  it('lowercases and splits on punctuation', () => {
    expect(tokenize('DevOps vs GitHub')).toEqual(['devops', 'vs', 'github']);
  });

  it('keeps characters that carry meaning in developer queries', () => {
    expect(tokenize('c++ and .env')).toEqual(['c++', 'and', 'env']);
    expect(tokenize('gpt-4 turbo')).toEqual(['gpt-4', 'turbo']);
  });

  it('returns an empty array for junk input', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize(null)).toEqual([]);
    expect(tokenize('   --- ')).toEqual([]);
  });
});

describe('parseQuery', () => {
  it('parses a plain query into terms, dropping stopwords from requiredTerms', () => {
    const parsed = parseQuery('devops vs github');
    expect(parsed.bare).toBe('devops vs github');
    expect(parsed.phrases).toEqual([]);
    expect(parsed.terms).toEqual(['devops', 'vs', 'github']);
    expect(parsed.requiredTerms).toEqual(['devops', 'github']);
    expect(parsed.hasPhrase).toBe(false);
  });

  it('extracts a quoted phrase and strips the quotes from what labs receive', () => {
    const parsed = parseQuery('"devops vs github"');
    expect(parsed.hasPhrase).toBe(true);
    expect(parsed.phrases).toEqual(['devops vs github']);
    // No lab honors quote syntax, so they get the bare string.
    expect(parsed.bare).toBe('devops vs github');
  });

  it('handles curly quotes pasted from a document', () => {
    const parsed = parseQuery('“devops vs github”');
    expect(parsed.phrases).toEqual(['devops vs github']);
    expect(parsed.bare).toBe('devops vs github');
  });

  it('supports a phrase alongside loose terms', () => {
    const parsed = parseQuery('"ci cd" pipeline');
    expect(parsed.phrases).toEqual(['ci cd']);
    expect(parsed.requiredTerms).toEqual(['ci', 'cd', 'pipeline']);
  });

  it('supports more than one phrase', () => {
    const parsed = parseQuery('"text fragment" and "deep link"');
    expect(parsed.phrases).toEqual(['text fragment', 'deep link']);
  });

  it('degrades an unbalanced quote to a plain search', () => {
    const parsed = parseQuery('"devops vs github');
    expect(parsed.hasPhrase).toBe(false);
    expect(parsed.bare).toBe('devops vs github');
  });

  it('ignores empty quotes', () => {
    const parsed = parseQuery('"" github');
    expect(parsed.hasPhrase).toBe(false);
    expect(parsed.bare).toBe('github');
  });

  it('returns an empty parse for blank input', () => {
    expect(parseQuery('   ')).toEqual({
      raw: '',
      bare: '',
      phrases: [],
      terms: [],
      requiredTerms: [],
      hasPhrase: false,
    });
    expect(parseQuery(undefined).hasPhrase).toBe(false);
  });

  it('leaves requiredTerms empty when the query is all stopwords', () => {
    const parsed = parseQuery('what is the');
    expect(parsed.terms.length).toBe(3);
    expect(parsed.requiredTerms).toEqual([]);
  });

  it('treats the comparison words that caused the noise as stopwords', () => {
    expect(STOPWORDS.has('vs')).toBe(true);
    expect(STOPWORDS.has('versus')).toBe(true);
    expect(STOPWORDS.has('github')).toBe(false);
  });
});

describe('titleContainsPhrase', () => {
  it('matches a contiguous phrase case-insensitively', () => {
    expect(titleContainsPhrase('GitHub vs DevOps for project management', 'github vs devops')).toBe(
      true,
    );
  });

  it('rejects the same words in a different order', () => {
    expect(titleContainsPhrase('GitHub vs DevOps for project management', 'devops vs github')).toBe(
      false,
    );
  });

  it('normalizes runs of whitespace', () => {
    expect(titleContainsPhrase('GitHub   vs   DevOps', 'github vs devops')).toBe(true);
  });

  it('returns false for empty input', () => {
    expect(titleContainsPhrase('', 'github')).toBe(false);
    expect(titleContainsPhrase('GitHub', '')).toBe(false);
  });
});

describe('titleHasTerm', () => {
  it('matches a whole word or the start of one', () => {
    expect(titleHasTerm('Philaphonic GitHub Repo Tour', 'github')).toBe(true);
    expect(titleHasTerm('Deployments / State Taxes', 'deploy')).toBe(true);
  });

  it('does not match mid-word', () => {
    expect(titleHasTerm('That was legit', 'git')).toBe(false);
  });
});

describe('titleCoversTerms', () => {
  it('is true only when every content term appears', () => {
    const parsed = parseQuery('devops vs github');
    expect(titleCoversTerms('GitHub vs DevOps for project management', parsed)).toBe(true);
    expect(titleCoversTerms('Philaphonic GitHub Repo Tour', parsed)).toBe(false);
  });

  it('is false when the query has no content terms to demand', () => {
    expect(titleCoversTerms('Anything at all', parseQuery('what is the'))).toBe(false);
  });
});

describe('highlightTarget', () => {
  it('prefers the quoted phrase', () => {
    expect(highlightTarget(parseQuery('"text fragment" stuff'))).toBe('text fragment');
  });

  it('falls back to the bare query so quotes never reach the URL fragment', () => {
    expect(highlightTarget(parseQuery('devops vs github'))).toBe('devops vs github');
    expect(highlightTarget(parseQuery('"unbalanced'))).toBe('unbalanced');
  });

  it('tolerates a missing parse', () => {
    expect(highlightTarget(null)).toBe('');
  });
});
