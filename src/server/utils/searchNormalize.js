/**
 * @fileoverview Reduces two strings to the form they should be *compared* in,
 * as opposed to the form they are stored or displayed in.
 *
 * Two separate jobs need this and they need the same answer:
 *
 * 1. **Deduplicating suggestions.** `getSearchSuggestions` keyed its Map on the
 *    raw title, so two rows whose titles differ only by a trailing space, a
 *    trademark sign or a doubled space produced two identical-looking entries in
 *    the dropdown. That is the exact class slop-scraper's rev 17/18 work is
 *    about: `'SaGa Emerald Beyond '` and `'SaGa Emerald Beyond'` are one game to
 *    a reader and two keys to a Map.
 *
 * 2. **Fuzzy matching.** `garys mod` should reach `Garry's Mod`. Against the raw
 *    strings that is two edits (insert `r`, insert `'`); with punctuation folded
 *    away it is one, which is the difference between clearing a distance
 *    threshold and missing it.
 *
 * WHY THE EMPTY CASE IS HANDLED RATHER THAN IGNORED
 *
 * Folding to `[a-z0-9]` would map any title with no ASCII alphanumerics — CJK,
 * Cyrillic, Greek — to the empty string. As a dedupe key that is a collision
 * bucket: every such game collapses onto every other, and the dropdown silently
 * shows one entry where it should show several.
 *
 * So the fold keeps every Unicode letter and digit and removes only punctuation,
 * symbols and whitespace. That leaves the empty case reachable by exactly one
 * kind of title — one made of nothing but punctuation — which is rare enough to
 * be a guard rather than a code path, but cheap enough to be worth guarding.
 *
 * slop-scraper flagged this directly in rev 18: it stopped flattening titles it
 * used to strip (ZWNJ and ZWJ carry meaning in Persian, Arabic and Indic
 * scripts, and removing them corrupted those titles), so the population that can
 * reach here non-Latin is growing rather than being normalised away upstream.
 * Zero published titles hit the empty case today — measured on their side — and
 * this is written for the day that stops being true.
 *
 * `dedupeKey` therefore falls back to the raw string rather than returning
 * something empty. Two distinct CJK titles stay two entries; what they lose is
 * only the whitespace-insensitivity, which is the safe direction to fail.
 */

/**
 * Fold a string to its comparable form: accents decomposed away, case dropped,
 * every run of non-alphanumerics collapsed to a single space.
 *
 * Deliberately keeps spaces rather than deleting them. `word_similarity` scores
 * against word boundaries, so joining "half life" into "halflife" would throw
 * away the structure the comparison is meant to use.
 *
 * @param {unknown} value
 * @returns {string} Possibly empty — see `dedupeKey` for why that matters
 */
export function normalizeForMatch(value) {
  return String(value ?? '')
    .replace(/[™®©]/g, ' ')
    // NFKD -> drop Latin combining marks -> NFC. The recomposition is not
    // cosmetic. NFKD decomposes ポ into ホ + U+309A (the han-dakuten), and that
    // mark is outside the Latin combining block, so it survives the strip, is
    // not a letter, and would be turned into a space by the fold below —
    // silently rewriting ポケモン as "ホ ケモン". NFC puts it back. Latin
    // accents are gone by then, so 'Pokémon' still folds to 'pokemon'.
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * The key a suggestion Map should be keyed on.
 *
 * Same fold as `normalizeForMatch`, except that a string which folds to nothing
 * keeps its own identity instead of joining a shared empty bucket.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function dedupeKey(value) {
  const normalized = normalizeForMatch(value);
  return normalized || String(value ?? '').trim();
}
