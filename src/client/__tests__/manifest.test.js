import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const client = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(client, p), 'utf8');

// The manifest kept the pre-1.6.0 palette (#0d0d0f) for two months after the
// pages moved on, because nothing tied the two together. A manifest holds one
// colour, and the stylesheet's default theme is light, so it takes the light
// theme-color the pages declare.
describe('site.webmanifest', () => {
  const manifest = JSON.parse(read('public/site.webmanifest'));
  const lightThemeColor = read('index.html')
    .match(/<meta name="theme-color" media="\(prefers-color-scheme: light\)" content="(#[0-9a-f]{6})"/i)?.[1];

  it('uses the light theme-color the pages declare', () => {
    expect(lightThemeColor, 'no light theme-color meta in index.html').toBeTruthy();
    expect(manifest.theme_color).toBe(lightThemeColor);
    expect(manifest.background_color).toBe(lightThemeColor);
  });

  it('describes the site the way the pages do, without "verified"', () => {
    expect(manifest.description).not.toMatch(/verified/i);
  });
});
