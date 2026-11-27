import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// A failed read used to reach Sentry as "Failed to fetch game with ID 40420"
// and nothing else (2026-11-26): the Supabase error went only to Vercel's
// runtime logs, which Hobby keeps for an hour. The thrown error now names
// what failed. A PostgREST or Postgres code is safe to send as it is; a
// message is sent only when there is no code, because a coded error such as a
// filter parse failure can echo the visitor's search back.

const db = vi.hoisted(() => ({ error: null }));
vi.mock('../config/supabaseClient.js', () => {
  const query = () => {
    const q = new Proxy({}, {
      get: (_, prop) => (prop === 'then'
        ? (ok, fail) => Promise.resolve({ data: null, count: null, error: db.error }).then(ok, fail)
        : () => q),
    });
    return q;
  };
  return { default: { from: query } };
});

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const POOL_STALL = { code: 'PGRST003', message: 'Timed out acquiring connection from connection pool.', details: null, hint: null };
const NETWORK = { code: '', message: 'TypeError: fetch failed', details: '', hint: '' };
const ECHOES_INPUT = { code: 'PGRST100', message: 'failed to parse logic tree ((title.ilike.%secret search%))', details: null, hint: null };

describe('a failed game read', () => {
  it('names the database error code', async () => {
    db.error = POOL_STALL;
    const { fetchGameRow } = await import('../services/gamesService.js');
    await expect(fetchGameRow(40420)).rejects.toThrow('Failed to fetch game with ID 40420 (PGRST003)');
  });

  it('names a network failure, which has no code, by its message', async () => {
    db.error = NETWORK;
    const { fetchGameRow } = await import('../services/gamesService.js');
    await expect(fetchGameRow(40420)).rejects.toThrow('Failed to fetch game with ID 40420 (TypeError: fetch failed)');
  });

  it('keeps the original error as the cause', async () => {
    db.error = POOL_STALL;
    const { fetchGameRow } = await import('../services/gamesService.js');
    await expect(fetchGameRow(40420)).rejects.toMatchObject({ cause: POOL_STALL });
  });
});

describe('a failed filtered read', () => {
  it('sends the code, never a message that could carry the search', async () => {
    db.error = ECHOES_INPUT;
    const { fetchGames, getGameStatistics } = await import('../services/gamesService.js');
    for (const read of [fetchGames({ search: 'secret search' }), getGameStatistics({ search: 'secret search' })]) {
      const err = await read.catch((e) => e);
      expect(err.message).toContain('(PGRST100)');
      expect(err.message).not.toContain('secret');
    }
  });
});
