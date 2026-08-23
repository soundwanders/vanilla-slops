import { describe, it, expect } from 'vitest';
import SlopSearch from '../js/ui/search.js';

/**
 * Regression tests for typeahead match highlighting.
 *
 * Bug: highlightMatch built `new RegExp('(' + query + ')')` from the raw query.
 * A query containing a regex metacharacter either threw or matched the wrong
 * thing, and the throw was the worse half — renderSuggestions is called inside
 * fetchSuggestions' try block, so `c++` did not mis-highlight, it silently
 * removed the entire dropdown and logged to a console nobody was watching.
 *
 * escapeRegExp is pure. highlightMatch needs escapeHtml, which reaches for the
 * DOM, so the fake instance supplies a plain-string equivalent — the same
 * approach SlopSearchFilters.test.js uses.
 */

const escapeHtml = (text) =>
  String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const instance = {
  escapeHtml,
  escapeRegExp: SlopSearch.prototype.escapeRegExp,
};

const highlight = (text, query) =>
  SlopSearch.prototype.highlightMatch.call(instance, text, query);

describe('SlopSearch.escapeRegExp', () => {
  it.each(['c++', '[test', 's.t.a.l.k.e.r.', 'a*b', '(paren', '^caret', 'back\\slash', '{brace'])(
    'compiles %s as a literal instead of throwing',
    (query) => {
      const pattern = SlopSearch.prototype.escapeRegExp.call(instance, query);
      expect(() => new RegExp(`(${pattern})`, 'gi')).not.toThrow();
      expect(new RegExp(`(${pattern})`, 'gi').test(query)).toBe(true);
    }
  );

  it('handles nullish input without throwing', () => {
    expect(SlopSearch.prototype.escapeRegExp.call(instance, null)).toBe('');
    expect(SlopSearch.prototype.escapeRegExp.call(instance, undefined)).toBe('');
  });
});

describe('SlopSearch.highlightMatch', () => {
  it('marks a plain substring match', () => {
    expect(highlight('Half-Life 2', 'half')).toBe('<mark>Half</mark>-Life 2');
  });

  it('marks every occurrence, case-insensitively', () => {
    expect(highlight('Portal Portal', 'portal')).toBe('<mark>Portal</mark> <mark>Portal</mark>');
  });

  it('does not throw on a query that is not a valid pattern', () => {
    // The regression. Before escaping, both of these threw and the caller
    // turned the throw into an empty dropdown.
    expect(() => highlight('C++ Programming', 'c++')).not.toThrow();
    expect(() => highlight('Test Game', '[test')).not.toThrow();
    expect(highlight('C++ Programming', 'c++')).toBe('<mark>C++</mark> Programming');
  });

  it('treats a dot as a dot rather than as any character', () => {
    // The quiet half of the bug: /(s.t.a.l.k.e.r.)/ matched, but so would
    // 'sBtCaDlEkFeGr!' — and a query of 'a.b' highlighted 'axb'.
    expect(highlight('S.T.A.L.K.E.R.', 's.t.a.l.k.e.r.')).toBe('<mark>S.T.A.L.K.E.R.</mark>');
    expect(highlight('axb', 'a.b')).toBe('axb');
  });

  it('escapes the text it returns', () => {
    expect(highlight('<script>', 'script')).toBe('&lt;<mark>script</mark>&gt;');
  });

  it('still matches when the query itself needs HTML escaping', () => {
    // Both sides are escaped before the pattern is built, so the '&' in the
    // query has become '&amp;' in the text too. The order matters.
    expect(highlight('Rock & Roll', '&')).toBe('Rock <mark>&amp;</mark> Roll');
  });

  it('returns escaped text unchanged when there is no query', () => {
    expect(highlight('<b>', '')).toBe('&lt;b&gt;');
  });
});
