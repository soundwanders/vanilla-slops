import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The facets are built from seven reads and cached twice, in process and at
// the CDN. Each read used to swallow its own failure and hand back an empty
// list, so a stalled database produced a 200 with holes in it that the edge
// then served to everyone (2026-11-13). A facet list with a hole in it looks
// exactly like a real one, so a failed read has to fail the request.
const db = vi.hoisted(() => ({ respond: () => ({ data: [], error: null }) }));

// Stands in for a supabase-js query: every builder method returns the query,
// and awaiting it asks `db.respond` what the database said.
function query(table) {
  const call = { table, range: null };
  const q = new Proxy({}, {
    get(_, prop) {
      if (prop === 'then') {
        return (resolve, reject) => Promise.resolve(db.respond(call)).then(resolve, reject);
      }
      return (...args) => {
        if (prop === 'range') call.range = args;
        return q;
      };
    },
  });
  return q;
}

vi.mock('../config/supabaseClient.js', () => ({ default: { from: (table) => query(table) } }));

const GAME = {
  app_id: 440, developer: 'Valve', publisher: 'Valve', engine: 'Source Engine',
  release_date: 'Oct 10, 2007', total_options_count: 3,
};
const OPTION = {
  command: '-novid', description: 'Skips the intro video', risk_level: 'safe',
  categories: ['Video'], game_launch_options: [{ count: 1 }],
};
const healthy = ({ table }) => (table === 'public_games'
  ? { data: [GAME], count: 1, error: null }
  : { data: [OPTION], error: null });
const STALLED = { data: null, error: { code: 'PGRST003', message: 'Timed out acquiring connection from connection pool.' } };

async function load() {
  vi.resetModules();
  const service = await import('../services/gamesService.js');
  const controller = await import('../controllers/gamesController.js');
  return { ...service, ...controller };
}

function mockRes() {
  const res = { set: vi.fn(), json: vi.fn(), status: vi.fn(() => res) };
  return res;
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('getFacets', () => {
  it('returns the facets when every read succeeds', async () => {
    db.respond = healthy;
    const { getFacets } = await load();
    const facets = await getFacets();
    expect(facets.developers).toEqual([{ value: 'Valve', count: 1 }]);
    expect(facets.releaseYears).toEqual(['2007']);
    expect(facets.riskLevels).toEqual([{ value: 'safe', count: 1 }]);
  });

  it.each(['public_games', 'public_launch_options'])('fails whole when a read of %s fails', async (table) => {
    db.respond = (call) => (call.table === table ? STALLED : healthy(call));
    const { getFacets } = await load();
    await expect(getFacets()).rejects.toThrow('Failed to fetch facets from database');
  });

  it('fails when a later page fails, where it used to count the pages it had', async () => {
    const fullPage = Array.from({ length: 1000 }, (_, i) => ({ ...GAME, app_id: i + 1 }));
    db.respond = (call) => {
      if (call.table !== 'public_games' || !call.range) return healthy(call);
      return call.range[0] === 0 ? { data: fullPage, error: null } : STALLED;
    };
    const { getFacets } = await load();
    await expect(getFacets()).rejects.toThrow('Failed to fetch facets from database');
  });

  it('does not remember a failure: the next request asks the database again', async () => {
    db.respond = () => STALLED;
    const { getFacets } = await load();
    await expect(getFacets()).rejects.toThrow();

    db.respond = healthy;
    expect((await getFacets()).developers).toEqual([{ value: 'Valve', count: 1 }]);
  });
});

describe('GET /api/games/facets when the database stalls', () => {
  it('answers 500 with nothing for the CDN to hold', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    db.respond = () => STALLED;
    const { filterFacetsController } = await load();
    const res = mockRes();
    await filterFacetsController({ query: {} }, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.set).not.toHaveBeenCalledWith('Cache-Control', expect.anything());
  });

  it('is edge-cached when it succeeds', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    db.respond = healthy;
    const { filterFacetsController } = await load();
    const res = mockRes();
    await filterFacetsController({ query: {} }, res);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.set).toHaveBeenCalledWith('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600');
  });
});

// Same failure, different page: the sitemap's game list stopped at the first
// failed read and returned what it had, so a stall published a sitemap of four
// static URLs with a 24-hour cache header.
describe('getGamesForSitemap', () => {
  it('fails when the read fails, so no partial sitemap is published', async () => {
    db.respond = () => STALLED;
    const { getGamesForSitemap } = await load();
    await expect(getGamesForSitemap()).rejects.toThrow(/sitemap games/);
  });

  it('fails when a later page fails', async () => {
    const fullPage = Array.from({ length: 1000 }, (_, i) => ({ app_id: i + 1, title: `Game ${i + 1}`, updated_at: null }));
    db.respond = (call) => (call.range[0] === 0 ? { data: fullPage, error: null } : STALLED);
    const { getGamesForSitemap } = await load();
    await expect(getGamesForSitemap()).rejects.toThrow(/rows from 1000/);
  });

  it('returns every page when the reads succeed', async () => {
    const fullPage = Array.from({ length: 1000 }, (_, i) => ({ app_id: i + 1, title: `Game ${i + 1}`, updated_at: null }));
    db.respond = (call) => (call.range[0] === 0
      ? { data: fullPage, error: null }
      : { data: [{ app_id: 1001, title: 'Last', updated_at: null }], error: null });
    const { getGamesForSitemap } = await load();
    expect(await getGamesForSitemap()).toHaveLength(1001);
  });
});
