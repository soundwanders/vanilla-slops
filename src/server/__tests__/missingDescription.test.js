import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 248 of 649 published options had no written description (2026-11-22). The
// API used to fill the gap with "No description available" and an unnamed
// source with "Community", text the catalogue does not hold, and both page
// renderers then filtered the first one back out. Now the API says `null`,
// and the pages point to where the option is explained.

const db = vi.hoisted(() => ({ rows: [] }));
vi.mock('../config/supabaseClient.js', () => {
  const query = () => {
    const q = new Proxy({}, {
      get: (_, prop) => (prop === 'then'
        ? (ok, fail) => Promise.resolve({ data: db.rows, error: null }).then(ok, fail)
        : () => q),
    });
    return q;
  };
  return { default: { from: query } };
});

const OPTION = {
  id: 'a1', command: '-vconsole', description: null, upvotes: 0, downvotes: 0, verified: false,
  source: 'PCGamingWiki', source_url: 'https://www.pcgamingwiki.com/wiki/Half-Life:_Alyx',
  created_at: '2026-11-15T00:00:00Z', last_verified_at: null, verification_method: 'pcgamingwiki-scrape',
  usage_example: null, effect: null, risk_level: 'experimental', categories: [], engine_compatibility: [],
};
const link = (option) => ({ description: null, source: null, source_url: null, last_verified_at: null, public_launch_options: option });

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('the launch-options API', () => {
  it('sends null for a missing description, never invented text', async () => {
    db.rows = [link(OPTION)];
    const { fetchLaunchOptionsForGame } = await import('../services/gamesService.js');
    const [option] = await fetchLaunchOptionsForGame(546560);
    expect(option.description).toBeNull();
    expect(option.source).toBe('PCGamingWiki');
    expect(option.source_url).toBe(OPTION.source_url);
  });

  it('sends null for an unnamed source, never "Community"', async () => {
    db.rows = [link({ ...OPTION, source: null })];
    const { fetchLaunchOptionsForGame } = await import('../services/gamesService.js');
    const [option] = await fetchLaunchOptionsForGame(546560);
    expect(option.source).toBeNull();
  });

  it('still sends a real description as it is', async () => {
    db.rows = [link({ ...OPTION, description: 'Opens the developer console' })];
    const { fetchLaunchOptionsForGame } = await import('../services/gamesService.js');
    const [option] = await fetchLaunchOptionsForGame(546560);
    expect(option.description).toBe('Opens the developer console');
  });
});

// table.js touches the DOM when it loads, so the renderers' wiring is checked
// by reading them; the game page's output is tested in cacheHeaders.test.js,
// and both are checked in a real browser before release.
describe('both renderers', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const table = fs.readFileSync(path.join(root, 'src/client/js/ui/table.js'), 'utf8');
  const seo = fs.readFileSync(path.join(root, 'src/server/controllers/seoController.js'), 'utf8');

  it.each([['table.js', table], ['seoController.js', seo]])(
    '%s fills an empty description slot with the shared pointer',
    (_, source) => {
      expect(source).toMatch(/: descriptionPointerHTML\(\{ label: \w+\.source \? humanizeSource\(\w+\.source\) : '', href: safeHttpUrl\(\w+\.source_url\) \}, escapeHtml\)/);
      expect(source).not.toContain('no description available');
      expect(source).not.toMatch(/\|\| 'Community'/);
    },
  );
});
