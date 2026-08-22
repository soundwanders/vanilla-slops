/**
 * @fileoverview The canonical game-title slug, shared by both sides of the app.
 *
 * This lives outside `client/` and `server/` because both need the *same*
 * answer and there is no safe way to have two of them:
 *
 *   - the server computes the canonical slug and 301-redirects any request
 *     whose slug does not match (`seoController`), and
 *   - the client builds internal `/game/:appid/:slug` links (`ui/table.js`),
 *     which must already be canonical or every click pays a redirect hop.
 *
 * It was duplicated — one copy here, one hand-transcribed into `table.js` —
 * until 2026-08-22. Nothing checked that the copies agreed, which is the same
 * one-rule-two-places failure the slop-scraper handoff kept reporting from the
 * write side (§1b, §3b, §7i). They happened to still be identical when merged;
 * that was luck, not a guarantee.
 *
 * Deterministic by contract: the same title must always yield the same slug, or
 * old links break and redirects loop.
 */

/**
 * Convert a game title into a URL-safe slug for /game/:appid/:slug routes.
 *
 * @param {string} str - Game title
 * @returns {string} slug, e.g. "Team Fortress 2™" → "team-fortress-2"
 */
export function slugify(str) {
  return String(str || '')
    .replace(/[™®©]/g, '')   // strip BEFORE NFKD — it decomposes ™ into the letters "TM"
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')   // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')       // non-alphanumerics → hyphen
    .replace(/^-+|-+$/g, '')           // trim leading/trailing hyphens
    .slice(0, 80)
    .replace(/-+$/g, '')               // trim again after slice
    || 'game';
}
