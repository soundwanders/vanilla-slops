/**
 * @fileoverview Which engines get a page at /engine/:slug, and at what URL.
 *
 * An engine earns a page by having flags documented for the engine itself:
 * published options whose `engine_compatibility` names it. That column is
 * slop-scraper's statement of which engine a flag belongs to, so the hubs
 * repeat its judgement rather than inferring one.
 *
 * WHY NOT "OPTIONS ATTACHED TO MOST OF THE ENGINE'S GAMES"
 *
 * Links are the wrong evidence. Engine flags are broadcast by an engine rule,
 * and as of 2026-09-27 that rule has attached Unity-only flags to games built
 * on other engines (BioShock Infinite, Far Cry 3). A hub built from links would
 * publish that error under an engine's name; one built from the label cannot.
 *
 * WHY TWO THRESHOLDS
 *
 * Any engine with a single documented flag and a single game still gets a
 * page, because every game page on that engine links to it. Below the
 * thresholds the page is a template around one or two cards, so it is served
 * `noindex, follow` and left out of the sitemap and the guide, the same
 * treatment a game with no options gets.
 *
 * Kept free of the Supabase client so it is importable from a test.
 */
import { slugify } from '../../shared/slugify.js';

export const MIN_HUB_FLAGS = 3;
export const MIN_HUB_GAMES = 5;

// A compatibility value that is not an engine: the flag claims to work anywhere.
const NOT_AN_ENGINE = new Set(['Universal', 'Unknown']);

/**
 * The URL slug for an engine family. The same slugify the game pages use, so
 * there is one slug rule on the site, not two.
 *
 * @param {string} engine - a `games.engine` value, e.g. "Unity Engine"
 * @returns {string} e.g. "unity-engine"
 */
export function engineSlug(engine) {
  return slugify(engine);
}

/**
 * The engines named in `engine_compatibility`, and how many published options
 * name each one.
 *
 * @param {{engine_compatibility?: string[]|null}[]} options
 * @returns {Map<string, number>}
 */
export function countEngineFlags(options) {
  const counts = new Map();
  for (const option of options || []) {
    // A Set, so an option listing the same engine twice is counted once.
    for (const engine of new Set(option?.engine_compatibility || [])) {
      if (!engine || NOT_AN_ENGINE.has(engine)) continue;
      counts.set(engine, (counts.get(engine) || 0) + 1);
    }
  }
  return counts;
}

/**
 * Every engine with at least one documented flag and at least one game the site
 * can show, largest first.
 *
 * Two engines whose names slugify alike would claim one URL. None do today
 * (checked across all 284 values), so the larger keeps it and the smaller gets
 * no page, rather than one silently serving the other's games.
 *
 * @param {Map<string, number>} flagCounts - from countEngineFlags
 * @param {Map<string, number>} gameCounts - engine → games with a displayable option
 * @returns {{engine: string, slug: string, flags: number, games: number, indexable: boolean}[]}
 */
export function selectHubs(flagCounts, gameCounts) {
  const hubs = [];
  for (const [engine, flags] of flagCounts || []) {
    const games = gameCounts?.get(engine) || 0;
    if (flags < 1 || games < 1) continue;
    hubs.push({
      engine,
      slug: engineSlug(engine),
      flags,
      games,
      indexable: flags >= MIN_HUB_FLAGS && games >= MIN_HUB_GAMES,
    });
  }
  hubs.sort((a, b) => b.games - a.games || a.engine.localeCompare(b.engine));

  const seen = new Set();
  return hubs.filter((hub) => {
    if (seen.has(hub.slug)) return false;
    seen.add(hub.slug);
    return true;
  });
}

/**
 * Finds the hub a requested slug refers to. Express matches routes without
 * regard to case, so `/engine/Unity-Engine` arrives here too; `canonical` is
 * false when the request should be redirected to the lowercase form.
 *
 * @param {{slug: string}[]} hubs
 * @param {string} requested
 * @returns {{hub: object|null, canonical: boolean}}
 */
export function resolveHub(hubs, requested) {
  const wanted = String(requested || '').toLowerCase();
  const hub = (hubs || []).find((h) => h.slug === wanted) || null;
  return { hub, canonical: Boolean(hub) && requested === hub.slug };
}

/**
 * Whether a game page should link to its engine's hub. True exactly when one
 * of the game's own published options names the game's engine, which is the
 * condition that makes the hub exist: a documented flag, and a game (this one)
 * with an option to show. Decided from data the game page already holds, so
 * the link costs no query.
 *
 * @param {{engine?: string}} game
 * @param {{engine_compatibility?: string[]}[]} options - the game's published options
 * @returns {boolean}
 */
export function gameHasEngineHub(game, options) {
  const engine = game?.engine;
  if (!engine || NOT_AN_ENGINE.has(engine)) return false;
  return (options || []).some((o) => (o?.engine_compatibility || []).includes(engine));
}
