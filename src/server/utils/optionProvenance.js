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
 * @param {{description?: string|null, source?: string|null, source_url?: string|null, last_verified_at?: string|null}|null} link
 *   The game_launch_options row. slop-scraper's CHECK constraints guarantee a
 *   description or date never appears without a source_url.
 * @param {{description?: string|null, source?: string|null, source_url?: string|null, last_verified_at?: string|null}} option
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
