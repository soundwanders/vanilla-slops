import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';

// Server-rendered pages take no query string. Vercel keys its edge cache on the
// full URL, so `/game/440/team-fortress-2?r=1`, `?r=2`, ... were each a full
// render: a function call and four or five queries, on routes the `/api/` rate
// limit does not cover. pageQueryRedirect sends any query away with a cached
// 301 before anything is read. Driven through the real Express app, because
// the route patterns are the part most likely to be wrong.

// Counts reads, and fails each one the way supabase-js does: building a query
// never throws, awaiting it rejects.
const db = vi.hoisted(() => {
  const state = { reads: 0 };
  const failing = () => {
    const query = new Proxy({}, {
      get: (_, prop) => (prop === 'then'
        ? (ok, fail) => Promise.reject(new Error('no database in tests')).then(ok, fail)
        : () => query),
    });
    return query;
  };
  state.client = {
    from: () => { state.reads++; return failing(); },
    rpc: () => { state.reads++; return failing(); },
  };
  return state;
});
vi.mock('../config/supabaseClient.js', () => ({ default: db.client }));

const { hasStrayQuery } = await import('../utils/clientQuery.js');

let server;
let base;

beforeAll(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const { default: app } = await import('../app.js');
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => new Promise((resolve) => server.close(resolve)));

beforeEach(() => { db.reads = 0; });
afterEach(() => vi.unstubAllEnvs());

const get = (path) => fetch(base + path, { redirect: 'manual' });

describe('a page address with a query string', () => {
  it.each([
    ['/game/440/team-fortress-2?utm_source=reddit', '/game/440/team-fortress-2'],
    ['/game/440?r=1', '/game/440'],
    ['/game?r=1', '/game'],
    ['/engine/unity-engine?r=1', '/engine/unity-engine'],
    ['/catalog?r=1', '/catalog'],
    ['/how-it-works?r=1', '/how-it-works'],
    ['/steam-launch-options?r=1', '/steam-launch-options'],
    ['/sitemap.xml?r=1', '/sitemap.xml'],
    ['/game/440/team-fortress-2?path=440&x=1', '/game/440/team-fortress-2'],
    // Found in review: these used to count as "no query" and render under a
    // new cache entry each. On a route with no rewrite, `path` is the
    // visitor's own; bare separators carry no parameter but are new URLs.
    ['/catalog?path=1', '/catalog'],
    ['/how-it-works?path=2', '/how-it-works'],
    ['/catalog?&&', '/catalog'],
    ['/game/440/team-fortress-2?&&', '/game/440/team-fortress-2'],
    ['/game/440/team-fortress-2?path=a&path=b', '/game/440/team-fortress-2'],
    ['/engine/unity-engine?pat%68=1', '/engine/unity-engine'],
  ])('%s is sent to %s without a database read', async (from, to) => {
    const res = await get(from);
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe(to);
    expect(db.reads).toBe(0);
  });

  it('is redirected with the long edge cache in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const res = await get('/game/440/team-fortress-2?r=1');
    expect(res.status).toBe(301);
    expect(res.headers.get('cache-control')).toBe('public, max-age=1800, s-maxage=86400, stale-while-revalidate=604800');
  });

  it('never redirects off the site', async () => {
    const res = await get('/game//evil.example/x?r=1');
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toMatch(/^\/game\//);
  });
});

// What HTTP can't send from here: fetch drops a lone trailing `?` before the
// request leaves, but a browser or bot may not, and on Vercel it is a URL of
// its own.
describe('hasStrayQuery', () => {
  it.each([
    ['/catalog?', false, true],
    ['/catalog?&', false, true],
    ['/catalog?path=1', false, true],
    ['/catalog', false, false],
    ['/game/440/x?path=440/x', true, false],
    ['/game/440/x?path=440/x&r=1', true, true],
    ['/game/440/x?', true, true],
    ['/game/440/x', true, false],
  ])('%s (rewritten: %s) -> %s', (url, rewritten, stray) => {
    expect(hasStrayQuery(url, { rewritten })).toBe(stray);
  });
});

describe('what the redirect leaves alone', () => {
  // On Vercel every /game and /engine request arrives with `?path=<captured>`
  // added by the rewrite. Treating that as a visitor's query would redirect
  // every page to itself, forever.
  it('the parameter Vercel\'s rewrite adds', async () => {
    const res = await get('/game/440/team-fortress-2?path=440/team-fortress-2');
    expect(res.status).not.toBe(301);
  });

  it('a page with no query', async () => {
    const res = await get('/catalog');
    expect(res.status).not.toBe(301);
  });

  it('the API, which takes queries', async () => {
    const res = await get('/api/games?page=2');
    expect(res.status).not.toBe(301);
  });
});

describe('the per-game API routes, which take no query', () => {
  it.each([
    ['/api/games/440/launch-options?r=1', '/api/games/440/launch-options'],
    ['/api/games/440?_=1732300000', '/api/games/440'],
    ['/api/games/440/launch-options?&', '/api/games/440/launch-options'],
  ])('%s is sent to %s without a database read', async (from, to) => {
    // A redirect rather than a 400: a caller adding a cache-buster still gets
    // its answer, because fetch follows it.
    const res = await get(from);
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe(to);
    expect(db.reads).toBe(0);
  });

  it('still answer with the parameter Vercel\'s rewrite adds', async () => {
    const res = await get('/api/games/440/launch-options?path=games/440/launch-options');
    expect(res.status).not.toBe(400);
  });
});
