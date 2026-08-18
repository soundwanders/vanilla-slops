import { describe, it, expect } from 'vitest';
import { mergeRelatedTiers } from '../utils/relatedGames.js';

const g = (app_id, total_options_count = 1) => ({ app_id, title: `Game ${app_id}`, total_options_count });

describe('mergeRelatedTiers', () => {
  it('keeps tier order, so engine matches lead', () => {
    const merged = mergeRelatedTiers([
      { rows: [g(1), g(2)], relation: 'engine', label: 'Source 2' },
      { rows: [g(3)], relation: 'developer', label: 'Valve' },
    ], 8);

    expect(merged.map((r) => r.app_id)).toEqual([1, 2, 3]);
    expect(merged.map((r) => r.relation)).toEqual(['engine', 'engine', 'developer']);
  });

  it('lists a game matching both signals once, under the earlier tier', () => {
    const merged = mergeRelatedTiers([
      { rows: [g(550)], relation: 'engine', label: 'Source Engine' },
      { rows: [g(550)], relation: 'developer', label: 'Valve' },
    ], 8);

    expect(merged).toHaveLength(1);
    expect(merged[0].relation).toBe('engine');
    expect(merged[0].label).toBe('Source Engine');
  });

  it('stops at the limit even when a later tier still has candidates', () => {
    const merged = mergeRelatedTiers([
      { rows: [g(1), g(2), g(3)], relation: 'engine', label: 'GoldSrc' },
      { rows: [g(4), g(5)], relation: 'developer', label: 'Valve' },
    ], 4);

    expect(merged).toHaveLength(4);
    expect(merged.map((r) => r.app_id)).toEqual([1, 2, 3, 4]);
  });

  it('tags every entry with the label its tier matched on', () => {
    const merged = mergeRelatedTiers([
      { rows: [g(1)], relation: 'engine', label: 'Unity' },
      { rows: [g(2)], relation: 'developer', label: 'Coffee Stain' },
    ], 8);

    expect(merged.find((r) => r.app_id === 1).label).toBe('Unity');
    expect(merged.find((r) => r.app_id === 2).label).toBe('Coffee Stain');
  });

  it('carries the option count through, since the link renders it', () => {
    const merged = mergeRelatedTiers([{ rows: [g(570, 18)], relation: 'engine', label: 'Source 2' }], 8);
    expect(merged[0].total_options_count).toBe(18);
  });

  it('survives an empty or missing rows array', () => {
    expect(mergeRelatedTiers([{ rows: [], relation: 'engine', label: 'X' }], 8)).toEqual([]);
    expect(mergeRelatedTiers([{ relation: 'engine', label: 'X' }], 8)).toEqual([]);
    expect(mergeRelatedTiers([], 8)).toEqual([]);
  });

  it('returns nothing when the limit is zero', () => {
    expect(mergeRelatedTiers([{ rows: [g(1)], relation: 'engine', label: 'X' }], 0)).toEqual([]);
  });
});
