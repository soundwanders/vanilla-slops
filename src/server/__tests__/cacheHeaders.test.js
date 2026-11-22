import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Every response the CDN can answer is a function call that never runs, and
// Vercel's Hobby plan bills function CPU. These pin which responses the edge may
// hold, for how long, and that errors and dev builds are never held.
const service = vi.hoisted(() => ({
  fetchGameRow: vi.fn(),
  fetchRelatedGames: vi.fn(async () => []),
  fetchLaunchOptionsForGame: vi.fn(),
  fetchGameWithLaunchOptions: vi.fn(),
  fetchGames: vi.fn(),
  getGameStatistics: vi.fn(),
}));
vi.mock('../services/gamesService.js', () => service);

const { gamePageController } = await import('../controllers/seoController.js');
const {
  gameLaunchOptionsController, gamesController, gameDetailsController, gameStatisticsController,
} = await import('../controllers/gamesController.js');

const EDGE_1D = 'public, max-age=1800, s-maxage=86400, stale-while-revalidate=604800';
const EDGE_1H_ONLY = 'public, max-age=0, s-maxage=3600';
const API_1D = 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800';
const TF2 = { app_id: 440, title: 'Team Fortress 2', duplicate_of: null };
const notFound = (id) => Object.assign(new Error(`Game with ID ${id} not found`), { code: 'GAME_NOT_FOUND' });

function mockRes() {
  const res = {
    set: vi.fn(() => res), redirect: vi.fn(), send: vi.fn(), json: vi.fn(),
    status: vi.fn(() => res), type: vi.fn(() => res),
  };
  return res;
}

function cacheHeader(res) {
  const call = res.set.mock.calls.find(([name]) => name === 'Cache-Control');
  return call?.[1];
}

async function page(appid, slug) {
  const res = mockRes();
  await gamePageController({ params: { appid, slug }, originalUrl: `/game/${appid}${slug ? `/${slug}` : ''}` }, res);
  return res;
}

beforeEach(() => {
  for (const fn of Object.values(service)) fn.mockReset();
  service.fetchRelatedGames.mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('game pages in production', () => {
  beforeEach(() => vi.stubEnv('NODE_ENV', 'production'));

  it('are edge-cached for a day', async () => {
    service.fetchGameRow.mockResolvedValue(TF2);
    service.fetchLaunchOptionsForGame.mockResolvedValue([]);
    const res = await page('440', 'team-fortress-2');
    expect(res.send).toHaveBeenCalled();
    expect(cacheHeader(res)).toBe(EDGE_1D);
  });

  it('cache the slug redirect too, decided on the game row alone', async () => {
    service.fetchGameRow.mockResolvedValue(TF2);
    const res = await page('440');
    expect(res.redirect).toHaveBeenCalledWith(301, '/game/440/team-fortress-2');
    expect(cacheHeader(res)).toBe(EDGE_1D);
    // Every slug variant used to pay for the options it never showed.
    expect(service.fetchLaunchOptionsForGame).not.toHaveBeenCalled();
    expect(service.fetchRelatedGames).not.toHaveBeenCalled();
  });

  it('cache the duplicate-game redirect too, decided on the game row alone', async () => {
    service.fetchGameRow.mockResolvedValue({ app_id: 100, title: 'Condition Zero', duplicate_of: 80 });
    const res = await page('100', 'condition-zero');
    expect(res.redirect).toHaveBeenCalledWith(301, '/game/80');
    expect(cacheHeader(res)).toBe(EDGE_1D);
    expect(service.fetchLaunchOptionsForGame).not.toHaveBeenCalled();
  });

  // A scrape can add the game, so an hour at the edge and never the browser.
  // It used to be held nowhere, so a random App ID reached the database
  // every time.
  it('hold the 404 for a game the catalogue does not hold for an hour, at the edge only', async () => {
    service.fetchGameRow.mockRejectedValue(notFound(2767030));
    const res = await page('2767030');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(cacheHeader(res)).toBe(EDGE_1H_ONLY);
  });

  // `parseInt` read all of these as 440, and each spelling is its own cache
  // entry, so each one rendered TF2's page from the database.
  it.each(['440abc', '0440', '440.0', '+440', ' 440', '440e0', '99999999999999999999', '0', '-1'])(
    'answer an App ID not written canonically (%j) with a held 404 and no read',
    async (appid) => {
      const res = await page(appid, 'team-fortress-2');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(cacheHeader(res)).toBe(EDGE_1D);
      expect(service.fetchGameRow).not.toHaveBeenCalled();
    },
  );

  // A 404 tells a search engine the page is gone. A failed read used to be
  // answered with one, so a database stall reported every real game as missing.
  it('answer a failed database read with an uncached 503 that asks to retry, not a 404', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    service.fetchGameRow.mockRejectedValue(new Error('Failed to fetch game with ID 440'));
    const res = await page('440', 'team-fortress-2');
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.status).not.toHaveBeenCalledWith(404);
    expect(res.set).toHaveBeenCalledWith('Retry-After', '300');
    expect(cacheHeader(res)).toBeUndefined();
  });

  it('answer a failed options read with the same uncached 503', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    service.fetchGameRow.mockResolvedValue(TF2);
    service.fetchLaunchOptionsForGame.mockRejectedValue(new Error('Failed to fetch launch options for game 440'));
    const res = await page('440', 'team-fortress-2');
    expect(res.status).toHaveBeenCalledWith(503);
    expect(cacheHeader(res)).toBeUndefined();
  });

  it('do not mistake a failure whose message says "not found" for a missing game', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    service.fetchGameRow.mockRejectedValue(new Error('relation "games" not found'));
    const res = await page('440', 'team-fortress-2');
    expect(res.status).toHaveBeenCalledWith(503);
  });
});

describe('a game page option with no written description', () => {
  it('points to its source where the description would be, never "null"', async () => {
    service.fetchGameRow.mockResolvedValue({ app_id: 546560, title: 'Half-Life: Alyx', duplicate_of: null });
    service.fetchLaunchOptionsForGame.mockResolvedValue([{
      id: 'a1', command: '-vconsole', description: null, source: 'PCGamingWiki',
      source_url: 'https://www.pcgamingwiki.com/wiki/Half-Life:_Alyx', risk_level: 'experimental',
      categories: [], engine_compatibility: [], created_at: '2026-11-15T00:00:00Z',
    }]);
    const res = await page('546560', 'half-life-alyx');
    const html = res.send.mock.calls[0][0];
    expect(html).toContain('What PCGamingWiki says<');
    expect(html).toContain('href="https://www.pcgamingwiki.com/wiki/Half-Life:_Alyx"');
    expect(html).not.toMatch(/>\s*null\s*</);
    expect(html).not.toContain('No description available');
  });
});

describe('game pages in development', () => {
  it('are never cached, so a rebuild is visible at once', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    service.fetchGameRow.mockResolvedValue(TF2);
    service.fetchLaunchOptionsForGame.mockResolvedValue([]);
    const res = await page('440', 'team-fortress-2');
    expect(cacheHeader(res)).toBe('no-store');
  });
});

// Neither is called by the site, but both are public and documented, and
// uncached each was a function call and two queries every time.
describe('GET /api/games/:id and /api/games/statistics', () => {
  beforeEach(() => vi.stubEnv('NODE_ENV', 'production'));

  it('cache a game\'s details for a day', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    service.fetchGameWithLaunchOptions.mockResolvedValue({ ...TF2, launchOptions: [] });
    const res = mockRes();
    await gameDetailsController({ params: { id: '440' } }, res);
    expect(res.json).toHaveBeenCalled();
    expect(cacheHeader(res)).toBe(API_1D);
  });

  it('hold the 404 for a game the catalogue does not hold for an hour, at the edge only', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    service.fetchGameWithLaunchOptions.mockRejectedValue(notFound(2767030));
    const res = mockRes();
    await gameDetailsController({ params: { id: '2767030' } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(cacheHeader(res)).toBe('public, max-age=0, s-maxage=3600, stale-while-revalidate=0');
  });

  it('refuse an App ID not written canonically without a read', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const res = mockRes();
    await gameDetailsController({ params: { id: '440abc' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(service.fetchGameWithLaunchOptions).not.toHaveBeenCalled();
  });

  it('cache the statistics for a day', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    service.getGameStatistics.mockResolvedValue({ totalGames: 3, gamesWithOptions: 2 });
    const res = mockRes();
    await gameStatisticsController({ query: {} }, res);
    expect(res.json).toHaveBeenCalled();
    expect(cacheHeader(res)).toBe(API_1D);
  });

  it('never cache a failure', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    service.getGameStatistics.mockRejectedValue(new Error('db down'));
    const res = mockRes();
    await gameStatisticsController({ query: {} }, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(cacheHeader(res)).toBeUndefined();
  });
});

// The listing. What validateRequest leaves in req.query is the same for all of
// these (defaults filled in), so only the raw URL can tell them apart.
describe('GET /api/games', () => {
  const PARSED = { page: 1, limit: 20, sort: 'featured', order: 'desc' };
  const PAGE = { games: [], total: 0, totalPages: 0, currentPage: 1, hasNextPage: false, hasPrevPage: false };
  const EDGE_DAY_API = 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800';
  const EDGE_SHORT_API = 'public, max-age=0, s-maxage=60, stale-while-revalidate=600';

  async function list(originalUrl) {
    const res = mockRes();
    await gamesController({ query: { ...PARSED }, originalUrl }, res);
    return res;
  }

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    service.fetchGames.mockResolvedValue(PAGE);
  });

  // The homepage's first request. A bot spread over 15 regions found it
  // uncached nearly everywhere on 2026-11-14, under a 60 s + 10 min window.
  it('caches the homepage request for a day', async () => {
    const res = await list('/api/games?page=1&limit=20&sort=featured&order=desc');
    expect(res.json).toHaveBeenCalled();
    expect(cacheHeader(res)).toBe(EDGE_DAY_API);
  });

  it('caches it for a day as Vercel delivers it, with the rewrite parameter added', async () => {
    const res = await list('/api/games?page=1&limit=20&sort=featured&order=desc&path=games');
    expect(cacheHeader(res)).toBe(EDGE_DAY_API);
  });

  // cron-job.org asks for exactly this URL every three days, and it has to
  // reach Supabase to keep the free-tier project from pausing.
  it('keeps the short window for a bare request, the keepalive', async () => {
    const res = await list('/api/games');
    expect(cacheHeader(res)).toBe(EDGE_SHORT_API);
  });

  it('keeps the short window for a bare request as Vercel delivers it', async () => {
    const res = await list('/api/games?path=games');
    expect(cacheHeader(res)).toBe(EDGE_SHORT_API);
  });

  it('keeps the short window when there is no URL to read', async () => {
    const res = await list(undefined);
    expect(cacheHeader(res)).toBe(EDGE_SHORT_API);
  });

  // health.yml's `_hc` timestamp is a new cache key on every run, so the long
  // window cannot stop it reaching the function.
  it('caches the health check for a day, which its cache-buster makes harmless', async () => {
    const res = await list('/api/games?limit=1&_hc=1794680113&path=games');
    expect(cacheHeader(res)).toBe(EDGE_DAY_API);
  });

  it('never caches a failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    service.fetchGames.mockRejectedValue(new Error('Failed to fetch games from database'));
    const res = await list('/api/games?page=1&limit=20&sort=featured&order=desc');
    expect(res.status).toHaveBeenCalledWith(500);
    expect(cacheHeader(res)).toBeUndefined();
  });

  it('is never cached in development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const res = await list('/api/games?page=1&limit=20&sort=featured&order=desc');
    expect(cacheHeader(res)).toBe('no-store');
  });
});

describe('GET /api/games/:id/launch-options', () => {
  it('is edge-cached for a day in production, never in the browser', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    service.fetchLaunchOptionsForGame.mockResolvedValue([{ command: '-novid' }]);
    const res = mockRes();
    await gameLaunchOptionsController({ params: { id: '440' } }, res);
    expect(res.json).toHaveBeenCalledWith([{ command: '-novid' }]);
    expect(cacheHeader(res)).toBe('public, max-age=0, s-maxage=86400, stale-while-revalidate=604800');
  });

  it('never caches a failure', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    service.fetchLaunchOptionsForGame.mockRejectedValue(new Error('db down'));
    const res = mockRes();
    await gameLaunchOptionsController({ params: { id: '440' } }, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(cacheHeader(res)).toBeUndefined();
  });

  it('is never cached in development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    service.fetchLaunchOptionsForGame.mockResolvedValue([]);
    const res = mockRes();
    await gameLaunchOptionsController({ params: { id: '440' } }, res);
    expect(cacheHeader(res)).toBe('no-store');
  });
});
