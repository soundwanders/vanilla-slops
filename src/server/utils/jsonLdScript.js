/**
 * @fileoverview Serialises an object for embedding inside a
 * `<script type="application/ld+json">` element.
 *
 * `JSON.stringify` escapes quotes and backslashes, which is enough to keep a
 * string valid JSON — but it leaves `<` and `/` untouched, and those are what
 * matter once the result is written between script tags. A game title
 * containing `</script>` closes the element early and everything after it is
 * parsed as markup, which is how a scraped field becomes an HTML injection.
 *
 * The catalogue's strings come from slop-scraper reading Steam and community
 * sources, so this is data the project does not author. Encoding it at the
 * point of output is this repo's job regardless of what the write side does.
 *
 * `<` and friends are ordinary JSON escapes: a parser decodes them back to
 * the original characters, so the structured data search engines read is
 * byte-for-byte the same document. Only the HTML tokeniser sees a difference.
 *
 * U+2028 and U+2029 are legal inside a JSON string but terminate a line in
 * JavaScript. `application/ld+json` is parsed as JSON, not script, so they are
 * harmless here — they are escaped anyway so this stays correct if it is ever
 * reused for an inline `<script>` that is.
 */

/**
 * @param {unknown} value - Any JSON-serialisable value
 * @returns {string} JSON safe to place in an HTML script element
 */
export function jsonLdScript(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
