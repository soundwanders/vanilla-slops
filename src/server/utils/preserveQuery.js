/**
 * @fileoverview Carry the request's query string onto a redirect target.
 *
 * The game page redirects to its canonical URL (right slug, surviving App ID).
 * That redirect changes the path; it should not silently discard whatever the
 * link's sender put after it. The canonical <link> in the page still names the
 * clean URL, so keeping the query creates no duplicate for search engines.
 *
 * Kept parameters pass through exactly as received, still encoded, in their
 * original order. Empty segments (`?&&x=1`) are dropped.
 *
 * `drop` exists for Vercel. A rewrite like `/game/:path*` puts the captured
 * segment into the query as `path=<captured>`, and it overwrites any `path`
 * the visitor sent, so on a rewritten route that parameter is always the
 * platform's. Forwarding it put `?path=440` into public URLs (2026-09-27).
 */

function decodeName(segment) {
  const raw = segment.split('=')[0].replace(/\+/g, ' ');
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * @param {string} target - Redirect path, without a query of its own
 * @param {string} [originalUrl] - The request URL (`req.originalUrl`)
 * @param {{ drop?: string[] }} [options] - Parameter names never to forward
 * @returns {string} `target` followed by the request's kept query parameters
 */
export function preserveQuery(target, originalUrl = '', { drop = [] } = {}) {
  const i = typeof originalUrl === 'string' ? originalUrl.indexOf('?') : -1;
  if (i === -1) return target;
  const kept = originalUrl
    .slice(i + 1)
    .split('&')
    .filter((segment) => segment && !drop.includes(decodeName(segment)));
  return kept.length ? `${target}?${kept.join('&')}` : target;
}
