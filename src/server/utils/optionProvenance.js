/**
 * @fileoverview Which text, citation and date a game page shows for one option.
 *
 * A command is one shared row, so before slop-scraper rev 21 the first page
 * scraped spoke for every game: Max Payne 3's `-stereo` read "Enables stereo
 * audio support" and cited another game's wiki page, while its own page says
 * "Force 3D stereo support [0–1] (1 is on)". Rev 21 §1g puts each game's own
 * evidence on the `game_launch_options` link, and this applies its display rule:
 *
 *   text      = the link's description, else the shared row's
 *   citation  = whoever wrote that text, with that page's "Last checked" date
 *   game page = the link's own page, as extra evidence, when it is not already
 *               the citation (the text came from the shared row, and the link
 *               cites a different page)
 *
 * The text and its citation always travel together; a date is never shown
 * beside a page that was not the one checked.
 *
 * Kept free of the Supabase client so it is importable from a test.
 */

/**
 * Linux wrappers: tools that run any game, not flags any one game documents.
 *
 * Since slop-scraper rev 24 every remaining link to these two is named by a
 * ProtonDB report for that game and cites that game's page, so the citation
 * is real evidence and resolveProvenance shows it. They still rank below the
 * game's other cited options: ties within the cited tier fall to the
 * alphabet, where `gamemoderun` beats every `PROTON_*` variable, and measured
 * on 2026-11-09 that alone would have opened 266 game pages with a wrapper.
 */
const LINUX_WRAPPERS = new Set(['gamemoderun %command%', 'mangohud %command%']);

/**
 * @param {{description?: string|null, source?: string|null, source_url?: string|null, last_verified_at?: string|null}|null} link
 *   The game_launch_options row. slop-scraper's CHECK constraints guarantee a
 *   description or date never appears without a source_url.
 * @param {{command?: string, description?: string|null, source?: string|null, source_url?: string|null, last_verified_at?: string|null}} option
 *   The nested public_launch_options row.
 * @returns {{description: string|null, source: string|null, source_url: string|null,
 *   last_verified_at: string|null, game_source: string|null, game_source_url: string|null,
 *   game_verified_at: string|null}}
 */
export function resolveProvenance(link, option) {
  const own = Boolean(link?.description);
  const cited = own ? link : option;
  const citedUrl = cited?.source_url || null;
  const gameUrl = link?.source_url && link.source_url !== citedUrl ? link.source_url : null;

  return {
    description: cited?.description || null,
    source: cited?.source || null,
    source_url: citedUrl,
    last_verified_at: cited?.last_verified_at || null,
    game_source: gameUrl ? link.source || null : null,
    game_source_url: gameUrl,
    game_verified_at: gameUrl ? link.last_verified_at || null : null,
  };
}

/**
 * Order for one game's options: those the game's own page lists first, then
 * cited Linux wrappers, then the rest; within a tier by votes, then command,
 * so the order is stable.
 *
 * Votes are all zero, so ordering by them alone left the list in whatever order
 * PostgREST returned it, and a game's own flags sat among the ones that reach
 * it only as engine-wide or Linux wrappers: Cyberpunk 2077's `--launcher-skip`
 * came last of 21. A link-level `source_url` (rev 21 §1g) is the one signal
 * that this game's page documents the flag. LINUX_WRAPPERS says why a cited
 * wrapper gets a tier of its own. It ranks; it never hides.
 *
 * @param {{source_url?: string|null, public_launch_options: {command: string, upvotes?: number}}} a
 *   A game_launch_options row with its nested public_launch_options row.
 * @param {typeof a} b
 * @returns {number}
 */
export function compareGameOptions(a, b) {
  const tier = (row) => {
    if (!row.source_url) return 0;
    return LINUX_WRAPPERS.has(row.public_launch_options.command) ? 1 : 2;
  };
  return (tier(b) - tier(a))
    || ((b.public_launch_options.upvotes || 0) - (a.public_launch_options.upvotes || 0))
    || a.public_launch_options.command.localeCompare(b.public_launch_options.command);
}
