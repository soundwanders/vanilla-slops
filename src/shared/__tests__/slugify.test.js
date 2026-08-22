import { describe, it, expect } from 'vitest';
import { slugify } from '../slugify.js';

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Team Fortress 2')).toBe('team-fortress-2');
  });

  it('strips trademark and special symbols', () => {
    expect(slugify('The Saboteur™')).toBe('the-saboteur');
    expect(slugify('STAR WARS™ Jedi Knight - Jedi Academy™')).toBe('star-wars-jedi-knight-jedi-academy');
  });

  it('collapses runs of non-alphanumerics into a single hyphen', () => {
    expect(slugify("Disciples II: Gallean's Return")).toBe('disciples-ii-gallean-s-return');
  });

  it('trims leading and trailing hyphens', () => {
    expect(slugify('  -Hello-  ')).toBe('hello');
  });

  it('strips diacritics', () => {
    expect(slugify('Pokémon')).toBe('pokemon');
  });

  it('never returns an empty string', () => {
    expect(slugify('™®©')).toBe('game');
    expect(slugify('')).toBe('game');
    expect(slugify(null)).toBe('game');
  });

  it('is deterministic (same input → same output) so redirects are stable', () => {
    const title = 'Half-Life: Blue Shift';
    expect(slugify(title)).toBe(slugify(title));
    expect(slugify(title)).toBe('half-life-blue-shift');
  });

  // slop-scraper rev 17 §7i: Steam names arrive padded — trailing spaces,
  // doubled internal spaces, and characters that occupy no visual width (the
  // zero-width space, and the HANGUL filler guide authors use to fake table
  // alignment). They render as nothing, so a padded title looks correct in
  // every interface a human would inspect it in. The write side normalises on
  // save now, but the slug still has to survive a stored title being cleaned
  // up underneath us: it is what /game/:app_id/:slug settles on, and a slug
  // that moves sends every existing link through a 301 and strands anything
  // cached against the old URL.
  // Escapes rather than literals — a test about invisible characters is
  // unreadable if the characters are invisible in the source.
  it('gives a padded title the same slug as its normalised form', () => {
    // app_id 2085000, the real rev 17 case: a trailing space was removed.
    expect(slugify('SaGa Emerald Beyond ')).toBe(slugify('SaGa Emerald Beyond'));
    expect(slugify('SaGa Emerald Beyond ')).toBe('saga-emerald-beyond');

    // Padding at the edges, or a doubled separator where one already exists.
    expect(slugify('\u200BTeam Fortress 2\u200B')).toBe('team-fortress-2'); // zero-width space
    expect(slugify('Team Fortress 2\u3164\u3164')).toBe('team-fortress-2'); // HANGUL filler
    expect(slugify('Team  Fortress  2')).toBe('team-fortress-2');           // doubled spaces
  });

  // The guarantee above covers padding, and it stops there. An invisible
  // character wedged inside a word is not padding — it separates, and the slug
  // does change. Pinned so the limit is explicit rather than assumed: a title
  // like this would need fixing at the write path, not absorbed here.
  it('does not absorb an invisible character wedged mid-word', () => {
    expect(slugify('Half\u200BLife')).toBe('half-life');
    expect(slugify('HalfLife')).toBe('halflife');
  });
});
