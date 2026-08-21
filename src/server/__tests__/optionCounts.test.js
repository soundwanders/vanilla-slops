import { describe, it, expect } from 'vitest';
import { displayOptionCount, withDisplayCounts, buildPhantomMap } from '../utils/optionCounts.js';

describe('buildPhantomMap', () => {
  it('counts hidden links per game', () => {
    const map = buildPhantomMap([
      { game_app_id: 440 }, { game_app_id: 440 }, { game_app_id: 10 },
    ]);
    expect(map.get(440)).toBe(2);
    expect(map.get(10)).toBe(1);
  });

  it('survives empty, null and malformed input', () => {
    expect(buildPhantomMap([]).size).toBe(0);
    expect(buildPhantomMap(null).size).toBe(0);
    expect(buildPhantomMap([{}, { game_app_id: null }]).size).toBe(0);
  });
});

describe('displayOptionCount', () => {
  // The real numbers measured against the live database, so a regression in the
  // subtraction shows up as a recognisable game rather than an abstract diff.
  const phantoms = buildPhantomMap([
    ...Array(5).fill({ game_app_id: 440 }),   // Team Fortress 2
    ...Array(3).fill({ game_app_id: 10 }),    // Counter-Strike
    ...Array(2).fill({ game_app_id: 4000 }),  // Garry's Mod
  ]);

  it('subtracts phantom links from the advertised count', () => {
    expect(displayOptionCount({ app_id: 440, total_options_count: 28 }, phantoms)).toBe(23);
    expect(displayOptionCount({ app_id: 10, total_options_count: 29 }, phantoms)).toBe(26);
    expect(displayOptionCount({ app_id: 4000, total_options_count: 18 }, phantoms)).toBe(16);
  });

  it('leaves unaffected games exactly as they are', () => {
    // Counter-Strike 2 has no hidden links; 24 must stay 24.
    expect(displayOptionCount({ app_id: 730, total_options_count: 24 }, phantoms)).toBe(24);
  });

  it('matches app_id whether it arrives as a number or a string', () => {
    expect(displayOptionCount({ app_id: '440', total_options_count: 28 }, phantoms)).toBe(23);
  });

  it('never returns a negative count', () => {
    expect(displayOptionCount({ app_id: 440, total_options_count: 2 }, phantoms)).toBe(0);
  });

  it('falls back to the raw count when no map is supplied', () => {
    expect(displayOptionCount({ app_id: 440, total_options_count: 28 })).toBe(28);
    expect(displayOptionCount({ app_id: 440, total_options_count: 28 }, new Map())).toBe(28);
  });

  it('treats a missing or null count as zero', () => {
    expect(displayOptionCount({ app_id: 1 }, phantoms)).toBe(0);
    expect(displayOptionCount({ app_id: 1, total_options_count: null }, phantoms)).toBe(0);
    expect(displayOptionCount(null, phantoms)).toBe(0);
  });
});

describe('withDisplayCounts', () => {
  const phantoms = buildPhantomMap(Array(5).fill({ game_app_id: 440 }));

  it('adds display_options_count without disturbing total_options_count', () => {
    const [tf2] = withDisplayCounts([{ app_id: 440, title: 'TF2', total_options_count: 28 }], phantoms);
    expect(tf2.display_options_count).toBe(23);
    // The raw column has to survive: sorting and filtering are built on it.
    expect(tf2.total_options_count).toBe(28);
    expect(tf2.title).toBe('TF2');
  });

  it('does not mutate the input rows', () => {
    const input = [{ app_id: 440, total_options_count: 28 }];
    withDisplayCounts(input, phantoms);
    expect(input[0].display_options_count).toBeUndefined();
  });

  it('returns an array for non-array input', () => {
    expect(withDisplayCounts(null, phantoms)).toEqual([]);
    expect(withDisplayCounts(undefined)).toEqual([]);
  });
});
