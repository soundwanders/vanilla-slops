import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import {
  MAX_ROWS, ROW_CAP_CODE, RowCapError, truncatedRead, guardRowCap,
} from '../utils/rowCap.js';

// The database answers an over-large read with its first MAX_ROWS rows and an
// ordinary 200. The options-range facet counted 1,000 of 3,064 games that way
// (2026-11-14). These pin the guard that turns such a read into an error.

const URL_BASE = 'https://project.supabase.co/rest/v1';
const read = (overrides) => truncatedRead({
  method: 'GET', url: `${URL_BASE}/public_games?select=app_id`, status: 200, contentRange: '0-999/*', ...overrides,
});

describe('truncatedRead', () => {
  // Each case is a response measured against the live database, 2026-11-14.
  it('flags an unpaged read that came back full', () => {
    expect(read()).toMatch(/GET \/public_games was cut short at rows 0-999.*with no limit/);
  });

  it('flags a limit the server lowered to its cap', () => {
    expect(read({ url: `${URL_BASE}/public_games?select=app_id&limit=2000` })).toMatch(/limit of 2000/);
  });

  it('flags a page larger than the cap', () => {
    expect(read({ url: `${URL_BASE}/public_games?offset=0&limit=5000` })).toMatch(/limit of 5000/);
  });

  it('flags an unpaged read that also asked for a count', () => {
    expect(read({ status: 206, contentRange: '0-999/3072' })).not.toBeNull();
  });

  it('flags an RPC that returned a full cap of rows', () => {
    expect(read({ method: 'POST', url: `${URL_BASE}/rpc/anything`, contentRange: '0-999/*' })).toMatch(/POST \/rpc\/anything/);
  });

  it('does not take an embedded resource\'s limit for the read\'s own', () => {
    const url = `${URL_BASE}/public_launch_options?select=command,game_launch_options(game_app_id)&game_launch_options.limit=1`;
    expect(read({ url })).toMatch(/with no limit/);
  });

  it.each([
    ['a full page that asked for exactly the cap', { url: `${URL_BASE}/public_games?offset=1000&limit=1000`, contentRange: '1000-1999/*' }],
    ['a limit at the cap', { url: `${URL_BASE}/public_games?limit=1000` }],
    ['the last, partial page', { url: `${URL_BASE}/public_games?offset=3000&limit=1000`, contentRange: '3000-3071/*' }],
    ['a page past the end', { contentRange: '*/*' }],
    ['a read under the cap', { contentRange: '0-626/*' }],
    ['a count, which moves no rows', { method: 'HEAD', status: 206, contentRange: '0-999/3072' }],
    ['an error response', { status: 500 }],
    ['a response with no Content-Range', { contentRange: null }],
  ])('passes %s', (_, overrides) => {
    expect(read(overrides)).toBeNull();
  });

  it('never repeats the query string, which can carry what a visitor typed', () => {
    const finding = read({ url: `${URL_BASE}/public_games?select=app_id&title=ilike.*secret*` });
    expect(finding).not.toMatch(/secret|select|title/);
  });
});

function responseWith(contentRange, body = '[]') {
  return new Response(body, { status: 200, headers: { 'Content-Range': contentRange } });
}

describe('guardRowCap', () => {
  it('hands a complete response back untouched', async () => {
    const original = responseWith('0-99/*');
    const guarded = guardRowCap(async () => original);
    expect(await guarded(`${URL_BASE}/public_games`, { method: 'GET' })).toBe(original);
  });

  it('turns a truncated read into a PostgREST-shaped 500 and says so once', async () => {
    const onTruncated = vi.fn();
    const guarded = guardRowCap(async () => responseWith('0-999/*'), { onTruncated });
    const res = await guarded(`${URL_BASE}/public_games`, { method: 'GET' });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toMatchObject({ code: ROW_CAP_CODE, message: expect.stringMatching(/cut short/) });
    expect(body.hint).toMatch(/fetchAllRows/);
    expect(onTruncated).toHaveBeenCalledTimes(1);
    expect(onTruncated.mock.calls[0][0]).toBeInstanceOf(RowCapError);
  });

  it('releases the body it will not read', async () => {
    const original = responseWith('0-999/*', '[1,2,3]');
    const cancel = vi.spyOn(original.body, 'cancel');
    await guardRowCap(async () => original)(`${URL_BASE}/public_games`, { method: 'GET' });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('passes the request on exactly as given, abort signal included', async () => {
    const fetchImpl = vi.fn(async () => responseWith('0-0/*'));
    const init = { method: 'GET', headers: { apikey: 'k' }, signal: AbortSignal.timeout(1000) };
    await guardRowCap(fetchImpl)(`${URL_BASE}/public_games`, init);
    expect(fetchImpl).toHaveBeenCalledWith(`${URL_BASE}/public_games`, init);
  });

  it('still answers when reporting throws', async () => {
    const guarded = guardRowCap(async () => responseWith('0-999/*'), {
      onTruncated() { throw new Error('reporter down'); },
    });
    expect((await guarded(`${URL_BASE}/public_games`, { method: 'GET' })).status).toBe(500);
  });
});

// Through the real library, against a local server: pins what the guard relies
// on in supabase-js, so an upgrade that changed it would fail here first.
describe('the guard inside supabase-js', () => {
  let server;
  let baseUrl;
  let hits = 0;
  const rows = (n) => JSON.stringify(Array.from({ length: n }, (_, i) => ({ app_id: i + 1 })));

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      hits += 1;
      const url = new URL(req.url, 'http://x');
      if (url.pathname === '/rest/v1/silent') return; // never answers
      const limit = Number(url.searchParams.get('limit')) || Infinity;
      const n = Math.min(MAX_ROWS, limit);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Range': `0-${n - 1}/*` });
      res.end(rows(n));
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(() => {
    server.closeAllConnections();
    return new Promise((resolve) => server.close(resolve));
  });

  const client = (onTruncated = () => {}) => createClient(baseUrl, 'test-key', {
    db: { timeout: 200 },
    global: { fetch: guardRowCap(undefined, { onTruncated }) },
  });

  it('reaches the caller as an ordinary { error }, asked once and not retried', async () => {
    hits = 0;
    const onTruncated = vi.fn();
    const { data, error } = await client(onTruncated).from('capped').select('app_id');
    expect(data).toBeNull();
    expect(error).toMatchObject({ code: ROW_CAP_CODE });
    expect(hits).toBe(1);
    expect(onTruncated).toHaveBeenCalledTimes(1);
  });

  it('leaves a paged read alone', async () => {
    const { data, error } = await client().from('paged').select('app_id').range(0, MAX_ROWS - 1);
    expect(error).toBeNull();
    expect(data).toHaveLength(MAX_ROWS);
  });

  it('keeps the database timeout working', async () => {
    hits = 0;
    const started = Date.now();
    const { error } = await client().from('silent').select('*');
    expect(Date.now() - started).toBeLessThan(2000);
    expect(error?.message).toMatch(/abort/i);
    expect(hits).toBe(1);
  });
});

describe('the database client', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('has the guard on every request, reporting what it catches', async () => {
    vi.stubEnv('SUPABASE_URL', 'http://127.0.0.1:1');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key');
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const real = vi.spyOn(globalThis, 'fetch').mockResolvedValue(responseWith('0-999/*'));

    const { CLIENT_OPTIONS } = await import('../config/supabaseClient.js');
    const res = await CLIENT_OPTIONS.global.fetch(`${URL_BASE}/public_games`, { method: 'GET' });

    expect(real).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(500);
    expect(logged).toHaveBeenCalledWith(expect.stringMatching(/cut short/));
  });
});

// The server lowers any larger limit to its cap without a word, so a literal
// above it is a bug on sight. This catches one before the table is big enough
// for the guard to see it.
describe('server code', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const sources = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sources(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });

  // Code only: the comments that explain this bug quote the call that caused it.
  // A `//` is a comment when it starts a line or follows whitespace, which
  // leaves the ones inside URLs alone.
  const code = (file) => fs.readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');

  it('never asks for more rows than the server will return', () => {
    const offenders = [];
    for (const file of sources(root)) {
      const text = code(file);
      for (const [call, n] of text.matchAll(/\.limit\(\s*(\d+)/g)) {
        if (Number(n) > MAX_ROWS) offenders.push(`${path.relative(root, file)}: ${call}`);
      }
      for (const [call, from, to] of text.matchAll(/\.range\(\s*(\d+)\s*,\s*(\d+)\s*\)/g)) {
        if (Number(to) - Number(from) + 1 > MAX_ROWS) offenders.push(`${path.relative(root, file)}: ${call}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
