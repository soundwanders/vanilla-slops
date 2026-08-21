/**
 * @fileoverview Prepares a user's search text for PostgREST's or-filter grammar.
 *
 * `.or()` is different in kind from `.ilike()`. `.ilike()` takes a value and
 * supabase-js quotes it, so anything the user types is inert — which is why
 * `applyOptionAttributeFilter` passes launch-option commands through untouched,
 * and why stripping them there was the rev 15 bug. `.or()` takes a filter
 * *expression*: the string is parsed, and `,` `(` `)` are its syntax. A term
 * carrying those characters changes the query's shape rather than what it
 * matches.
 *
 * `%` is stripped for a different reason — it is an ilike wildcard, and the
 * caller has already wrapped the term in `%…%`.
 *
 * `.` is deliberately kept. Only the first two dots in `title.ilike.value` are
 * structural; the rest of the value is literal, and games like S.T.A.L.K.E.R.
 * would be unsearchable without it.
 *
 * This is the same rule `getSearchSuggestions` applied inline, hoisted so the
 * four query paths that build the same or-filter share one definition of safe
 * instead of three of them having no definition at all.
 */

/**
 * Remove the characters that carry meaning in an or-filter expression.
 * Replaced with a space rather than deleted, so "half,life" stays two words.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function sanitizeOrFilterValue(value) {
  return String(value ?? '').replace(/[%,()]/g, ' ').trim();
}

/**
 * Split a search box's contents into the individual terms a query should
 * match, each one safe to interpolate.
 *
 * @param {unknown} searchQuery
 * @returns {string[]} Possibly empty; callers apply no filter when it is
 */
export function toOrFilterTerms(searchQuery) {
  const cleaned = sanitizeOrFilterValue(searchQuery);
  if (!cleaned) return [];
  return cleaned.split(/\s+/).filter(Boolean);
}
