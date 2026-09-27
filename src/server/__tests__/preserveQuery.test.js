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

  it('drops empty segments', () => {
    expect(preserveQuery('/t', '/g?&&x=1&')).toBe('/t?x=1');
  });
});

// Every originalUrl below is what production actually handed Express on
// 2026-09-27, read back from the Location headers the first version shipped.
// Vercel's `/game/:path*` rewrite appends `path=<captured>`, and overwrites a
// `path` the visitor sent, so that name is always the platform's.
describe('preserveQuery — Vercel rewrite parameter', () => {
  const drop = ['path'];
  it.each([
    ['/game/440?path=440', '/t'],
    ['/game/440?x=1&path=440', '/t?x=1'],
    ['/game/440/wrong-slug?utm_source=reddit&path=440%2Fwrong-slug', '/t?utm_source=reddit'],
    ['/game/440?q=a%20b&r=%E2%9C%93&path=440', '/t?q=a%20b&r=%E2%9C%93'],
    ['/game/440?%2F%2Fevil.example&path=440', '/t?%2F%2Fevil.example'],
    ['/game/440?x=1&path=440&y=2', '/t?x=1&y=2'],
    ['/game/440?pat%68=440&x=1', '/t?x=1'],
    ['/game/440?pathway=1&path=440', '/t?pathway=1'],
  ])('%s -> %s', (originalUrl, expected) => {
    expect(preserveQuery('/t', originalUrl, { drop })).toBe(expected);
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

  it('never forwards the parameter Vercel\'s rewrite injects', async () => {
    service.fetchGameWithLaunchOptions.mockResolvedValue({ app_id: 440, title: 'Team Fortress 2', duplicate_of: null });
    const bare = await run('440', undefined, '/game/440?path=440');
    expect(bare.redirect).toHaveBeenCalledWith(301, '/game/440/team-fortress-2');
    const withQuery = await run('440', 'wrong-slug', '/game/440/wrong-slug?utm_source=reddit&path=440%2Fwrong-slug');
    expect(withQuery.redirect).toHaveBeenCalledWith(301, '/game/440/team-fortress-2?utm_source=reddit');
  });

  it('never forwards it on the duplicate-game redirect either', async () => {
    service.fetchGameWithLaunchOptions.mockResolvedValue({ app_id: 100, title: 'Condition Zero', duplicate_of: 80 });
    const res = await run('100', undefined, '/game/100?x=1&path=100');
    expect(res.redirect).toHaveBeenCalledWith(301, '/game/80?x=1');
  });

  it('a slug redirect without a query stays clean', async () => {
    service.fetchGameWithLaunchOptions.mockResolvedValue({ app_id: 440, title: 'Team Fortress 2', duplicate_of: null });
    const res = await run('440', 'wrong-slug', '/game/440/wrong-slug');
    expect(res.redirect).toHaveBeenCalledWith(301, '/game/440/team-fortress-2');
  });
});
