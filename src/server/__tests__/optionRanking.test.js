import { describe, it, expect } from 'vitest';
import { rankBrowsableOptions, BROWSE_FLOOR, BROWSE_CEILING_RATIO } from '../utils/optionRanking.js';

// Measured against the live catalogue, so a regression reads as a recognisable
// flag rather than an abstract diff.
const CATALOGUE = 2478;
const REAL = [
  { command: 'gamemode', count: 2114 },              // Linux wrapper, 85% of catalogue
  { command: 'mangohud', count: 2089 },              // Linux wrapper, 84%
  { command: '-popupwindow', count: 819 },           // Unity-generic, 33%
  { command: '-force-d3d12', count: 818 },
  { command: '-force-opengl', count: 817 },
  { command: '-windowed', count: 469 },
  { command: '-dx12', count: 399 },
  { command: '-high', count: 109 },
  { command: '-novid', count: 93 },
  { command: '-console', count: 91 },
  { command: '-obscure-one-off', count: 1 },         // long tail: 260 like this
  { command: '-two-games-only', count: 2 },
];

describe('rankBrowsableOptions — the core claim', () => {
  const ranked = rankBrowsableOptions(REAL, CATALOGUE);
  const commands = ranked.map((o) => o.command);

  it('excludes the wrappers that match most of the catalogue', () => {
    // These are the two most popular commands in the database and the two
    // worst filters in it. Popularity ranking would put them first.
    expect(commands).not.toContain('gamemode');
    expect(commands).not.toContain('mangohud');
  });

  it('excludes engine-generic flags attached to every Unity game', () => {
    expect(commands).not.toContain('-popupwindow');
    expect(commands).not.toContain('-force-d3d12');
    expect(commands).not.toContain('-force-opengl');
  });

  it('keeps the flags a person would actually reach for', () => {
    expect(commands).toContain('-novid');
    expect(commands).toContain('-console');
    expect(commands).toContain('-windowed');
    expect(commands).toContain('-high');
  });

  it('drops the long tail that returns almost nothing', () => {
    expect(commands).not.toContain('-obscure-one-off');
    expect(commands).not.toContain('-two-games-only');
  });

  it('opens with the broadest option still inside the band', () => {
    expect(commands[0]).toBe('-windowed');
  });
});

describe('rankBrowsableOptions — boundaries', () => {
  const at = (count) => rankBrowsableOptions([{ command: '-x', count }], 1000);

  it('includes an option exactly on the floor and excludes one below it', () => {
    expect(at(BROWSE_FLOOR)).toHaveLength(1);
    expect(at(BROWSE_FLOOR - 1)).toHaveLength(0);
  });

  it('includes an option exactly on the ceiling and excludes one above it', () => {
    const ceiling = Math.round(1000 * BROWSE_CEILING_RATIO);
    expect(at(ceiling)).toHaveLength(1);
    expect(at(ceiling + 1)).toHaveLength(0);
  });

  it('scales the ceiling with the catalogue rather than hardcoding it', () => {
    const opt = [{ command: '-x', count: 300 }];
    expect(rankBrowsableOptions(opt, 800)).toHaveLength(0);   // 300 > 25% of 800
    expect(rankBrowsableOptions(opt, 2000)).toHaveLength(1);  // 300 < 25% of 2000
  });
});

describe('rankBrowsableOptions — stability and ordering', () => {
  it('breaks ties by command so the list cannot reshuffle between cache warms', () => {
    // Five id Tech flags genuinely sit on 115 games each in production.
    const tied = [
      { command: '+set r_swapInterval', count: 115 },
      { command: '+set com_skipIntroVideo', count: 115 },
      { command: '+set r_fullscreen', count: 115 },
    ];
    const a = rankBrowsableOptions(tied, CATALOGUE).map((o) => o.command);
    const b = rankBrowsableOptions([...tied].reverse(), CATALOGUE).map((o) => o.command);
    expect(a).toEqual(b);
    expect(a).toEqual([...a].sort((x, y) => x.localeCompare(y)));
  });

  it('sorts by count descending', () => {
    const counts = rankBrowsableOptions(REAL, CATALOGUE).map((o) => o.count);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });

  it('honours topN', () => {
    expect(rankBrowsableOptions(REAL, CATALOGUE, 2)).toHaveLength(2);
    expect(rankBrowsableOptions(REAL, CATALOGUE, 0)).toHaveLength(0);
    expect(rankBrowsableOptions(REAL, CATALOGUE, -5)).toHaveLength(0);
  });
});

describe('rankBrowsableOptions — hostile input', () => {
  it('survives null, undefined and non-arrays', () => {
    expect(rankBrowsableOptions(null, CATALOGUE)).toEqual([]);
    expect(rankBrowsableOptions(undefined, CATALOGUE)).toEqual([]);
    expect(rankBrowsableOptions('nope', CATALOGUE)).toEqual([]);
  });

  it('drops rows with no usable command', () => {
    const out = rankBrowsableOptions(
      [null, {}, { command: '', count: 50 }, { command: null, count: 50 }, { command: '-ok', count: 50 }],
      1000
    );
    expect(out.map((o) => o.command)).toEqual(['-ok']);
  });

  it('coerces missing or junk counts to zero rather than throwing', () => {
    expect(rankBrowsableOptions([{ command: '-x' }], 1000)).toEqual([]);
    expect(rankBrowsableOptions([{ command: '-x', count: 'abc' }], 1000)).toEqual([]);
  });

  it('applies no ceiling when the catalogue size is unknown', () => {
    // Better to show something than to blank the browser because a count query
    // failed. The floor still applies.
    const out = rankBrowsableOptions([{ command: '-x', count: 9999 }], 0);
    expect(out).toHaveLength(1);
  });

  it('always returns plain, complete rows', () => {
    const [row] = rankBrowsableOptions([{ command: '-novid', count: 93, description: 'Skip intro' }], CATALOGUE);
    expect(row).toEqual({ command: '-novid', description: 'Skip intro', count: 93 });
  });

  it('does not mutate its input', () => {
    const input = [{ command: '-a', count: 50 }, { command: '-b', count: 60 }];
    const snapshot = JSON.parse(JSON.stringify(input));
    rankBrowsableOptions(input, 1000);
    expect(input).toEqual(snapshot);
  });
});
