import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The per-instance caches used to store a result only once its fetch had
// finished, so K requests reaching a cold instance together ran K complete
// fetches. Right after a deploy, with every edge region empty, that is how a
// burst arrives: the facets alone are about twenty queries. sharedCached gives
// every caller that arrives while a fetch is running the same fetch.

const db = vi.hoisted(() => ({
  reads: 0,
  delayMs: 0,
  respond: () => ({ data: [], error: null, count: 0 }),
}));

// Stands in for a supabase-js query: building never throws, awaiting asks
// `db.respond`, after `db.delayMs`.
function query(table, kind = 'from') {
  const call = { table, kind };
  const q = new Proxy({}, {
    get(_, prop) {
      if (prop === 'then') {
        return (resolve, reject) => new Promise((r) => setTimeout(r, db.delayMs))
          .then(() => db.respond(call))
          .then(resolve, reject);
      }
      return () => q;
    },
  });
  return q;
}

vi.mock('../config/supabaseClient.js', () => ({
  default: {
    from: (table) => { db.reads++; return query(table); },
    rpc: (fn) => { db.reads++; return query(fn, 'rpc'); },
  },
}));

async function freshService() {
  vi.resetModules();
  return import('../services/gamesService.js');
}

beforeEach(() => {
  db.reads = 0;
  db.delayMs = 5;
  db.respond = () => ({ data: [], error: null, count: 0 });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe('concurrent callers on a cold instance', () => {
  it('share one facets fetch instead of running one each', async () => {
    let { getFacets } = await freshService();
    await getFacets();
    const one = db.reads;
    expect(one).toBeGreaterThan(0);

    ({ getFacets } = await freshService());
    db.reads = 0;
    const results = await Promise.all(Array.from({ length: 8 }, () => getFacets()));
    expect(db.reads).toBe(one);
    expect(new Set(results).size).toBe(1);
  });

  it('share one engine-hub fetch', async () => {
    let { getEngineHubIndex } = await freshService();
    await getEngineHubIndex();
    const one = db.reads;

    ({ getEngineHubIndex } = await freshService());
    db.reads = 0;
    await Promise.all(Array.from({ length: 8 }, () => getEngineHubIndex()));
    expect(db.reads).toBe(one);
  });

  it('serve the cached result afterwards with no read at all', async () => {
    const { getFacets } = await freshService();
    await getFacets();
    db.reads = 0;
    await getFacets();
    expect(db.reads).toBe(0);
  });
});

describe('a fetch that fails', () => {
  it('fails every caller waiting on it, and is not cached', async () => {
    const { getFacets } = await freshService();
    db.respond = () => ({ data: null, error: { code: 'PGRST003', message: 'Timed out acquiring connection' } });
    const settled = await Promise.allSettled(Array.from({ length: 4 }, () => getFacets()));
    expect(settled.every((s) => s.status === 'rejected')).toBe(true);

    // The next caller starts afresh, and gets the real answer.
    db.respond = () => ({ data: [], error: null, count: 0 });
    db.reads = 0;
    await expect(getFacets()).resolves.toBeTruthy();
    expect(db.reads).toBeGreaterThan(0);
  });
});

// /catalog used to be cached for a day with its figures missing, because each
// failed read here quietly became an empty list.
describe('getCatalogGrain', () => {
  it('marks a result degraded when any read failed, and does not keep it', async () => {
    const { getCatalogGrain } = await freshService();
    db.respond = (call) => (call.table === 'games'
      ? { data: null, error: { message: 'stalled' } }
      : { data: [], error: null, count: 3 });
    const first = await getCatalogGrain();
    expect(first.degraded).toBe(true);

    db.reads = 0;
    await getCatalogGrain();
    expect(db.reads).toBeGreaterThan(0);
  });

  it('keeps a whole result', async () => {
    const { getCatalogGrain } = await freshService();
    const grain = await getCatalogGrain();
    expect(grain.degraded).toBe(false);
    db.reads = 0;
    await getCatalogGrain();
    expect(db.reads).toBe(0);
  });
});

// The counts subtract links to options the view hides. When that read fails
// the counts overstate, and a page printing them must not be held.
describe('a failed phantom-count read', () => {
  const phantomFails = (call) => (call.table === 'game_launch_options'
    ? { data: null, error: { message: 'stalled' } }
    : { data: [], error: null, count: 3 });

  it('leaves the catalogue grain degraded', async () => {
    const { getCatalogGrain } = await freshService();
    db.respond = phantomFails;
    const grain = await getCatalogGrain();
    expect(grain.degraded).toBe(true);
  });

  it('fails the engine-hub index rather than caching overstated counts', async () => {
    const { getEngineHubIndex } = await freshService();
    db.respond = phantomFails;
    await expect(getEngineHubIndex()).rejects.toThrow(/phantom/);
  });
});

describe('getCatalogStats', () => {
  it('marks a failed count degraded, and does not keep it', async () => {
    const { getCatalogStats } = await freshService();
    db.respond = () => ({ data: null, error: { message: 'stalled' } });
    const stats = await getCatalogStats();
    expect(stats.degraded).toBe(true);
    expect(stats.games).toBeNull();

    db.respond = () => ({ data: null, error: null, count: 5 });
    db.reads = 0;
    const again = await getCatalogStats();
    expect(db.reads).toBeGreaterThan(0);
    expect(again.degraded).toBe(false);
  });
});

// A failed read used to come back as [], which the controller then cached for
// ten minutes plus an hour stale: "no such game" for everyone in that region.
describe('getSearchSuggestions', () => {
  it('throws on a failed read instead of answering no matches', async () => {
    const { getSearchSuggestions } = await freshService();
    db.respond = () => ({ data: null, error: { code: 'PGRST003', message: 'Timed out acquiring connection' } });
    await expect(getSearchSuggestions('half', 10)).rejects.toThrow();
  });

  it('still shows the game suggestions when only the option half fails, flagged', async () => {
    const { getSearchSuggestions } = await freshService();
    db.respond = (call) => {
      if (call.kind === 'rpc' && call.table === 'game_suggestions') {
        return { data: [{ kind: 'title', value: 'Half-Life' }], error: null };
      }
      if (call.table === 'public_launch_options') return { data: null, error: { message: 'stalled' } };
      return { data: [], error: null };
    };
    const result = await getSearchSuggestions('half', 10);
    expect(result.map((s) => s.value)).toContain('Half-Life');
    expect(result.degraded).toBe(true);
  });

  it('still treats a missing typeahead function as "use the fallback"', async () => {
    const { getSearchSuggestions } = await freshService();
    db.respond = (call) => (call.kind === 'rpc'
      ? { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }
      : { data: [], error: null });
    await expect(getSearchSuggestions('half', 10)).resolves.toEqual([]);
  });
});
