import { describe, it, expect } from 'vitest';
import { GRAIN_TIERS, groupIntoTiers } from '../utils/grainTiers.js';

const rows = (...reaches) => reaches.map((n, i) => ({ command: `-flag${i}`, reach: n }));

describe('groupIntoTiers', () => {
  it('places an option in exactly one tier', () => {
    const tiers = groupIntoTiers(rows(2366, 500, 50, 5, 1));
    const placed = tiers.flatMap((t) => t.options);
    expect(placed).toHaveLength(5);
    expect(new Set(placed.map((o) => o.command)).size).toBe(5);
  });

  it('orders tiers coarsest first, so the bed reads top-down', () => {
    const tiers = groupIntoTiers(rows(2366, 500, 50, 5, 1));
    expect(tiers.map((t) => t.key)).toEqual(['1000+', '100-999', '10-99', '2-9', '1']);
  });

  it.each([
    [2366, '1000+'], [1000, '1000+'],
    [999, '100-999'], [100, '100-999'],
    [99, '10-99'], [10, '10-99'],
    [9, '2-9'], [2, '2-9'],
    [1, '1'],
  ])('reach %i lands in tier %s', (reach, key) => {
    const tiers = groupIntoTiers(rows(reach));
    expect(tiers).toHaveLength(1);
    expect(tiers[0].key).toBe(key);
  });

  it('drops empty tiers rather than rendering a labelled layer with nothing in it', () => {
    const tiers = groupIntoTiers(rows(2366, 1));
    expect(tiers.map((t) => t.key)).toEqual(['1000+', '1']);
  });

  it('excludes an option with no reach', () => {
    // getCatalogGrain filters these out, but the boundary is asserted here too:
    // an option linked only to hidden duplicate games has no reach the site can
    // show, and the lowest tier starts at 1 rather than 0 to say so.
    const tiers = groupIntoTiers(rows(0, -1));
    expect(tiers).toHaveLength(0);
  });

  it('returns nothing for empty or malformed input instead of throwing', () => {
    expect(groupIntoTiers([])).toEqual([]);
    expect(groupIntoTiers(null)).toEqual([]);
    expect(groupIntoTiers(undefined)).toEqual([]);
    expect(groupIntoTiers([null, undefined])).toEqual([]);
  });

  it('covers every reach from 1 upward with no gap between tiers', () => {
    // A gap would silently drop options from the page. Walk the boundaries.
    for (const n of [1, 2, 9, 10, 99, 100, 999, 1000, 100000]) {
      expect(groupIntoTiers(rows(n))).toHaveLength(1);
    }
  });

  it('uses an unbounded top tier so growth cannot outrun it', () => {
    // The catalogue grows; the widest option must always have somewhere to go.
    const top = GRAIN_TIERS[0];
    expect(top.max).toBeNull();
    expect(groupIntoTiers(rows(50000))[0].key).toBe('1000+');
  });
});
