/**
 * @fileoverview The curated lineup that leads the catalog's default view.
 *
 * Why this file exists: the landing order used to be a straight
 * `total_options_count DESC`, which optimises for "where we hold the most
 * data" — not for "what a visitor recognises". Those two diverge exactly at
 * the top of the list, where it costs the most. Counter-Strike 1.6 (2000)
 * outranked Counter-Strike 2 by five option rows, so the first impression of
 * a Steam launch-options catalog was a game superseded a decade ago.
 *
 * This list only reorders the front of the default view. Every other sort —
 * including "Most options" — is untouched and still reports the raw data
 * honestly. Nothing here hides a game, inflates a count, or changes what any
 * row claims; it decides reading order and nothing else.
 *
 * ## Rules for editing this list
 *
 * 1. **Recognisable on sight.** If a visitor has to look the game up, it does
 *    not belong here. Obscure games with excellent data still surface right
 *    below, through the option-count fallthrough.
 * 2. **Current, not merely famous.** Prefer the entry a player would actually
 *    install today. Age alone is not disqualifying — Team Fortress 2 (2007)
 *    is still the live product — but if a successor exists in the catalog,
 *    feature the successor.
 * 3. **Real data behind it.** Roughly 10+ options. A featured game that opens
 *    to a thin or empty list is worse than not featuring it.
 * 4. **Keep it shorter than one page (20).** The tail of page one should still
 *    be data-driven, so the catalog visibly ranks on evidence rather than
 *    reading as a hand-built list all the way down.
 *
 * Order within the list is the display order. IDs are Steam app_ids; a game
 * that is missing from the database (or filtered out by an active search)
 * simply doesn't appear — no placeholder, no error.
 *
 * Option counts in the comments are a snapshot from 2026-08-13 and drift as
 * the scraper runs. They are a sanity check on rule 3, not a source of truth.
 */

/**
 * Steam app_ids that lead the default catalog view, in display order.
 * @type {ReadonlyArray<number>}
 */
export const FEATURED_APP_IDS = Object.freeze([
  730,      // Counter-Strike 2 .............. 24 opts (replaces app 10, the 2000 original)
  440,      // Team Fortress 2 ............... 28 opts
  570,      // Dota 2 ........................ 18 opts
  271590,   // Grand Theft Auto V Legacy ..... 28 opts (Enhanced, 3240220, has only 8)
  1245620,  // ELDEN RING .................... 15 opts
  292030,   // The Witcher 3: Wild Hunt ...... 15 opts
  1091500,  // Cyberpunk 2077 ................ 10 opts
  550,      // Left 4 Dead 2 ................. 20 opts
  220,      // Half-Life 2 ................... 15 opts
  620,      // Portal 2 ...................... 12 opts
  252950,   // Rocket League ................. 19 opts
  252490,   // Rust .......................... 16 opts
  4000,     // Garry's Mod ................... 18 opts
  413150,   // Stardew Valley ................ 14 opts
  381210,   // Dead by Daylight .............. 15 opts
  346110    // ARK: Survival Evolved ......... 23 opts
]);

/**
 * Display position for each featured app_id, for O(1) ranking.
 * @type {Map<number, number>}
 */
export const FEATURED_RANK = new Map(FEATURED_APP_IDS.map((id, i) => [id, i]));

/**
 * PostgREST-formatted id list for `.not('app_id', 'in', ...)` exclusions.
 * @type {string}
 */
export const FEATURED_ID_LIST = `(${FEATURED_APP_IDS.join(',')})`;
