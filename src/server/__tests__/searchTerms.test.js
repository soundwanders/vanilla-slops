import { describe, it, expect } from 'vitest';
import { sanitizeOrFilterValue, toOrFilterTerms } from '../utils/searchTerms.js';

describe('toOrFilterTerms — searches a visitor actually types', () => {
  // The whole point of the change is that ordinary searches behave exactly as
  // they did. Each of these is what the old `trim().split(/\s+/)` produced.
  it.each([
    ['half life',                 ['half', 'life']],
    ['Half-Life 2',               ['Half-Life', '2']],
    ['counter-strike',            ['counter-strike']],
    ['Deus Ex: Human Revolution', ['Deus', 'Ex:', 'Human', 'Revolution']],
    ["Tom Clancy's Rainbow Six",  ['Tom', "Clancy's", 'Rainbow', 'Six']],
    ['  padded  ',                ['padded']],
    ['A  B',                      ['A', 'B']],
    ['Pokemon',                   ['Pokemon']],
  ])('%s', (input, expected) => {
    expect(toOrFilterTerms(input)).toEqual(expected);
  });

  it('keeps the dots in an initialism', () => {
    // Only the first two dots of `title.ilike.value` are structural; stripping
    // them would make S.T.A.L.K.E.R. and F.E.A.R. unsearchable.
    expect(toOrFilterTerms('S.T.A.L.K.E.R.')).toEqual(['S.T.A.L.K.E.R.']);
    expect(toOrFilterTerms('F.E.A.R.')).toEqual(['F.E.A.R.']);
  });

  it('leaves non-ASCII titles alone', () => {
    expect(toOrFilterTerms('Pokémon')).toEqual(['Pokémon']);
    expect(toOrFilterTerms('日本語')).toEqual(['日本語']);
  });
});

describe('toOrFilterTerms — the comma bug', () => {
  // Production answered HTTP 500 for this search. `40,000` ended the condition
  // early and left PostgREST a bare `000%` where it expected `column.op.value`.
  // The catalogue holds at least ten Warhammer 40,000 titles, so this was a
  // live outage on a real query, not a hypothetical.
  it('splits a comma in a real title into separate terms', () => {
    expect(toOrFilterTerms('Warhammer 40,000')).toEqual(['Warhammer', '40', '000']);
  });

  it('still matches the game, because every term is a substring of the title', () => {
    const title = 'Warhammer 40,000: Rogue Trader';
    for (const term of toOrFilterTerms('Warhammer 40,000')) {
      expect(title.toLowerCase()).toContain(term.toLowerCase());
    }
  });
});

describe('toOrFilterTerms — filter-grammar characters never survive', () => {
  it.each([
    'x,app_id.eq.10',
    'x),or=(app_id.eq.10',
    'a%b',
    '((()))',
    ',,,,',
    '%%%',
    'a)b(c,d%e',
  ])('neutralises %s', (payload) => {
    expect(toOrFilterTerms(payload).join('')).not.toMatch(/[%(),]/);
  });

  it('yields nothing when the input was only syntax', () => {
    expect(toOrFilterTerms('((()))')).toEqual([]);
    expect(toOrFilterTerms(',,,,')).toEqual([]);
    expect(toOrFilterTerms('%%%')).toEqual([]);
  });

  it('replaces with a space rather than deleting, so words stay separate', () => {
    // "half,life" is two words, not the single token "halflife".
    expect(toOrFilterTerms('half,life')).toEqual(['half', 'life']);
  });
});

describe('toOrFilterTerms — absent input', () => {
  it.each([undefined, null, '', '   '])('returns [] for %s', (input) => {
    expect(toOrFilterTerms(input)).toEqual([]);
  });
});

describe('sanitizeOrFilterValue', () => {
  it('matches the rule getSearchSuggestions used inline before it was hoisted', () => {
    expect(sanitizeOrFilterValue('half,life')).toBe('half life');
    expect(sanitizeOrFilterValue('a%b(c)d')).toBe('a b c d');
    expect(sanitizeOrFilterValue('  novid  ')).toBe('novid');
  });

  it('coerces non-strings instead of throwing', () => {
    expect(sanitizeOrFilterValue(null)).toBe('');
    expect(sanitizeOrFilterValue(undefined)).toBe('');
    expect(sanitizeOrFilterValue(440)).toBe('440');
  });
});
