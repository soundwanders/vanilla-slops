import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import http from 'http';
import { createClient } from '@supabase/supabase-js';

// A database that accepts the connection and then says nothing is the failure
// this guards: without a timeout the request waits as long as the platform
// allows, and the function is billed for the wait. On 2026-11-13 that was
// about four minutes a request.
let server;
let baseUrl;
let hits = 0;

beforeAll(async () => {
  // Accepts every request and never answers.
  server = http.createServer(() => { hits += 1; });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => {
  vi.unstubAllEnvs();
  server.closeAllConnections();
  return new Promise((resolve) => server.close(resolve));
});

describe('the database client', () => {
  it('is configured with a timeout of a few seconds', async () => {
    vi.stubEnv('SUPABASE_URL', 'http://127.0.0.1:1');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key');
    const { CLIENT_OPTIONS } = await import('../config/supabaseClient.js');
    expect(CLIENT_OPTIONS.db.timeout).toBeGreaterThanOrEqual(2000);
    expect(CLIENT_OPTIONS.db.timeout).toBeLessThanOrEqual(10000);
  });

  // The two properties the configuration relies on, pinned against a library
  // upgrade: a timeout becomes an ordinary error, and it is not one of the
  // failures the library retries (a retried hang would wait four times over).
  it('gives up on a database that never answers, once, as an ordinary error', async () => {
    hits = 0;
    const client = createClient(baseUrl, 'test-key', { db: { timeout: 100 } });
    const started = Date.now();
    const { data, error } = await client.from('games').select('*');
    expect(Date.now() - started).toBeLessThan(1000);
    expect(data).toBeNull();
    expect(error?.message).toMatch(/abort/i);
    expect(hits).toBe(1);
  });
});
