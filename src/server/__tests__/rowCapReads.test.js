import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MAX_ROWS } from '../utils/rowCap.js';

// Every figure the site computes over the whole catalogue, run against a fake
// database that truncates exactly as the real one does: any read returns at
// most MAX_ROWS rows, a larger limit is lowered to it, and nothing says so.
// Each table holds more than MAX_ROWS rows, so a read that is not paged (or
// counted by the database) comes back short and its figure comes out wrong.
//
// The options-range facet was such a read: 1,000 of 3,064 games, 2026-11-14.
// The guard in utils/rowCap.js catches the same mistake in production; this
// catches it before merge, while the real tables may still be small enough to
// hide it (the options table held 620 rows that day, read whole in four places).

const GAMES = 2600;
const OPTIONS = 1300;
const PHANTOM_GAMES = 1200;
const DUPLICATES = [9001, 9002, 9003];
const WIDE_OPTION = 1250; // on the second page of options

const published = Array.from({ length: GAMES }, (_, i) => ({
  app_id: i + 1,
  title: `Game ${i + 1}`,
  developer: `Developer ${i % 40}`,
  publisher: `Publisher ${i % 30}`,
  engine: ['Unity Engine', 'Unreal Engine', 'Source Engine'][i % 3],
  release_date: `${2010 + (i % 15)}-01-01`,
  total_options_count: i % 14,
  duplicate_of: null,
}));

const optionId = (i) => `opt-${String(i).padStart(5, '0')}`;
const options = Array.from({ length: OPTIONS }, (_, i) => ({
  id: optionId(i),
  command: `-o${i}`,
  description: `Option ${i}`,
  risk_level: ['safe', 'caution', 'experimental'][i % 3],
  categories: [['Display', 'Performance', 'Audio', 'Network'][i % 4]],
  game_launch_options: [{ count: i === WIDE_OPTION ? 600 : (i % 7) + 1 }],
}));

// One link to a withheld option for each of the first PHANTOM_GAMES games, and
// two ordinary links from each hidden duplicate.
const links = [
  ...Array.from({ length: PHANTOM_GAMES }, (_, i) => ({
    game_app_id: i + 1, launch_option_id: `hidden-${i}`, public_launch_options: null,
  })),
  ...DUPLICATES.flatMap((appId) => [0, 1].map((n) => ({
    game_app_id: appId, launch_option_id: optionId(n), public_launch_options: { id: optionId(n) },
  }))),
];

const TABLES = {
  public_games: published,
  games: [...published, ...DUPLICATES.map((app_id) => ({ app_id, duplicate_of: 1 }))],
  public_launch_options: options,
  game_launch_options: links,
};

/**
 * A PostgREST stand-in with only the operators these reads use. An operator it
 * does not know is a TypeError, so a test can never pass by ignoring a filter.
 */
function from(table) {
  const state = { filters: [], orders: [], offset: 0, limit: Infinity, head: false, count: false, single: false };
  const where = (fn) => { state.filters.push(fn); return builder; };
  const builder = {
    select(_, opts = {}) { state.head = Boolean(opts.head); state.count = Boolean(opts.count); return builder; },
    eq: (col, v) => where((r) => r[col] === v),
    gt: (col, v) => where((r) => r[col] > v),
    gte: (col, v) => where((r) => r[col] >= v),
    lte: (col, v) => where((r) => r[col] <= v),
    in: (col, list) => where((r) => list.includes(r[col])),
    is: (col, v) => where((r) => (v === null ? r[col] == null : r[col] === v)),
    not(col, op, v) {
      if (op === 'is' && v === null) return where((r) => r[col] != null);
      if (op === 'eq') return where((r) => r[col] !== v);
      throw new TypeError(`fake database: not.${op}`);
    },
    order(col, { ascending = true } = {}) { state.orders.push([col, ascending]); return builder; },
    range(a, b) { state.offset = a; state.limit = b - a + 1; return builder; },
    limit(n, opts) { if (!opts?.referencedTable) state.limit = n; return builder; },
    maybeSingle() { state.single = true; return builder; },
    then(resolve, reject) {
      return Promise.resolve().then(() => {
        let rows = TABLES[table].filter((r) => state.filters.every((f) => f(r)));
        const total = rows.length;
        if (state.head) return { data: null, count: state.count ? total : null, error: null };
        for (const [col, asc] of [...state.orders].reverse()) {
          rows = [...rows].sort((a, b) => ((a[col] > b[col]) - (a[col] < b[col])) * (asc ? 1 : -1));
        }
        // The cap: silently, whatever was asked for.
        rows = rows.slice(state.offset, state.offset + Math.min(state.limit, MAX_ROWS));
        if (state.single) return { data: rows[0] ?? null, count: null, error: null };
        return { data: rows, count: state.count ? total : null, error: null };
      }).then(resolve, reject);
    },
  };
  return builder;
}

vi.mock('../config/supabaseClient.js', () => ({ default: { from } }));

async function load() {
  vi.resetModules();
  return import('../services/gamesService.js');
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

const count = (rows, test) => rows.filter(test).length;

describe('the fake database', () => {
  it('truncates like the real one, or these tests prove nothing', async () => {
    const unpaged = await from('public_games').select('app_id');
    const overLimit = await from('public_launch_options').select('id').limit(2000);
    expect(unpaged.data).toHaveLength(MAX_ROWS);
    expect(overLimit.data).toHaveLength(MAX_ROWS);
    expect(GAMES).toBeGreaterThan(MAX_ROWS);
    expect(OPTIONS).toBeGreaterThan(MAX_ROWS);
    expect(links.length).toBeGreaterThan(MAX_ROWS);
  });
});

describe('getFacets reads past the row cap', () => {
  it('counts every game into the option-count ranges', async () => {
    const { getFacets } = await load();
    const { optionsRanges } = await getFacets();
    const n = (min, max) => count(published, (g) => g.total_options_count >= min && g.total_options_count <= max);
    expect(optionsRanges).toEqual([
      { label: 'No options', min: 0, max: 0, count: n(0, 0) },
      { label: '1-5 options', min: 1, max: 5, count: n(1, 5) },
      { label: '6-10 options', min: 6, max: 10, count: n(6, 10) },
      { label: '11+ options', min: 11, max: 13, count: n(11, Infinity) },
    ]);
    expect(optionsRanges.reduce((sum, r) => sum + r.count, 0)).toBe(GAMES);
  });

  it('counts every option into the risk and category facets', async () => {
    const { getFacets } = await load();
    const { riskLevels, categories } = await getFacets();
    expect(riskLevels.reduce((sum, r) => sum + r.count, 0)).toBe(OPTIONS);
    expect(categories.reduce((sum, c) => sum + c.count, 0)).toBe(OPTIONS);
  });

  it('ranks popular options from every option, not the first page', async () => {
    const { getFacets } = await load();
    const { popularOptions } = await getFacets();
    expect(popularOptions[0]).toMatchObject({ command: `-o${WIDE_OPTION}`, count: 600 });
  });

  it('counts every game into the developer and year facets', async () => {
    const { getFacets } = await load();
    const { developers, releaseYears } = await getFacets();
    // 40 developers with 65 games each; the facet lists the top 20. A read cut
    // at the cap would have counted 25 each.
    expect(developers).toHaveLength(20);
    expect(developers.every((d) => d.count === GAMES / 40)).toBe(true);
    expect(releaseYears).toHaveLength(15);
  });
});

describe('getCatalogGrain reads past the row cap', () => {
  it('counts every option, every link and every game with an option', async () => {
    const { getCatalogGrain } = await load();
    const grain = await getCatalogGrain();

    // Duplicates' links are discounted from the options they point at.
    const reach = options.map((o, i) => o.game_launch_options[0].count - (i < 2 ? DUPLICATES.length : 0));
    expect(grain.options).toBe(count(reach, (r) => r > 0));
    expect(grain.links).toBe(reach.filter((r) => r > 0).reduce((sum, r) => sum + r, 0));
    expect(grain.games).toBe(GAMES);

    // A game whose only option is withheld has nothing to show.
    const emptied = count(published, (g) => g.app_id <= PHANTOM_GAMES && g.total_options_count === 1);
    expect(grain.gamesWithOptions).toBe(count(published, (g) => g.total_options_count > 0) - emptied);
  });
});
