import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

/**
 * A server-rendered route has to be declared in four places, and three of them
 * are silent when they are wrong:
 *
 *   app.js          the route itself
 *   vercel.json     a rewrite to the serverless function, AND an exclusion from
 *                   the edge security-header block — Express sets its own via
 *                   helmet, and a route matched by both ends up with two
 *                   Content-Security-Policy headers, which browsers intersect
 *                   into something stricter than either was meant to be
 *   vite.config.js  the dev proxy — miss it and the route renders the SPA
 *                   locally while working in production, or the reverse
 *   sitemap         or the page exists and nothing links search engines to it
 *
 * CLAUDE.md warns that vercel.json and vite.config.js "describe the same routes,
 * and dev silently diverges from prod when they drift". This is that warning
 * made executable.
 */
const SERVER_ROUTES = ['/how-it-works', '/catalog', '/steam-launch-options'];

describe('server-rendered route wiring', () => {
  const app = read('src/server/app.js');
  const vercel = JSON.parse(read('vercel.json'));
  const vite = read('vite.config.js');
  const seo = read('src/server/controllers/seoController.js');

  it.each(SERVER_ROUTES)('%s is registered in app.js', (route) => {
    expect(app).toContain(`app.get('${route}'`);
  });

  it.each(SERVER_ROUTES)('%s rewrites to the serverless function on Vercel', (route) => {
    const hit = vercel.rewrites.find((r) => r.source === route);
    expect(hit, `no vercel rewrite for ${route}`).toBeTruthy();
    expect(hit.destination).toBe('/api/index.js');
  });

  it.each(SERVER_ROUTES)('%s is excluded from the edge security headers', (route) => {
    // Express already sends CSP, HSTS, X-Frame-Options and the rest through
    // helmet. A route that also matches this block receives both, and two CSP
    // headers are intersected rather than replaced.
    const block = vercel.headers.find((h) => h.source.includes('(?!'));
    expect(block, 'no negative-lookahead header block found').toBeTruthy();
    expect(block.source).toContain(route.replace(/^\//, ''));
  });

  it('the game rewrite parameter matches the one seoController strips', () => {
    // Vercel puts the rewrite's named parameter into the query. seoController
    // drops it by name from redirect URLs; rename one without the other and it
    // leaks into public URLs again, as `?path=440` did on 2026-09-27.
    const hit = vercel.rewrites.find((r) => r.source.startsWith('/game/'));
    const param = hit.source.match(/^\/game\/:(\w+)\*$/)?.[1];
    expect(param, `unexpected /game rewrite source: ${hit.source}`).toBeTruthy();
    expect(seo).toContain(`const GAME_REWRITE_PARAM = '${param}';`);
  });

  it('is only safe to exclude them because helmet is mounted app-wide', () => {
    // If helmet ever stops covering these routes, the exclusion above silently
    // turns into "no security headers at all" rather than "no duplicates".
    expect(app).toContain('helmet');
    expect(app).toMatch(/app\.use\(\s*helmet\(/);
  });

  it.each(SERVER_ROUTES)('%s is proxied to Express in dev', (route) => {
    expect(vite, `vite.config.js does not proxy ${route}`).toContain(`'${route}':`);
  });

  it.each(SERVER_ROUTES)('%s appears in the sitemap', (route) => {
    expect(seo).toContain(`\${SITE_URL}${route}</loc>`);
  });

  // /engine/:slug is a prefix route, wired the way /game is: a `:path*`
  // rewrite, a `^/engine/` proxy, and an exclusion ending in a slash.
  it('/engine/:slug is registered, rewritten, excluded and proxied', () => {
    expect(app).toContain(`app.get('/engine/:slug'`);
    const hit = vercel.rewrites.find((r) => r.source === '/engine/:path*');
    expect(hit, 'no vercel rewrite for /engine/:path*').toBeTruthy();
    expect(hit.destination).toBe('/api/index.js');
    const block = vercel.headers.find((h) => h.source.includes('(?!'));
    expect(block.source).toContain('|engine/|');
    expect(vite).toContain(`'^/engine/':`);
  });

  it('/engine/:slug pages appear in the sitemap', () => {
    expect(seo).toContain('`${SITE_URL}/engine/${h.slug}`');
  });

  it('the engine redirect never carries the rewrite parameter', () => {
    // The engine rewrite injects `path` exactly as the game one does. The hub
    // redirect sidesteps it by sending a bare path; if it ever starts
    // forwarding the query, it must drop GAME_REWRITE_PARAM the way the game
    // redirects do.
    expect(seo).toContain('res.redirect(301, `/engine/${hub.slug}`)');
  });

  it('proxies in dev exactly what it rewrites in prod', () => {
    // Both lists also carry /api and /game, which are matched by prefix rather
    // than exactly; this asserts the page routes specifically.
    const rewritten = vercel.rewrites
      .map((r) => r.source)
      .filter((s) => SERVER_ROUTES.includes(s));
    expect(rewritten.sort()).toEqual([...SERVER_ROUTES].sort());
  });
});
