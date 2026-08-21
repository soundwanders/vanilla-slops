/**
 * @fileoverview Reconciles the option count a game advertises with the number
 * the site can actually render.
 *
 * `games.total_options_count` is maintained by a database trigger that counts
 * rows in `game_launch_options`. The trigger counts *links*; the
 * `public_launch_options` view filters *options*, hiding any row that is
 * unlinked or carries no provenance. Those are not the same set, so a game can
 * advertise more options than the site is willing to publish — Team Fortress 2
 * says 28 and renders 23.
 *
 * The column is not wrong. It is a true count of what the catalogue holds on
 * that game, which is what the scraper needs to decide what to re-scan, and
 * what sorting and filtering here should keep using. It is simply answering a
 * different question than a badge on a button is asking.
 *
 * Kept free of the Supabase client so it is importable from a test.
 * See slop-scraper follow-through rev 14 §1f.
 */

/**
 * The number to show a user: what the catalogue holds, less the rows the view
 * will refuse to return.
 *
 * @param {{app_id?: number|string, total_options_count?: number}} game
 * @param {Map<number|string, number>} [phantoms] app_id → count of hidden links
 * @returns {number}
 */
export function displayOptionCount(game, phantoms) {
  const total = Number(game?.total_options_count) || 0;
  if (!phantoms || game?.app_id == null) return Math.max(0, total);
  // App IDs arrive as numbers from Postgres and as strings from a URL param.
  const phantom = Number(phantoms.get(game.app_id) ?? phantoms.get(Number(game.app_id))) || 0;
  return Math.max(0, total - phantom);
}

/**
 * Stamps `display_options_count` onto each row, leaving `total_options_count`
 * untouched so sorting and filtering keep the number they were built on.
 *
 * @template {{app_id?: number|string, total_options_count?: number}} T
 * @param {T[]} games
 * @param {Map<number|string, number>} [phantoms]
 * @returns {(T & {display_options_count: number})[]}
 */
export function withDisplayCounts(games, phantoms) {
  if (!Array.isArray(games)) return [];
  return games.map((game) => ({
    ...game,
    display_options_count: displayOptionCount(game, phantoms),
  }));
}

/**
 * Builds the app_id → phantom-count map from the junction rows that point at
 * hidden options.
 *
 * @param {{game_app_id: number|string}[]} hiddenLinks
 * @returns {Map<number|string, number>}
 */
export function buildPhantomMap(hiddenLinks) {
  const map = new Map();
  for (const link of hiddenLinks || []) {
    const id = link?.game_app_id;
    if (id == null) continue;
    map.set(id, (map.get(id) || 0) + 1);
  }
  return map;
}
