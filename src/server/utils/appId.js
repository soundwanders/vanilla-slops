/**
 * @fileoverview A Steam App ID, read only as the site writes it.
 *
 * Digits, no leading zero, no trailing junk. `parseInt` alone accepted `440abc`
 * and `0440` as 440. Each spelling is its own edge-cache entry, so any number of
 * them reached the database for the same game, and the game page rendered under
 * every one.
 */

/**
 * @param {string} raw - The route parameter
 * @returns {number|null} The ID, or null when it is not written canonically
 */
export function canonicalAppId(raw) {
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 && String(id) === raw ? id : null;
}
