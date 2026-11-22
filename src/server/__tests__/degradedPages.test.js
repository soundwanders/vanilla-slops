import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// A page rendered without its data is still worth serving, but not worth
// holding at the edge (the rule the guide already followed). /catalog used to
// be cached for a day with its figures missing, /how-it-works for an hour, and
// a failed suggestions read (turned into [] by the service) for ten minutes
// plus an hour stale.

const service = vi.hoisted(() => ({
  getCatalogGrain: vi.fn(),
  getCatalogStats: vi.fn(),
  getSearchSuggestions: vi.fn(),
}));
vi.mock('../services/gamesService.js', () => service);

const { catalogController, howItWorksController } = await import('../controllers/seoController.js');
const { searchSuggestionsController } = await import('../controllers/gamesController.js');

const GRAIN = { tiers: [], options: 0, games: 0, gamesWithOptions: null, links: 0, singletons: 0 };
const STATS = { games: 3064, options: 617, lastUpdated: '2026-11-14T00:00:00Z' };

function mockRes() {
  const res = {
    set: vi.fn(() => res), send: vi.fn(), json: vi.fn(),
    status: vi.fn(() => res), type: vi.fn(() => res),
  };
  return res;
}
const cacheHeader = (res) => res.set.mock.calls.find(([name]) => name === 'Cache-Control')?.[1];

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('/catalog', () => {
  it('is held for a day when its data is whole', async () => {
    service.getCatalogGrain.mockResolvedValue({ ...GRAIN, degraded: false });
    const res = mockRes();
    await catalogController({}, res);
    expect(cacheHeader(res)).toBe('public, max-age=1800, s-maxage=86400, stale-while-revalidate=604800');
  });

  it('is served but never held when a read failed', async () => {
    service.getCatalogGrain.mockResolvedValue({ ...GRAIN, degraded: true });
    const res = mockRes();
    await catalogController({}, res);
    expect(res.send).toHaveBeenCalled();
    expect(cacheHeader(res)).toBe('no-store');
  });
});

describe('/how-it-works', () => {
  it('is held for an hour when its figures are whole', async () => {
    service.getCatalogStats.mockResolvedValue({ ...STATS, degraded: false });
    const res = mockRes();
    await howItWorksController({}, res);
    expect(cacheHeader(res)).toBe('public, max-age=3600');
  });

  it('is served but never held when a count failed', async () => {
    service.getCatalogStats.mockResolvedValue({ games: null, options: null, lastUpdated: null, degraded: true });
    const res = mockRes();
    await howItWorksController({}, res);
    expect(res.send).toHaveBeenCalled();
    expect(cacheHeader(res)).toBe('no-store');
  });
});

describe('/api/games/suggestions', () => {
  it('answers a failed read with a 500 that nothing holds', async () => {
    service.getSearchSuggestions.mockRejectedValue(new Error('game_suggestions: Timed out'));
    const res = mockRes();
    await searchSuggestionsController({ query: { q: 'half', limit: 10 } }, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(cacheHeader(res)).toBeUndefined();
  });

  it('serves a partial answer (the option half failed) but never holds it', async () => {
    const partial = Object.assign([{ type: 'title', value: 'Half-Life' }], { degraded: true });
    service.getSearchSuggestions.mockResolvedValue(partial);
    const res = mockRes();
    await searchSuggestionsController({ query: { q: 'half', limit: 10 } }, res);
    expect(res.json).toHaveBeenCalledWith(partial);
    expect(JSON.stringify(partial)).toBe('[{"type":"title","value":"Half-Life"}]');
    expect(cacheHeader(res)).toBe('no-store');
  });

  it('still caches a real answer', async () => {
    service.getSearchSuggestions.mockResolvedValue([{ type: 'title', value: 'Half-Life' }]);
    const res = mockRes();
    await searchSuggestionsController({ query: { q: 'half', limit: 10 } }, res);
    expect(cacheHeader(res)).toBe('public, max-age=0, s-maxage=600, stale-while-revalidate=3600');
  });
});
