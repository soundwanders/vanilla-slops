import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Every response the CDN can answer is a function call that never runs, and
// Vercel's Hobby plan bills function CPU. These pin which responses the edge may
// hold, for how long, and that errors and dev builds are never held.
const service = vi.hoisted(() => ({
  fetchGameWithLaunchOptions: vi.fn(),
  fetchRelatedGames: vi.fn(async () => []),
  fetchLaunchOptionsForGame: vi.fn(),
}));
vi.mock('../services/gamesService.js', () => service);

const { gamePageController } = await import('../controllers/seoController.js');
const { gameLaunchOptionsController } = await import('../controllers/gamesController.js');

const EDGE_1D = 'public, max-age=1800, s-maxage=86400, stale-while-revalidate=604800';
const TF2 = { app_id: 440, title: 'Team Fortress 2', duplicate_of: null, launch_options: [] };

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
  service.fetchGameWithLaunchOptions.mockReset();
  service.fetchLaunchOptionsForGame.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('game pages in production', () => {
  beforeEach(() => vi.stubEnv('NODE_ENV', 'production'));

  it('are edge-cached for a day', async () => {
    service.fetchGameWithLaunchOptions.mockResolvedValue(TF2);
    const res = await page('440', 'team-fortress-2');
    expect(res.send).toHaveBeenCalled();
    expect(cacheHeader(res)).toBe(EDGE_1D);
  });

  it('cache the slug redirect too', async () => {
    service.fetchGameWithLaunchOptions.mockResolvedValue(TF2);
    const res = await page('440');
    expect(res.redirect).toHaveBeenCalledWith(301, '/game/440/team-fortress-2');
    expect(cacheHeader(res)).toBe(EDGE_1D);
  });

  it('cache the duplicate-game redirect too', async () => {
    service.fetchGameWithLaunchOptions.mockResolvedValue({ app_id: 100, title: 'Condition Zero', duplicate_of: 80 });
    const res = await page('100', 'condition-zero');
    expect(res.redirect).toHaveBeenCalledWith(301, '/game/80');
    expect(cacheHeader(res)).toBe(EDGE_1D);
  });

  it('never cache the 404 for a game the catalogue does not hold', async () => {
    const missing = Object.assign(new Error('Game with ID 2767030 not found'), { code: 'GAME_NOT_FOUND' });
    service.fetchGameWithLaunchOptions.mockRejectedValue(missing);
    const res = await page('2767030');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(cacheHeader(res)).toBeUndefined();
  });

  // A 404 tells a search engine the page is gone. A failed read used to be
  // answered with one, so a database stall reported every real game as missing.
  it('answer a failed database read with an uncached 503 that asks to retry, not a 404', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    service.fetchGameWithLaunchOptions.mockRejectedValue(new Error('Failed to fetch game with ID 440'));
    const res = await page('440', 'team-fortress-2');
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.status).not.toHaveBeenCalledWith(404);
    expect(res.set).toHaveBeenCalledWith('Retry-After', '300');
    expect(cacheHeader(res)).toBeUndefined();
  });

  it('do not mistake a failure whose message says "not found" for a missing game', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    service.fetchGameWithLaunchOptions.mockRejectedValue(new Error('relation "games" not found'));
    const res = await page('440', 'team-fortress-2');
    expect(res.status).toHaveBeenCalledWith(503);
  });
});

describe('game pages in development', () => {
  it('are never cached, so a rebuild is visible at once', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    service.fetchGameWithLaunchOptions.mockResolvedValue(TF2);
    const res = await page('440', 'team-fortress-2');
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
