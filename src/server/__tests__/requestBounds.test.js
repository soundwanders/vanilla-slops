import { describe, it, expect, vi } from 'vitest';
import { querySchema, statisticsQuerySchema, facetsQuerySchema } from '../schemas/gameQuerySchema.js';
import { errorHandler } from '../middlewares/errorHandler.js';

/**
 * What a request is allowed to make the server do.
 *
 * Each case here was something a stranger could ask for and get: a 500 from an
 * absurd page number, kilobytes of filter text forwarded to PostgREST, a facets
 * computation that skipped every cache, or a thrown error's own message in the
 * response body.
 */
describe('free-text filters are bounded', () => {
  // The longest real value in the catalogue (measured 2026-10-19). The cap
  // exists to stop abuse, so it must never reject the data itself.
  const longestRealDeveloper = 'Ubisoft Quebec, in collaboration with Ubisoft Annecy, Bucharest, Kiev, Montreal, Montpellier, Shanghai, Singapore, Sofia, Toronto studios';

  it('accepts the longest developer name the catalogue holds', () => {
    expect(longestRealDeveloper).toHaveLength(137);
    expect(querySchema.safeParse({ developer: longestRealDeveloper }).success).toBe(true);
  });

  it.each(['search', 'developer', 'engine', 'genre', 'platform', 'category', 'year'])(
    'rejects a %s longer than 200 characters on the listing and the statistics',
    (field) => {
      expect(querySchema.safeParse({ [field]: 'x'.repeat(200) }).success).toBe(true);
      expect(querySchema.safeParse({ [field]: 'x'.repeat(201) }).success).toBe(false);
      expect(statisticsQuerySchema.safeParse({ [field]: 'x'.repeat(201) }).success).toBe(false);
    },
  );
});

describe('page is clamped like limit', () => {
  it.each([
    ['1', 1],
    ['151', 151],
    ['0', 1],
    ['99999999999999999999', 100000],
  ])('page=%s becomes %i', (page, expected) => {
    expect(querySchema.parse({ page }).page).toBe(expected);
  });
});

describe('facets cannot be scoped to a search', () => {
  it('strips search, so every request takes the cached path', () => {
    const parsed = facetsQuerySchema.parse({ search: 'anything at all' });
    expect(parsed).not.toHaveProperty('search');
  });
});

describe('errorHandler', () => {
  function run(err) {
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    errorHandler(err, { id: 'req-1' }, res, () => {});
    return { status: res.status.mock.calls[0][0], body: res.json.mock.calls[0][0] };
  }

  it('never puts a thrown message in a 5xx body', () => {
    const { status, body } = run(new Error('relation "launch_options" column "secret_col" does not exist'));
    expect(status).toBe(500);
    expect(body.error).toEqual({ code: 'INTERNAL_ERROR', message: 'Internal Server Error' });
    expect(JSON.stringify(body)).not.toContain('secret_col');
    expect(body.requestId).toBe('req-1');
  });

  it('keeps a 4xx message, which was written for the client', () => {
    const err = Object.assign(new Error('Not allowed by CORS'), { status: 403, code: 'CORS_FORBIDDEN' });
    const { status, body } = run(err);
    expect(status).toBe(403);
    expect(body.error).toEqual({ code: 'CORS_FORBIDDEN', message: 'Not allowed by CORS' });
  });
});
