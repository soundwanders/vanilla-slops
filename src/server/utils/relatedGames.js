/**
 * Flatten ranked tiers of candidate games into one related-games list.
 *
 * Lives apart from gamesService because this is the part worth testing on its
 * own: a game can match more than one signal, and it must appear once,
 * attributed to the earliest tier it matched. Valve's Source 2 titles match both
 * engine and developer on the Counter-Strike 2 page, and listing them twice
 * would be the obvious bug. Keeping it free of the Supabase client is what makes
 * it importable from a test.
 *
 * @param {Array<{rows: Array<Object>, relation: string, label: string}>} tiers -
 *   Candidate groups in priority order
 * @param {number} limit - Maximum entries to return
 * @returns {Array<Object>} Deduplicated entries, each tagged with relation and label
 */
export function mergeRelatedTiers(tiers, limit) {
  const seen = new Set();
  const merged = [];

  for (const tier of tiers) {
    for (const row of tier.rows || []) {
      if (merged.length >= limit) return merged;
      if (seen.has(row.app_id)) continue;
      seen.add(row.app_id);
      merged.push({ ...row, relation: tier.relation, label: tier.label });
    }
  }

  return merged;
}
