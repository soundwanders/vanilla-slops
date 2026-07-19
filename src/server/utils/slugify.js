/**
 * Convert a game title into a URL-safe slug for /game/:appid/:slug routes.
 * Deterministic — the same title always yields the same slug, so the server
 * can compute the canonical slug and 301-redirect mismatched requests to it.
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
