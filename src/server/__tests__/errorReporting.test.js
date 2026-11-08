import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The Sentry SDK is the largest cost in a cold start, so instrument.js must not
// load it until there is an error to report. The mock counts how many times the
// module itself is loaded, which is the thing being tested.
const sdk = vi.hoisted(() => ({
  loads: 0,
  init: vi.fn(),
  captureException: vi.fn(),
  flush: vi.fn(async () => true),
}));
vi.mock('@sentry/node', () => {
  sdk.loads += 1;
  return { init: sdk.init, captureException: sdk.captureException, flush: sdk.flush };
});

// instrument.js reads the root .env when SENTRY_DSN is unset; a test must never
// pick up the maintainer's real one.
vi.mock('dotenv', () => ({ default: { config: vi.fn() } }));

async function load(dsn) {
  vi.resetModules();
  vi.stubEnv('SENTRY_DSN', dsn);
  return import('../instrument.js');
}

function serverError(status) {
  const err = new Error('boom');
  if (status) err.status = status;
  return err;
}

const req = { method: 'GET', path: '/api/games/440' };

beforeEach(() => {
  sdk.loads = 0;
  sdk.init.mockClear();
  sdk.captureException.mockReset();
  sdk.flush.mockClear();
});

afterEach(() => vi.unstubAllEnvs());

describe('error reporting is lazy', () => {
  it('does not load the SDK at startup', async () => {
    await load('https://key@sentry.example/1');
    expect(sdk.loads).toBe(0);
  });

  it('settles at once when nothing was reported', async () => {
    const { settleErrorReports } = await load('https://key@sentry.example/1');
    await settleErrorReports();
    expect(sdk.loads).toBe(0);
    expect(sdk.flush).not.toHaveBeenCalled();
  });

  it('loads, initialises once and delivers on the first 5xx', async () => {
    const { reportServerErrors, settleErrorReports } = await load('https://key@sentry.example/1');
    const first = serverError();
    const next = vi.fn();
    reportServerErrors(first, req, {}, next);
    reportServerErrors(serverError(503), req, {}, vi.fn());
    await settleErrorReports();

    expect(next).toHaveBeenCalledWith(first);
    expect(sdk.init).toHaveBeenCalledTimes(1);
    expect(sdk.init.mock.calls[0][0]).not.toHaveProperty('tracesSampleRate');
    expect(sdk.captureException).toHaveBeenCalledTimes(2);
    expect(sdk.captureException).toHaveBeenCalledWith(first, { tags: { route: 'GET /api/games/440' } });
    expect(sdk.flush).toHaveBeenCalledWith(2000);
  });

  it('passes 4xx on without reporting them', async () => {
    const { reportServerErrors, settleErrorReports } = await load('https://key@sentry.example/1');
    const next = vi.fn();
    const err = serverError(403);
    reportServerErrors(err, req, {}, next);
    await settleErrorReports();
    expect(next).toHaveBeenCalledWith(err);
    expect(sdk.loads).toBe(0);
  });

  it('never throws when delivery fails', async () => {
    const { reportError, settleErrorReports } = await load('https://key@sentry.example/1');
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    sdk.captureException.mockImplementation(() => { throw new Error('ingest down'); });
    expect(() => reportError(serverError())).not.toThrow();
    await expect(settleErrorReports()).resolves.toBeUndefined();
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});

describe('error reporting without a DSN', () => {
  it('reports nothing and still passes the error on', async () => {
    const { reportServerErrors, settleErrorReports, sentryEnabled } = await load('');
    const next = vi.fn();
    const err = serverError();
    reportServerErrors(err, req, {}, next);
    await settleErrorReports();
    expect(sentryEnabled).toBe(false);
    expect(next).toHaveBeenCalledWith(err);
    expect(sdk.loads).toBe(0);
  });
});
