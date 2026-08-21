/**
 * @fileoverview Scheme allowlist for URLs that come from the catalogue and end
 * up in an `href`.
 *
 * Escaping a URL keeps it inside its attribute; it does not make the attribute
 * safe. `href="javascript:…"` is well-formed HTML — the danger is the scheme,
 * not the syntax, so `escapeHtml` cannot be the control here.
 *
 * `source_url` is written by slop-scraper from whatever a source page links to,
 * so it is not a value this repo authors. Every one of 188 rows sampled from
 * production is https and absolute, which is why an allowlist costs nothing:
 * it rejects only what the column has never legitimately held.
 *
 * The input string is returned unchanged rather than the parsed URL's `href`,
 * so a link renders exactly as the catalogue recorded it — `new URL` normalises
 * (adding a trailing slash, re-encoding), and provenance should be shown as
 * stored.
 */

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * @param {unknown} value - A URL from the database
 * @returns {string} The original string when it is an absolute http(s) URL,
 *   otherwise '' — callers treat that the same as a missing URL and fall back
 *   to plain text rather than rendering a dead or hostile link.
 */
export function safeHttpUrl(value) {
  if (typeof value !== 'string' || !value) return '';
  try {
    // Leading control characters and whitespace are stripped by the URL parser,
    // so "\tjava\nscript:…" is caught here rather than slipping through as a
    // relative path.
    const parsed = new URL(value);
    return ALLOWED_PROTOCOLS.has(parsed.protocol) ? value : '';
  } catch {
    return '';
  }
}
