import { describe, it, expect, vi } from 'vitest';

// fetchRelatedGames builds its query against the module-scoped Supabase client,
// so the client is replaced with a recorder. Nothing here touches a database;
// the assertion is about the query that would be sent.
const queries = [];

function builder() {
  const calls = [];
  const q = {
    calls,
    select: (...a) => (calls.push(['select', ...a]), q),
    eq: (...a) => (calls.push(['eq', ...a]), q),
    neq: (...a) => (calls.push(['neq', ...a]), q),
    gt: (...a) => (calls.push(['gt', ...a]), q),
    order: (...a) => (calls.push(['order', ...a]), q),
    limit: (...a) => (calls.push(['limit', ...a]), q),
    // getPhantomOptionCounts runs on the same client; without `is` it throws,
    // which the service swallows by design but which fills the run with noise.
    is: (...a) => (calls.push(['is', ...a]), q),
    // Awaited by Promise.all in the service.
    then: (resolve) => resolve({ data: [], error: null }),
  };
  queries.push(q);
  return q;
}

vi.mock('../config/supabaseClient.js', () => ({
  default: { from: (table) => { const q = builder(); q.table = table; return q; } },
}));

const { fetchRelatedGames } = await import('../services/gamesService.js');

const orderCalls = (q) => q.calls.filter((c) => c[0] === 'order').map((c) => [c[1], c[2]?.ascending]);

describe('fetchRelatedGames — ordering is deterministic', () => {
  it('breaks ties on app_id after ordering by option count', async () => {
    queries.length = 0;
    await fetchRelatedGames({ app_id: 440, engine: 'Source Engine', developer: 'Valve' });

    // One query per signal — engine and developer.
    const candidateQueries = queries.filter((q) => q.table === 'public_games');
    expect(candidateQueries.length).toBeGreaterThanOrEqual(2);

    for (const q of candidateQueries) {
      expect(orderCalls(q)).toEqual([
        ['total_options_count', false],
        ['app_id', true],
      ]);
    }
  });

  it('applies the tiebreaker before the limit, not after', async () => {
    // `.limit()` cutting among unordered ties is the actual bug: without a total
    // order, which rows survive the cut is arbitrary.
    queries.length = 0;
    await fetchRelatedGames({ app_id: 440, engine: 'Source Engine', developer: 'Valve' });

    const q = queries.find((x) => x.table === 'public_games');
    const names = q.calls.map((c) => (c[0] === 'order' ? `order:${c[1]}` : c[0]));
    expect(names.indexOf('order:app_id')).toBeLessThan(names.indexOf('limit'));
  });

  it('still returns [] when the game has neither usable signal', async () => {
    expect(await fetchRelatedGames({ app_id: 1, engine: 'Unknown', developer: 'Unknown' })).toEqual([]);
    expect(await fetchRelatedGames({})).toEqual([]);
    expect(await fetchRelatedGames(null)).toEqual([]);
  });
});
