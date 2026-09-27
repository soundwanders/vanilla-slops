/**
 * @fileoverview Carry the request's query string onto a redirect target.
 *
 * The game page redirects to its canonical URL (right slug, surviving App ID).
 * That redirect changes the path; it should not silently discard whatever the
 * link's sender put after it. The canonical <link> in the page still names the
 * clean URL, so keeping the query creates no duplicate for search engines.
 *
 * The query is appended exactly as received, still encoded, so nothing is
 * re-parsed or reordered on the way through.
 */

/**
 * @param {string} target - Redirect path, without a query of its own
 * @param {string} [originalUrl] - The request URL (`req.originalUrl`)
 * @returns {string} `target` followed by the request's query, if it had one
 */
export function preserveQuery(target, originalUrl = '') {
  const i = typeof originalUrl === 'string' ? originalUrl.indexOf('?') : -1;
  if (i === -1) return target;
  const query = originalUrl.slice(i);
  return query === '?' ? target : target + query;
}
