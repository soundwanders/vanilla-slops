import { describe, it, expect } from 'vitest';
import { normalizeForMatch, dedupeKey } from '../utils/searchNormalize.js';

describe('normalizeForMatch — folding a string to its comparable form', () => {
  it.each([
    ['Garry\'s Mod',              'garry s mod'],
    ['Half-Life 2: Episode One',  'half life 2 episode one'],
    ['Team Fortress 2',           'team fortress 2'],
    ['DOOM™',                'doom'],
    ['Pokémon',              'pokemon'],
    ['  padded  ',                'padded'],
    ['A  B',                      'a b'],
  ])('%s', (input, expected) => {
    expect(normalizeForMatch(input)).toBe(expected);
  });

  it('folds the whole padding class onto one value', () => {
    // The shape slop-scraper's rev 17 fixed upstream: 'SaGa Emerald Beyond '
    // carried a trailing space. These must not be distinguishable here.
    const forms = [
      'SaGa Emerald Beyond',
      'SaGa Emerald Beyond ',
      ' SaGa Emerald Beyond',
      'SaGa  Emerald  Beyond',
      'SaGa Emerald Beyond\u200b',
    ];
    const folded = new Set(forms.map(normalizeForMatch));
    expect(folded).toEqual(new Set(['saga emerald beyond']));
  });

  it('does not fold a character Unicode calls a letter, even an invisible one', () => {
    // HANGUL FILLER (U+3164) renders as nothing but has category Lo, so the
    // fold keeps it and two titles differing only by it stay distinct. That is
    // the correct boundary rather than a gap: the same category holds ZWNJ and
    // ZWJ, which slop-scraper's rev 18 deliberately stopped stripping because
    // they change how Persian, Arabic and Indic text renders. A rule that
    // erased invisible letters would have to erase those too.
    //
    // Format characters — ZWSP and friends, category Cf — ARE folded, which is
    // why the padding test above covers U+200B and this one does not.
    expect(normalizeForMatch('Halo\u3164')).not.toBe('halo');
    expect(normalizeForMatch('Halo\u200b')).toBe('halo');
  });

  it('survives NFKD decomposition of Japanese voiced kana', () => {
    // NFKD splits ポ into ホ + U+309A. Stripping only the Latin combining block
    // leaves that mark stranded, and the fold would turn it into a space —
    // rewriting the title as 'ホ ケモン'. Recomposing with NFC prevents it.
    expect(normalizeForMatch('ポケモン')).toBe('ポケモン');
    expect(normalizeForMatch('ガンダム')).toBe('ガンダム');
  });

  it('keeps letters that are not ASCII rather than erasing them', () => {
    // A fold to [a-z0-9] would return '' for all three, which is the collision
    // this function exists to avoid.
    expect(normalizeForMatch('原神')).toBe('原神');
    expect(normalizeForMatch('ЗАРЯ')).toBe('заря');
    expect(normalizeForMatch('ポケモン')).toBe('ポケモン');
  });

  it('strips the punctuation that separates a typo from its target', () => {
    // The reason the fuzzy tier can reach Garry's Mod from `garys mod`:
    // folded, the two are one edit apart instead of two.
    expect(normalizeForMatch("Garry's Mod")).toBe('garry s mod');
    expect(normalizeForMatch('garys mod')).toBe('garys mod');
  });

  it('handles nullish input without throwing', () => {
    expect(normalizeForMatch(null)).toBe('');
    expect(normalizeForMatch(undefined)).toBe('');
    expect(normalizeForMatch('')).toBe('');
  });
});

describe('dedupeKey — the same fold, minus the collision bucket', () => {
  it('matches normalizeForMatch whenever that produces anything', () => {
    for (const title of ['Portal 2', 'Pokémon', '原神', 'Garry\'s Mod']) {
      expect(dedupeKey(title)).toBe(normalizeForMatch(title));
    }
  });

  it('keeps distinct titles distinct when the fold empties them', () => {
    // Titles made entirely of punctuation fold to ''. Keyed on that, every one
    // of them would collapse onto every other and the dropdown would show one
    // entry where it should show several. slop-scraper's rev 18 stopped
    // flattening titles upstream, so this population can only grow.
    expect(dedupeKey('!!!')).toBe('!!!');
    expect(dedupeKey('???')).toBe('???');
    expect(dedupeKey('!!!')).not.toBe(dedupeKey('???'));
  });

  it('still collapses padding around a fold-to-empty title', () => {
    expect(dedupeKey('  !!!  ')).toBe(dedupeKey('!!!'));
  });

  it('handles nullish input without throwing', () => {
    expect(dedupeKey(null)).toBe('');
    expect(dedupeKey(undefined)).toBe('');
  });
});
