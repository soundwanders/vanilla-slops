import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

/**
 * Until 1.7.0, tokens.css named Inter and JetBrains Mono and nothing loaded
 * either, so every visitor saw their own system font and nothing failed. A
 * missing font never errors; it just quietly falls back. These tests are the
 * error it never raised.
 */
describe('self-hosted fonts', () => {
  const fontsCss = read('src/client/styles/fonts.css');
  const tokens = read('src/client/styles/tokens.css');
  const declared = new Set([...fontsCss.matchAll(/font-family:\s*'([^']+)'/g)].map((m) => m[1]));
  const sources = [...fontsCss.matchAll(/url\('([^']+)'\)/g)].map((m) => m[1]);

  it.each(['--font-family-base', '--font-family-mono'])('%s leads with a face fonts.css loads', (token) => {
    const value = tokens.match(new RegExp(`${token}:\\s*([^;]+);`))?.[1];
    const first = value?.split(',')[0].trim().replace(/^['"]|['"]$/g, '');
    expect(declared.has(first), `${token} leads with "${first}", which fonts.css never declares`).toBe(true);
  });

  it('main.css imports fonts.css', () => {
    expect(read('src/client/styles/main.css')).toContain("@import 'fonts.css';");
  });

  it('every @font-face source exists in public/', () => {
    expect(sources.length).toBeGreaterThan(0);
    for (const url of sources) {
      expect(fs.existsSync(path.join(root, 'src/client/public', url)), `missing ${url}`).toBe(true);
    }
  });

  it('every preloaded font is one the stylesheet uses', () => {
    // A preload for a name the stylesheet does not use downloads the font
    // twice, which is worse than no preload at all.
    const pages = ['src/client/index.html', 'src/client/public/404.html', 'src/server/controllers/seoController.js'];
    const preloads = pages.flatMap((p) => [...read(p).matchAll(/\/fonts\/[\w.-]+\.woff2/g)].map((m) => m[0]));
    expect(preloads.length).toBeGreaterThan(0);
    for (const href of preloads) expect(sources, `${href} is not in fonts.css`).toContain(href);
  });

  it('caches /fonts/ as immutable, which is why files are never replaced in place', () => {
    const vercel = JSON.parse(read('vercel.json'));
    const rule = vercel.headers.find((h) => h.source === '/fonts/(.*)');
    expect(rule, 'no Cache-Control rule for /fonts/').toBeTruthy();
    expect(rule.headers.find((h) => h.key === 'Cache-Control')?.value).toContain('immutable');
  });

  it('ships the licence the SIL OFL requires with redistributed fonts', () => {
    expect(read('src/client/public/fonts/OFL.txt')).toContain('SIL Open Font License, Version 1.1');
  });
});
