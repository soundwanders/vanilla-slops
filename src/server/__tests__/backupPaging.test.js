import { describe, it, expect } from 'vitest';
import { TABLES, readByKey } from '../scripts/backup-database.js';

// The backup used to page by offset with no order. A row deleted behind the
// cursor shifted the rest back by one and one was skipped; a row inserted
// behind it shifted them forward and one was written twice. The two together
// left the row count right and the backup wrong, which the count check cannot
// see. Keyset paging asks for the rows after the last key, so neither can
// happen to a row that exists for the whole export.

/** A table that honours order / gt / the two-column keyset `or` / limit / range. */
function fakeDb(rows, { onPage } = {}) {
  let pages = 0;
  const cmp = (a, b) => (a > b) - (a < b);
  const cast = (row, col, v) => (typeof row[col] === 'number' ? Number(v) : v);
  return {
    from() {
      const filters = [];
      const orders = [];
      let offset = 0;
      let limit = Infinity;
      const q = {
        select: () => q,
        order: (col) => { orders.push(col); return q; },
        gt: (col, v) => { filters.push((r) => r[col] > v); return q; },
        or(expr) {
          const m = /^(\w+)\.gt\.([^,]+),and\(\1\.eq\.\2,(\w+)\.gt\.([^)]+)\)$/.exec(expr);
          if (!m) throw new TypeError(`fake database: or=${expr}`);
          const [, a, va, b, vb] = m;
          filters.push((r) => r[a] > cast(r, a, va) || (r[a] === cast(r, a, va) && r[b] > cast(r, b, vb)));
          return q;
        },
        limit: (n) => { limit = n; return q; },
        range: (from, to) => { offset = from; limit = to - from + 1; return q; },
        then(resolve) {
          let out = rows.filter((r) => filters.every((f) => f(r)));
          // Unordered reads come back in whatever order the table holds them.
          if (orders.length) out = [...out].sort((x, y) => orders.reduce((c, col) => c || cmp(x[col], y[col]), 0));
          out = out.slice(offset, offset + Math.min(limit, 1000));
          pages += 1;
          onPage?.(pages);
          resolve({ data: out, error: null });
        },
      };
      return q;
    },
  };
}

const games = () => Array.from({ length: 2500 }, (_, i) => ({ app_id: i + 1, title: `Game ${i + 1}` }));
const links = () => Array.from({ length: 2500 }, (_, i) => ({
  game_app_id: Math.floor(i / 7) + 1,
  launch_option_id: `opt-${String(i % 7).padStart(2, '0')}`,
}));

async function readAll(db, table) {
  const out = [];
  for await (const page of readByKey(db, table)) out.push(...page);
  return out;
}

const keyOf = (table) => (r) => table.key.map((c) => r[c]).join('|');

describe('readByKey', () => {
  it('pages by every primary key the backup exports', () => {
    expect(TABLES.map((t) => t.name)).toEqual(['games', 'launch_options', 'game_launch_options']);
    expect(TABLES.every((t) => t.key.length >= 1 && t.key.length <= 2)).toBe(true);
  });

  it('reads a one-column-key table whole, once each, in key order', async () => {
    const table = TABLES[0];
    const rows = await readAll(fakeDb(games()), table);
    expect(rows.map((r) => r.app_id)).toEqual(games().map((g) => g.app_id));
  });

  it('reads a two-column-key table whole when one game\'s links straddle a page', async () => {
    const table = TABLES[2];
    const rows = await readAll(fakeDb(links()), table);
    expect(rows).toHaveLength(2500);
    expect(new Set(rows.map(keyOf(table))).size).toBe(2500);
  });

  it('writes every row that outlives the export exactly once, whatever changes mid-export', async () => {
    const table = TABLES[0];
    const rows = games();
    const survivors = rows.filter((r) => r.app_id !== 10).map((r) => r.app_id);
    // After the first page: delete a row behind the cursor, insert one ahead of it.
    const db = fakeDb(rows, {
      onPage(n) {
        if (n !== 1) return;
        rows.splice(rows.findIndex((r) => r.app_id === 10), 1);
        rows.push({ app_id: 3000, title: 'Inserted' });
      },
    });
    const ids = (await readAll(db, table)).map((r) => r.app_id);
    expect(new Set(ids).size).toBe(ids.length); // no repeats
    expect(survivors.every((id) => ids.includes(id))).toBe(true); // no holes
  });

  it('is what the old offset paging got wrong, or this test proves nothing', async () => {
    const rows = games();
    const db = fakeDb(rows, {
      onPage(n) {
        if (n !== 1) return;
        rows.splice(rows.findIndex((r) => r.app_id === 10), 1);
        rows.push({ app_id: 3000, title: 'Inserted' });
      },
    });
    const ids = [];
    for (let offset = 0; ; offset += 1000) {
      const { data } = await db.from('games').select('*').range(offset, offset + 999);
      ids.push(...data.map((r) => r.app_id));
      if (data.length < 1000) break;
    }
    // Same count as the table, so the count check passed, yet game 1001,
    // which never changed, is missing: the delete shifted it onto page one.
    expect(ids).toHaveLength(rows.length);
    expect(ids).not.toContain(1001);
  });
});
