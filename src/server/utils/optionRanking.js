/**
 * @fileoverview Chooses which launch options are worth offering as a browse
 * list, and in what order.
 *
 * Ranking by raw popularity is the obvious approach and it is wrong here, in a
 * way that is measurable rather than aesthetic. The most-used commands in this
 * catalogue are the ones nobody chose per game: `gamemoderun %command%` and
 * `mangohud %command%` are Linux wrappers sitting on ~85% of it, and the six
 * `-force-*` Unity flags on ~33% each because they are emitted for every Unity
 * title. Filtering by any of
 * them removes almost nothing, so a popularity-sorted list opens with its own
 * least useful entries. Meanwhile `-novid`, on under 4% of games, is exactly
 * what someone playing a Source game came for.
 *
 * So the useful band is bounded at both ends: above the ceiling an option does
 * not narrow anything, below the floor it returns so few games that typing the
 * game's name would have been faster. Roughly 350 commands sit below that floor
 * — they stay reachable by search, they just do not earn a chip.
 *
 * Kept free of the Supabase client so it is importable from a test.
 */

/** Options on fewer games than this are reachable by typing, not by browsing. */
export const BROWSE_FLOOR = 5;

/** Above this share of the catalogue, an option stops being a filter. */
export const BROWSE_CEILING_RATIO = 0.25;

/**
 * @param {{command: string, description?: string, count: number}[]} options
 * @param {number} totalGames size of the catalogue, for the proportional ceiling
 * @param {number} [topN]
 * @returns {{command: string, description: string, count: number}[]}
 */
export function rankBrowsableOptions(options, totalGames, topN = 24) {
  if (!Array.isArray(options)) return [];

  const ceiling = Math.round((Number(totalGames) || 0) * BROWSE_CEILING_RATIO);

  return options
    .filter((o) => o && typeof o.command === 'string' && o.command.length > 0)
    .map((o) => ({
      command: o.command,
      description: o.description || '',
      count: Number(o.count) || 0,
    }))
    .filter((o) => o.count >= BROWSE_FLOOR && (!ceiling || o.count <= ceiling))
    // Ties are everywhere — the five id Tech flags all sit on 115 games — and
    // without a tie-break the list reshuffles each time the cache warms, which
    // reads as the page changing under you. Command order is arbitrary but
    // stable, which is what a browse list needs.
    .sort((a, b) => b.count - a.count || a.command.localeCompare(b.command))
    .slice(0, Math.max(0, topN));
}
