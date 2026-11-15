import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

// Every error the API sends uses one envelope, { error: { code, message } },
// so a client parses one shape whatever went wrong. An unknown /api path used
// to answer { error: "API endpoint not found", availableEndpoints: [...] } with
// a hand-kept list naming three of the eight endpoints, and the rate limiter
// answered { error: "..." }.

vi.mock('../config/supabaseClient.js', () => ({
  default: { from: () => { throw new Error('no database in tests'); } },
}));

let server;
let base;

beforeAll(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const { default: app } = await import('../app.js');
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => new Promise((resolve) => server.close(resolve)));

const isEnvelope = (body, code) => {
  expect(body).toEqual({
    error: { code, message: expect.any(String) },
    ...(body.requestId !== undefined && { requestId: expect.any(String) }),
  });
};

describe('an API path that does not exist', () => {
  it.each([
    ['GET', '/api/nope'],
    ['GET', '/api/games/440/nope'],
    ['GET', '/api'],
    ['POST', '/api/games'],
    ['DELETE', '/api/games/440'],
  ])('%s %s answers 404 in the standard envelope', async (method, path) => {
    const res = await fetch(base + path, { method });
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    const body = await res.json();
    isEnvelope(body, 'NOT_FOUND');
    expect(body.requestId).toEqual(expect.any(String));
  });

  it('is answered as an API path only when it is one', async () => {
    // /apiary is a page path, so it goes to the SPA fallback, not the API 404.
    const res = await fetch(`${base}/apiary`);
    const body = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
    expect(body?.error?.code).not.toBe('NOT_FOUND');
  });
});

describe('the rate limiter', () => {
  it('answers 429 in the standard envelope', async () => {
    let res;
    for (let i = 0; i <= 1000; i += 1) {
      res = await fetch(`${base}/api/nope`);
      if (res.status === 429) break;
      await res.body?.cancel();
    }
    expect(res.status).toBe(429);
    isEnvelope(await res.json(), 'RATE_LIMITED');
  }, 30000);
});

// A page path nothing answered got the homepage with a 200: /game, /engine and
// any extra segment were indexable copies of the front page. Paths starting
// with "api" without a slash got Vercel's own 404 page; vercel.json now sends
// them here (routeWiring.test.js), and they get the same answer as the rest.
describe('a page path that does not exist', () => {
  it.each([
    '/game', '/engine', '/game/440/team-fortress-2/extra', '/engine/source-engine/x',
    '/apiary', '/api-docs', '/nope',
  ])('%s answers 404 with the site\'s own page', async (path) => {
    const res = await fetch(base + path);
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
    const html = await res.text();
    expect(html).toContain('<title>Page not found — Vanilla Slops</title>');
    expect(html).toContain('name="robots" content="noindex"');
    expect(html).toContain('href="/"');
  });

  it('is held at the edge in production, since only a deployment changes it', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    try {
      const res = await fetch(`${base}/api-docs`);
      expect(res.headers.get('cache-control')).toMatch(/s-maxage=\d+/);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('a missing file is a plain 404, so a stale bundle fails visibly', async () => {
    const res = await fetch(`${base}/assets/gone-abc123.js`);
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toMatch(/text\/plain/);
  });
});
