/**
 * @fileoverview Did the visitor send a query string?
 *
 * Vercel's edge keys its cache on the full URL, query string included, so a
 * query decides whether a request can be answered from the cache. Two routes
 * need to know whether one was sent: /api/games, to tell the keepalive's bare
 * request from a visitor's, and the server-rendered pages, which take no query
 * at all and redirect one away.
 *
 * Reads the raw URL because `req.query` cannot answer it: validateRequest
 * replaces it with the parsed values, defaults filled in.
 */

// vercel.json rewrites `/api/:path*`, `/game/:path*` and `/engine/:path*` to
// the function, and Vercel adds the captured `path` to the query: a bare
// `/api/games` arrives as `/api/games?path=games`. It overwrites any `path`
// the visitor sent, so on these routes the parameter is always the platform's.
// routeWiring.test.js fails if a rewrite's parameter is renamed.
export const REWRITE_PARAM = 'path';

/**
 * Whether a URL on a route that takes no query carries anything at all beyond
 * what Vercel's rewrite adds. Stricter than hasClientQuery, which counts
 * parameters and so let through `?&&` and, on routes with no rewrite,
 * `?path=1`, `?path=2`, ... (each one a new edge-cache entry).
 *
 * On a rewritten route Vercel's query is a single `path=` segment, and it
 * overwrites a visitor's own `path`, so that one shape is allowed there and
 * nothing else is. On a route with no rewrite, any `?` is the visitor's.
 *
 * @param {string} [originalUrl] - `req.originalUrl`
 * @param {{rewritten?: boolean}} [options] - Whether the route is reached
 *   through a `:path*` rewrite
 * @returns {boolean} True when the URL should lose its query
 */
export function hasStrayQuery(originalUrl = '', { rewritten = false } = {}) {
  const i = originalUrl.indexOf('?');
  if (i === -1) return false;
  if (!rewritten) return true;
  const segments = originalUrl.slice(i + 1).split('&');
  return !(segments.length === 1 && segments[0].startsWith(`${REWRITE_PARAM}=`));
}

/**
 * @param {string} [originalUrl] - `req.originalUrl`
 * @returns {boolean} True when any parameter other than the rewrite's is present
 */
export function hasClientQuery(originalUrl = '') {
  const query = originalUrl.split('?')[1];
  if (!query) return false;
  const params = new URLSearchParams(query);
  params.delete(REWRITE_PARAM);
  return params.size > 0;
}
