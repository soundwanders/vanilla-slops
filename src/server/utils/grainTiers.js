/**
 * @fileoverview Grain sizes for the /catalog page.
 *
 * The page draws the option vocabulary as a graded bed: a few options reach
 * thousands of games, most reach exactly one. Sorting them into reach tiers is
 * the whole of the transformation, and it is pure, so it lives here rather than
 * inside the query that fetches the rows.
 *
 * WHY THESE BOUNDARIES
 *
 * They are powers of ten, which is the only honest way to bucket a power law —
 * equal-width buckets would put 460 of the 472 options in the first one and
 * leave the rest empty. It also means the tiers keep their meaning as the
 * catalogue grows: an option that earns wider coverage moves up a layer, and
 * new documentation thickens a layer rather than distorting the scale.
 */

/**
 * Coarsest first, so the rendered bed reads top-down like a real graded bed.
 * `max: null` means "no upper bound"; Infinity does not survive JSON.
 */
export const GRAIN_TIERS = [
  { key: '1000+',   min: 1000, max: null },
  { key: '100-999', min: 100,  max: 999 },
  { key: '10-99',   min: 10,   max: 99 },
  { key: '2-9',     min: 2,    max: 9 },
  { key: '1',       min: 1,    max: 1 },
];

/**
 * Sort options into tiers, dropping tiers nothing lands in.
 *
 * An empty tier is dropped rather than rendered, because a labelled layer with
 * no grains in it reads as a rendering fault rather than as an honest zero.
 *
 * @param {Array<{command: string, reach: number}>} rows - Sorted by reach, descending
 * @param {Array<{key: string, min: number, max: number|null}>} [tiers]
 * @returns {Array<{key: string, min: number, max: number|null, options: Array}>}
 */
export function groupIntoTiers(rows, tiers = GRAIN_TIERS) {
  const source = Array.isArray(rows) ? rows : [];
  return tiers
    .map((t) => ({
      key: t.key,
      min: t.min,
      max: t.max,
      options: source.filter(
        (r) => r && r.reach >= t.min && (t.max === null || r.reach <= t.max)
      ),
    }))
    .filter((t) => t.options.length > 0);
}
