import { describe, it, expect, vi } from 'vitest';

/**
 * The Bedrock describes its own shape in a sentence. It used to be fixed text,
 * "a handful cover thousands", which stayed on the page after rev 24 took the
 * widest option down to hundreds of games. The sentence is now worded from the
 * figures, and these pin that it can never claim more than they show.
 */

vi.mock('../config/supabaseClient.js', () => ({
  default: { from: () => { throw new Error('no database in tests'); } },
}));

const { reachSummary } = await import('../controllers/seoController.js');

const grain = (widest, options, singletons) => ({
  tiers: [{ options: [{ command: '-x', reach: widest }] }],
  options,
  singletons,
});

describe('reachSummary', () => {
  it('names the widest reach by its order of magnitude', () => {
    expect(reachSummary(grain(2400, 600, 400))).toBe('The widest cover thousands of games; most cover exactly one.');
    expect(reachSummary(grain(1200, 600, 400))).toBe('The widest cover over a thousand games; most cover exactly one.');
    expect(reachSummary(grain(836, 613, 339))).toBe('The widest cover hundreds of games; most cover exactly one.');
    expect(reachSummary(grain(40, 50, 30))).toBe('The widest cover up to 40 games; most cover exactly one.');
  });

  it('says "most" only when more than half the options reach one game', () => {
    expect(reachSummary(grain(836, 600, 300))).toBe('The widest cover hundreds of games; 300 cover exactly one.');
    expect(reachSummary(grain(836, 600, 0))).toBe('The widest cover hundreds of games.');
  });

  it('says nothing when there is nothing to describe', () => {
    expect(reachSummary({ tiers: [], options: 0, singletons: 0 })).toBe('');
    expect(reachSummary(undefined)).toBe('');
  });
});
