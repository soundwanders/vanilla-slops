import { describe, it, expect } from 'vitest';
import { slugify } from '../utils/slugify.js';

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
});
