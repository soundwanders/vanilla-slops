import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchGames, fetchLaunchOptions } from '../js/api.js';
import {
  ApiError, messageForStatus, visitorMessage, isRetryable,
  TOO_MANY_REQUESTS_MESSAGE, SERVER_ERROR_MESSAGE, NETWORK_MESSAGE, REFUSED_MESSAGE,
} from '../js/apiError.js';

// What a visitor is shown when a request fails. Two real responses, both run
// through this code on 2026-11-14, are the reason these exist: Vercel's
// firewall challenge put 20,791 characters of HTML source under "Failed to
// Load Games", and the API's own 500 put "[object Object]" there.
const CHALLENGE_PAGE = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Vercel Security Checkpoint</title></head><body>${'<div>x</div>'.repeat(2000)}</body></html>`;
const html = (status, body = CHALLENGE_PAGE) => new Response(body, { status, headers: { 'Content-Type': 'text/html' } });
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const OK_PAGE = { games: [{ app_id: 440 }], total: 1, totalPages: 1, currentPage: 1, hasNextPage: false, hasPrevPage: false };

let calls;
/** Answer each request in turn with the next response; the last one repeats. */
function respondWith(...responses) {
  calls = 0;
  vi.stubGlobal('fetch', vi.fn(async () => {
    const next = responses[Math.min(calls, responses.length - 1)];
    calls += 1;
    if (next instanceof Error) throw next;
    return typeof next === 'function' ? next() : next;
  }));
}

/** Run a request to its end, however many backoff waits it takes. */
async function settle(promise) {
  const outcome = promise.then((value) => ({ value }), (error) => ({ error }));
  await vi.runAllTimersAsync();
  return outcome;
}

// Every call needs its own cache key, or one test would read another's page.
let page = 0;
const nextPage = () => { page += 1; return { page, useCache: false }; };

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('a refused request', () => {
  it('a firewall challenge is one plain sentence, never the page it came with', async () => {
    respondWith(() => html(429));
    const { error } = await settle(fetchGames(nextPage()));
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(429);
    expect(error.message).toBe(TOO_MANY_REQUESTS_MESSAGE);
    expect(error.message).not.toContain('<');
  });

  it('is not asked again: a retry cannot succeed and adds to the count', async () => {
    respondWith(() => html(429));
    await settle(fetchGames(nextPage()));
    expect(calls).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([400, 403, 404])('a %i is not retried either', async (status) => {
    respondWith(() => html(status));
    const { error } = await settle(fetchLaunchOptions(`${status}${page += 1}`, false));
    expect(calls).toBe(1);
    expect(error.message).toBe(REFUSED_MESSAGE);
  });

  it('a 4xx the API explains uses the API\'s own sentence', async () => {
    respondWith(() => json(404, { error: { code: 'GAME_NOT_FOUND', message: 'Game with ID 2767030 not found' } }));
    const { error } = await settle(fetchLaunchOptions(`a${page += 1}`, false));
    expect(error.status).toBe(404);
    expect(error.message).toBe('Game with ID 2767030 not found');
  });
});

describe('a failing server', () => {
  it('is one plain sentence, not "[object Object]"', async () => {
    respondWith(() => json(500, { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch games' } }));
    const { error } = await settle(fetchGames(nextPage()));
    expect(error.status).toBe(500);
    expect(error.message).toBe(SERVER_ERROR_MESSAGE);
    expect(error.message).not.toContain('object');
  });

  it('is retried, because a server can recover', async () => {
    respondWith(() => json(503, {}));
    await settle(fetchGames(nextPage()));
    expect(calls).toBe(3);
  });

  it('a retry that succeeds is a success', async () => {
    respondWith(() => json(500, {}), () => json(200, OK_PAGE));
    const { value, error } = await settle(fetchGames(nextPage()));
    expect(error).toBeUndefined();
    expect(value.games).toEqual([{ app_id: 440 }]);
    expect(calls).toBe(2);
  });
});

describe('no connection', () => {
  it('says so in plain words, after retrying', async () => {
    respondWith(new TypeError('NetworkError when attempting to fetch resource.'));
    const { error } = await settle(fetchGames(nextPage()));
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(0);
    expect(error.message).toBe(NETWORK_MESSAGE);
    expect(calls).toBe(3);
  });
});

describe('messageForStatus', () => {
  it('never lets a server speak for itself', () => {
    const body = JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'relation "games" does not exist' } });
    expect(messageForStatus(500, body)).toBe(SERVER_ERROR_MESSAGE);
    expect(messageForStatus(503, body)).toBe(SERVER_ERROR_MESSAGE);
  });

  it('reads the older { error: "..." } shape too', () => {
    expect(messageForStatus(404, JSON.stringify({ error: 'API endpoint not found' }))).toBe('API endpoint not found');
  });

  it('falls back when the body holds no sentence', () => {
    expect(messageForStatus(403, CHALLENGE_PAGE)).toBe(REFUSED_MESSAGE);
    expect(messageForStatus(400, '')).toBe(REFUSED_MESSAGE);
    expect(messageForStatus(400, JSON.stringify({ error: { code: 'X' } }))).toBe(REFUSED_MESSAGE);
    expect(messageForStatus(400, JSON.stringify({ error: { message: 'x'.repeat(201) } }))).toBe(REFUSED_MESSAGE);
    expect(messageForStatus(400, 'null')).toBe(REFUSED_MESSAGE);
  });

  it('a 429 is the rate-limit sentence whatever came with it', () => {
    expect(messageForStatus(429, JSON.stringify({ error: 'Too many requests from this IP, please try again later.' }))).toBe(TOO_MANY_REQUESTS_MESSAGE);
  });
});

describe('visitorMessage', () => {
  it('shows an ApiError\'s sentence', () => {
    expect(visitorMessage(new ApiError(429, TOO_MANY_REQUESTS_MESSAGE))).toBe(TOO_MANY_REQUESTS_MESSAGE);
  });

  it('keeps a defect\'s own message off the page', () => {
    const defect = new TypeError("Cannot read properties of undefined (reading 'games')");
    expect(visitorMessage(defect)).toBe(SERVER_ERROR_MESSAGE);
    expect(visitorMessage('a thrown string')).toBe(SERVER_ERROR_MESSAGE);
    expect(visitorMessage(undefined)).toBe(SERVER_ERROR_MESSAGE);
  });
});

describe('isRetryable', () => {
  it('only a dropped connection or a 5xx', () => {
    expect([0, 500, 502, 503].every((s) => isRetryable(new ApiError(s, '')))).toBe(true);
    expect([400, 403, 404, 429].some((s) => isRetryable(new ApiError(s, '')))).toBe(false);
  });
});

// The table asks for a game's options to prefetch on hover, touch or focus,
// and again on the click that follows a moment later. Before the first answer
// lands the cache is empty, so each expansion used to send two requests.
describe('requests for one game\'s options', () => {
  const OPTIONS = [{ command: '-novid' }];
  let gameId = 9000;
  const nextGame = () => { gameId += 1; return gameId; };

  it('share one request while it is in the air', async () => {
    respondWith(() => json(200, OPTIONS));
    const id = nextGame();
    const prefetch = fetchLaunchOptions(id);
    const click = fetchLaunchOptions(id);
    const [a, b] = await Promise.all([settle(prefetch), settle(click)]);
    expect(calls).toBe(1);
    expect(a.value).toEqual(OPTIONS);
    expect(b.value).toBe(a.value);
  });

  it('are answered from the cache afterwards, with no request at all', async () => {
    respondWith(() => json(200, OPTIONS));
    const id = nextGame();
    await settle(fetchLaunchOptions(id));
    const again = await settle(fetchLaunchOptions(id));
    expect(calls).toBe(1);
    expect(again.value).toEqual(OPTIONS);
  });

  it('do not share across games', async () => {
    respondWith(() => json(200, OPTIONS));
    await Promise.all([settle(fetchLaunchOptions(nextGame())), settle(fetchLaunchOptions(nextGame()))]);
    expect(calls).toBe(2);
  });

  it('share a failure too, and then forget it so the next click asks again', async () => {
    respondWith(() => html(429), () => json(200, OPTIONS));
    const id = nextGame();
    const [a, b] = await Promise.all([settle(fetchLaunchOptions(id)), settle(fetchLaunchOptions(id))]);
    expect(calls).toBe(1);
    expect(a.error).toBeInstanceOf(ApiError);
    expect(b.error).toBe(a.error);

    const retry = await settle(fetchLaunchOptions(id));
    expect(calls).toBe(2);
    expect(retry.value).toEqual(OPTIONS);
  });

  it('a failure is never cached', async () => {
    respondWith(() => json(500, {}));
    const id = nextGame();
    await settle(fetchLaunchOptions(id));
    const first = calls;
    await settle(fetchLaunchOptions(id));
    expect(first).toBe(3);
    expect(calls).toBe(6);
  });

  it('asked for uncached, neither share nor store', async () => {
    respondWith(() => json(200, OPTIONS));
    const id = nextGame();
    await Promise.all([settle(fetchLaunchOptions(id, false)), settle(fetchLaunchOptions(id, false))]);
    expect(calls).toBe(2);
    await settle(fetchLaunchOptions(id));
    expect(calls).toBe(3);
  });
});
