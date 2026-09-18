/**
 * Query parsing and title-level matching.
 *
 * Verified live on 2026-09-17 against all three API-driven labs: **no lab
 * honors quoted phrase syntax**. ChatGPT, Claude and Grok each returned
 * byte-identical result sets for `devops vs github` and `"devops vs github"`,
 * so a quoted search has to be enforced here, on our side, or not at all.
 *
 * The same probe showed why unquoted searches return so much: the labs OR
 * the terms together and a single stopword carries a match. Grok returned 60
 * conversations for `devops vs github`, most of them matching on nothing but
 * the word "vs" ("Toyota Highlander Starter Issues", "Zelda on Treadmill for
 * Cognitive Health"). Claude returned its full 25 with four "<x> vs <y>"
 * titles that share only that same stopword.
 *
 * What Cogis can verify itself stops at the title — pointer records never
 * carry body text (see FORBIDDEN_BODY_KEYS in results.js), so a phrase that
 * a lab found in a message body is unprovable here by design. That's the
 * whole reason `relevance.js` has an `unverified` tier rather than pretending
 * to a certainty it doesn't have.
 */

/**
 * Words that must never carry a match on their own. Deliberately short: this
 * is the closed class of function words plus the comparison words that made
 * `devops vs github` return coffee-brewing and smoke-detector conversations.
 * A term listed here still counts when it appears *alongside* a content word
 * — it just can't be the only evidence.
 */
export const STOPWORDS = Object.freeze(
  new Set([
    'a',
    'an',
    'and',
    'any',
    'are',
    'as',
    'at',
    'be',
    'but',
    'by',
    'can',
    'did',
    'do',
    'does',
    'for',
    'from',
    'had',
    'has',
    'have',
    'how',
    'i',
    'if',
    'in',
    'into',
    'is',
    'it',
    'its',
    'me',
    'my',
    'no',
    'not',
    'of',
    'on',
    'or',
    'our',
    'should',
    'so',
    'than',
    'that',
    'the',
    'their',
    'then',
    'there',
    'these',
    'this',
    'to',
    'v',
    'versus',
    'vs',
    'was',
    'we',
    'were',
    'what',
    'when',
    'where',
    'which',
    'who',
    'why',
    'will',
    'with',
    'would',
    'you',
    'your',
  ]),
);

/** Straight and curly double quotes, so a phrase pasted from a document still parses. */
const PHRASE_PATTERN = /"([^"]*)"|\u201c([^\u201d]*)\u201d/g;

/** Any quote character, for stripping an unbalanced leftover. */
const STRAY_QUOTES = /["\u201c\u201d]/g;

/**
 * @typedef {object} ParsedQuery
 * @property {string} raw          what the user typed, trimmed
 * @property {string} bare         quote characters removed — the string sent to the labs
 * @property {string[]} phrases    lowercased quoted phrases, in order
 * @property {string[]} terms      every lowercased token, stopwords included
 * @property {string[]} requiredTerms  `terms` minus stopwords — what a match must actually contain
 * @property {boolean} hasPhrase
 */

/**
 * Split text into comparable tokens. Keeps the characters that carry meaning
 * in this corpus (`c++`, `ci/cd` -> `ci`,`cd`, `.env`, `gpt-4`) and drops the
 * rest.
 * @param {string} text
 * @returns {string[]}
 */
export function tokenize(text) {
  if (typeof text !== 'string' || !text) return [];
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}#+._-]+/u)
    .map((t) => t.replace(/^[._-]+|[._-]+$/g, ''))
    .filter(Boolean);
}

/**
 * Collapse a string for substring comparison: lowercased, whitespace
 * normalized. Punctuation is left alone so `ci/cd` only matches `ci/cd`.
 * @param {string} text
 */
function normalizeForCompare(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse a raw input string into phrases and terms.
 *
 * Unbalanced quotes degrade to a plain search rather than erroring — a user
 * halfway through typing `"devops vs github` should still get results.
 * @param {string} raw
 * @returns {ParsedQuery}
 */
export function parseQuery(raw) {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) {
    return { raw: '', bare: '', phrases: [], terms: [], requiredTerms: [], hasPhrase: false };
  }

  const phrases = [];
  const withoutQuotes = text.replace(PHRASE_PATTERN, (_match, straight, curly) => {
    const inner = normalizeForCompare(straight ?? curly ?? '');
    if (inner) phrases.push(inner);
    return ` ${inner} `;
  });

  const bare = withoutQuotes.replace(STRAY_QUOTES, ' ').replace(/\s+/g, ' ').trim();
  const terms = tokenize(bare);
  const requiredTerms = terms.filter((t) => !STOPWORDS.has(t));

  return { raw: text, bare, phrases, terms, requiredTerms, hasPhrase: phrases.length > 0 };
}

/**
 * True when every word of `phrase` appears in `title` contiguously.
 * @param {string} title
 * @param {string} phrase
 */
export function titleContainsPhrase(title, phrase) {
  const haystack = normalizeForCompare(title);
  const needle = normalizeForCompare(phrase);
  if (!haystack || !needle) return false;
  return haystack.includes(needle);
}

/**
 * True when `title` contains `term` as a whole word or the start of one, so
 * `github` matches "GitHub Repo Tour" and `deploy` matches "Deployments",
 * but `git` does not match "legit".
 * @param {string} title
 * @param {string} term
 */
export function titleHasTerm(title, term) {
  const needle = normalizeForCompare(term);
  if (!needle) return false;
  return tokenize(title).some((token) => token === needle || token.startsWith(needle));
}

/**
 * True when the title carries every content-bearing term in the query.
 * @param {string} title
 * @param {ParsedQuery} parsed
 */
export function titleCoversTerms(title, parsed) {
  const required = parsed?.requiredTerms ?? [];
  if (!required.length) return false;
  return required.every((term) => titleHasTerm(title, term));
}

/**
 * The string to hand `withTextFragment` for scroll-to-highlight on arrival.
 * A quoted search highlights the phrase itself; everything else falls back to
 * the query with its quote characters stripped, so a stray `"` never ends up
 * in the URL fragment.
 * @param {ParsedQuery} parsed
 * @returns {string}
 */
export function highlightTarget(parsed) {
  if (parsed?.phrases?.length) return parsed.phrases[0];
  return parsed?.bare ?? '';
}
