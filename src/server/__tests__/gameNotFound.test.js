import { describe, it, expect, vi } from 'vitest';

// The client behaves as PostgREST does for a single-row read of an app ID that
// is not in the table: single() reports the missing row as an error, and
// maybeSingle() returns null. /api/games/:id used single(), so a game that
// isn't in the catalogue (Marvel Rivals, Deadlock) answered 500, not 404.
function builder() {
  const q = {
    select: () => q,
    eq: () => q,
    single: async () => ({
      data: null,
      error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' },
    }),
    maybeSingle: async () => ({ data: null, error: null }),
  };
  return q;
}

vi.mock('../config/supabaseClient.js', () => ({
  default: { from: () => builder() },
}));

const { gameDetailsController } = await import('../controllers/gamesController.js');

function run(id) {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  return gameDetailsController({ params: { id } }, res).then(() => ({
    status: res.status.mock.calls[0][0],
    body: res.json.mock.calls[0][0],
  }));
}

describe('GET /api/games/:id for a game the catalogue does not hold', () => {
  it('answers 404 GAME_NOT_FOUND, not 500', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { status, body } = await run('2767030');
    expect(status).toBe(404);
    expect(body.error.code).toBe('GAME_NOT_FOUND');
  });
});
