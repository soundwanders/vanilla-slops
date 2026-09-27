import { describe, it, expect, vi, beforeEach } from 'vitest';
import { preserveQuery } from '../utils/preserveQuery.js';

describe('preserveQuery', () => {
  it('carries the query string onto the redirect target', () => {
    expect(preserveQuery('/game/440/team-fortress-2', '/game/440?x=1')).toBe('/game/440/team-fortress-2?x=1');
  });

  it('keeps every parameter, in order and still encoded', () => {
    expect(preserveQuery('/game/440/team-fortress-2', '/game/440/wrong?utm_source=reddit&q=a%20b'))
      .toBe('/game/440/team-fortress-2?utm_source=reddit&q=a%20b');
  });

  it('adds nothing when there is no query', () => {
    expect(preserveQuery('/game/440/team-fortress-2', '/game/440')).toBe('/game/440/team-fortress-2');
  });

  it('drops a bare "?" rather than leaving a dangling one', () => {
    expect(preserveQuery('/game/440/team-fortress-2', '/game/440?')).toBe('/game/440/team-fortress-2');
  });

  it('tolerates a missing request URL', () => {
    expect(preserveQuery('/game/440/team-fortress-2', undefined)).toBe('/game/440/team-fortress-2');
  });
});

// The helper is only half of it: what went wrong in production was a redirect
// that never passed the query on. These drive the real controller, with the
// database mocked, so a redirect that stops using the helper fails here.
const service = vi.hoisted(() => ({
  fetchGameWithLaunchOptions: vi.fn(),
  fetchRelatedGames: vi.fn(async () => []),
  getGamesForSitemap: vi.fn(),
  getCatalogStats: vi.fn(),
  getCatalogGrain: vi.fn(),
}));
vi.mock('../services/gamesService.js', () => service);

const { gamePageController } = await import('../controllers/seoController.js');

function run(appid, slug, originalUrl) {
  const res = { redirect: vi.fn(), status: vi.fn().mockReturnThis(), type: vi.fn().mockReturnThis(), send: vi.fn() };
  return gamePageController({ params: { appid, slug }, originalUrl }, res).then(() => res);
}

describe('game page redirects keep the query string', () => {
  beforeEach(() => service.fetchGameWithLaunchOptions.mockReset());

  it('the canonical-slug redirect', async () => {
    service.fetchGameWithLaunchOptions.mockResolvedValue({ app_id: 440, title: 'Team Fortress 2', duplicate_of: null });
    const res = await run('440', undefined, '/game/440?x=1');
    expect(res.redirect).toHaveBeenCalledWith(301, '/game/440/team-fortress-2?x=1');
  });

  it('the duplicate-game redirect', async () => {
    service.fetchGameWithLaunchOptions.mockResolvedValue({ app_id: 100, title: 'Condition Zero', duplicate_of: 80 });
    const res = await run('100', 'condition-zero', '/game/100/condition-zero?utm_source=reddit');
    expect(res.redirect).toHaveBeenCalledWith(301, '/game/80?utm_source=reddit');
  });

  it('a slug redirect without a query stays clean', async () => {
    service.fetchGameWithLaunchOptions.mockResolvedValue({ app_id: 440, title: 'Team Fortress 2', duplicate_of: null });
    const res = await run('440', 'wrong-slug', '/game/440/wrong-slug');
    expect(res.redirect).toHaveBeenCalledWith(301, '/game/440/team-fortress-2');
  });
});
