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

function serverError(status, message = 'boom') {
  const err = new Error(message);
  if (status) err.status = status;
  return err;
}

// Math.random decides, once per instance per hour, whether an instance reports
// operational failures at all. 0 is an instance that does; 0.99 one that doesn't.
const asReportingInstance = () => vi.spyOn(Math, 'random').mockReturnValue(0);
const asSilentInstance = () => vi.spyOn(Math, 'random').mockReturnValue(0.99);

const req = { method: 'GET', path: '/api/games/440' };

beforeEach(() => {
  sdk.loads = 0;
  sdk.init.mockClear();
  sdk.captureException.mockReset();
  sdk.flush.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

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
    asReportingInstance();
    const { reportServerErrors, settleErrorReports } = await load('https://key@sentry.example/1');
    const first = serverError();
    const next = vi.fn();
    reportServerErrors(first, req, {}, next);
    reportServerErrors(serverError(503, 'bang'), req, {}, vi.fn());
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
    asReportingInstance();
    const { reportError, settleErrorReports } = await load('https://key@sentry.example/1');
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    sdk.captureException.mockImplementation(() => { throw new Error('ingest down'); });
    expect(() => reportError(serverError())).not.toThrow();
    await expect(settleErrorReports()).resolves.toBeUndefined();
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});

// A database stall fails hundreds of requests across hundreds of instances at
// once. Uncapped, each instance would load the SDK (~450 ms of billed CPU) and
// send the same event, in the hour the function is already at its most costly.
describe('error reporting is capped', () => {
  const DSN = 'https://key@sentry.example/1';
  const at = (route) => ({ tags: { route } });

  it('sends the same error on the same route once', async () => {
    asReportingInstance();
    const { reportError, settleErrorReports } = await load(DSN);
    for (let i = 0; i < 50; i += 1) reportError(serverError(), at('GET /api/games'));
    await settleErrorReports();
    expect(sdk.captureException).toHaveBeenCalledTimes(1);
  });

  it('stops at the per-instance limit however many different errors there are', async () => {
    asReportingInstance();
    const { reportError, settleErrorReports, MAX_REPORTS_PER_WINDOW } = await load(DSN);
    for (let i = 0; i < 50; i += 1) reportError(serverError(), at(`GET /route-${'x'.repeat(i)}`));
    await settleErrorReports();
    expect(sdk.captureException).toHaveBeenCalledTimes(MAX_REPORTS_PER_WINDOW);
  });

  it('treats the same failure for different games as one error', async () => {
    asReportingInstance();
    const { reportError, settleErrorReports } = await load(DSN);
    for (let id = 400; id < 450; id += 1) reportError(serverError(null, `Failed to fetch game with ID ${id}`), at('GET /game/:appid'));
    await settleErrorReports();
    expect(sdk.captureException).toHaveBeenCalledTimes(1);
  });

  it('most instances never report a failed database read, and never load the SDK for one', async () => {
    asSilentInstance();
    const { reportError, settleErrorReports } = await load(DSN);
    for (let i = 0; i < 50; i += 1) reportError(serverError(null, `failure ${i}`), at('GET /game/:appid'));
    await settleErrorReports();
    expect(sdk.loads).toBe(0);
    expect(sdk.captureException).not.toHaveBeenCalled();
  });

  it('draws once per instance, not once per error', async () => {
    const random = asSilentInstance();
    const { reportError } = await load(DSN);
    for (let i = 0; i < 50; i += 1) reportError(serverError(null, `failure ${i}`), at('GET /api/games'));
    expect(random).toHaveBeenCalledTimes(1);
  });

  it('a defect in the code is reported by every instance', async () => {
    asSilentInstance();
    const { reportError, settleErrorReports } = await load(DSN);
    const bug = new TypeError("Cannot read properties of undefined (reading 'title')");
    reportError(bug, at('GET /game/:appid'));
    await settleErrorReports();
    expect(sdk.captureException).toHaveBeenCalledWith(bug, at('GET /game/:appid'));
  });

  it('starts again after the window, so a long-lived instance is not silent for good', async () => {
    vi.useFakeTimers();
    asReportingInstance();
    const { reportError, REPORT_WINDOW_MS } = await load(DSN);
    reportError(serverError(), at('GET /api/games'));
    await vi.runAllTimersAsync();
    expect(sdk.captureException).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(REPORT_WINDOW_MS);
    reportError(serverError(), at('GET /api/games'));
    await vi.runAllTimersAsync();
    expect(sdk.captureException).toHaveBeenCalledTimes(2);
  });

  it('keeps the sampled share small', async () => {
    const { OPERATIONAL_SAMPLE_RATE, MAX_REPORTS_PER_WINDOW } = await load(DSN);
    expect(OPERATIONAL_SAMPLE_RATE).toBeLessThanOrEqual(0.1);
    expect(MAX_REPORTS_PER_WINDOW).toBeLessThanOrEqual(10);
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
