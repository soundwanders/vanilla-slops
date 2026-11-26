/**
 * @fileoverview Error reporting to Sentry, loaded only when there is an error.
 *
 * The SDK is imported on the first 5xx an instance sees, never at startup.
 * Vercel bills Fluid compute by CPU time, and on the Hobby plan's 4 CPU-hours
 * `@sentry/node` was the largest single cost in the function. Measured on Node
 * 22.17.1 (2026-11-08): importing it was ~450 ms of a ~790 ms cold start, and
 * the flush that used to follow every response cost ~9 ms per request with
 * nothing queued. Now an ordinary request pays neither.
 *
 * What is reported is unchanged: errors that reach Express's error middleware
 * with a 5xx status. The trade-off is that Sentry's process-wide hooks
 * (uncaught exceptions, unhandled rejections) arm only once the SDK has loaded.
 * Those still reach Vercel's runtime logs.
 *
 * Reports are capped, because the failures worth knowing about arrive in
 * bursts. See `shouldReport`.
 *
 * No-ops entirely when SENTRY_DSN is unset, so local dev, tests and CI stay clean.
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { APP_VERSION } from './config/version.js';
import { RowCapError } from './utils/rowCap.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Vercel injects env vars directly; only read a .env file when they're absent.
// Absent means undefined: the test run sets it to '' (vitest.config.js) so that
// no test can load the maintainer's .env and report to the real project.
if (process.env.SENTRY_DSN === undefined) {
  // quiet: dotenv 18 writes "injected env" to stderr, which Vercel logs as an error.
  dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true });
}

const dsn = process.env.SENTRY_DSN;

export const sentryEnabled = Boolean(dsn);

/** @type {Promise<typeof import('@sentry/node')> | null} */
let sentry = null;

/** Reports still sending; the serverless entry waits on these before returning. */
const inFlight = new Set();

// ── Caps ────────────────────────────────────────────────────────────────────
// Every limit here is per instance, because instances share nothing. That is
// why the sampling exists: when the database stalls, Vercel starts instances by
// the hundred and each one meets its "first" error. A cap of one report per
// instance would still mean hundreds of SDK loads (~450 ms of billed CPU each)
// and hundreds of identical events, in the very hour the function is already
// at its most expensive.

/** How long an instance remembers what it has sent. */
export const REPORT_WINDOW_MS = 60 * 60 * 1000;

/** The most reports one instance sends in a window, whatever they are. */
export const MAX_REPORTS_PER_WINDOW = 3;

/**
 * The share of instances that report operational failures (a database read
 * that failed or timed out) at all. Drawn once per instance per window, never
 * per error: an instance in a stall sees dozens of failures, and a per-error
 * draw would let nearly every instance through eventually. One in twenty still
 * puts a stall in Sentry within its first few instances, with a timestamp and
 * a message, which is all there is to learn from the five-hundredth copy.
 */
export const OPERATIONAL_SAMPLE_RATE = 0.05;

const caps = { windowStart: 0, sent: 0, reportsOperational: false, seen: new Set() };

/**
 * A defect in this code, as opposed to something outside it failing. These
 * skip the sampling: they are rare, they do not come in storms, and they are
 * the reports that need acting on.
 */
function isDefect(error) {
  return error instanceof TypeError || error instanceof ReferenceError
    || error instanceof RangeError || error instanceof SyntaxError
    // A read that should have been paged (utils/rowCap.js).
    || error instanceof RowCapError;
}

/**
 * Decide whether this error is sent, and count it if so.
 *
 *   1. Operational failures are sent only by the sampled share of instances.
 *   2. The same error on the same route is sent once per window.
 *   3. No instance sends more than MAX_REPORTS_PER_WINDOW in a window.
 *
 * A refusal costs nothing: the SDK is not loaded for it.
 *
 * @param {unknown} error
 * @param {object} [context]
 * @param {number} [now]
 * @returns {boolean}
 */
function shouldReport(error, context, now = Date.now()) {
  if (now - caps.windowStart >= REPORT_WINDOW_MS) {
    caps.windowStart = now;
    caps.sent = 0;
    caps.seen.clear();
    caps.reportsOperational = Math.random() < OPERATIONAL_SAMPLE_RATE;
  }
  if (!isDefect(error) && !caps.reportsOperational) return false;
  if (caps.sent >= MAX_REPORTS_PER_WINDOW) return false;

  // Numbers are folded out so "Failed to fetch game with ID 400" and "...ID
  // 410" are one error, not one per game in the catalogue.
  const message = String(error?.message ?? '').replace(/\d+/g, 'N').slice(0, 120);
  const key = `${context?.tags?.route ?? ''}|${error?.name ?? ''}|${message}`;
  if (caps.seen.has(key)) return false;

  caps.seen.add(key);
  caps.sent += 1;
  return true;
}

function loadSentry() {
  sentry ??= import('@sentry/node').then((Sentry) => {
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',

      // Tags every event with the version that produced it, so an error can be
      // traced to a release instead of just a timestamp.
      release: APP_VERSION,

      // Errors only, so no tracesSampleRate: Sentry treats any non-null value,
      // 0 included, as tracing switched on.

      // What a report may carry: the error, its stack and the route tag. v11
      // removed `sendDefaultPii` (setting it is silently ignored) and its
      // replacement collects by default. Measured on 11.12.0 with no
      // `dataCollection` (2026-11-25): a later report on an instance sent the
      // visitor's IP address as `user.ip_address`. Every key is set
      // explicitly, so a changed default cannot change what is sent.
      // frameContextLines is the one left on: source lines around each stack
      // frame are this repo's own (public) code, and they make a report useful.
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: false,
        httpBodies: [],
        urlQueryParams: false,
        databaseQueryData: false,
        queues: false,
        stackFrameVariables: false,
        graphQL: { document: false, variables: false },
        genAI: { inputs: false, outputs: false },
        mcp: { inputs: false, outputs: false },
        frameContextLines: 5,
      },

      // No breadcrumbs. On v10 and v11 alike they carried the URL of an
      // earlier request on the same instance, query string included, so one
      // visitor's address could ride along on another visitor's error. The
      // route tag and the stack are what a report is for.
      maxBreadcrumbs: 0,

      beforeSend(event) {
        // Belt-and-braces, whatever the options above do in a later version:
        // no user, no breadcrumbs, and no request detail beyond its method
        // and path. The exception's own message is left as thrown; the code
        // that throws is what keeps visitor input out of it.
        delete event.user;
        delete event.breadcrumbs;
        if (event.request) {
          const { method, url } = event.request;
          event.request = { method, url: typeof url === 'string' ? url.split('?')[0] : url };
        }
        return event;
      },
    });
    return Sentry;
  });
  return sentry;
}

/**
 * Send one error to Sentry, if the caps allow it. Never throws and never
 * delays the response: the caller carries on, and `settleErrorReports` waits
 * for delivery afterwards.
 *
 * @param {unknown} error
 * @param {object} [context] - Sentry capture context, e.g. `{ tags: {...} }`
 */
export function reportError(error, context) {
  if (!sentryEnabled) return;
  if (!shouldReport(error, context)) return;
  const report = loadSentry()
    .then((Sentry) => {
      Sentry.captureException(error, context);
      // Bounded so a slow Sentry ingest can never hold the function open.
      return Sentry.flush(2000);
    })
    .catch((err) => console.error('Sentry: could not report an error:', err))
    .finally(() => inFlight.delete(report));
  inFlight.add(report);
}

/**
 * Wait for any reports still sending. Vercel may suspend the function as soon
 * as the handler returns, so the serverless entry calls this after the
 * response. With nothing in flight it returns at once.
 */
export async function settleErrorReports() {
  if (inFlight.size > 0) await Promise.allSettled([...inFlight]);
}

/**
 * Express error middleware: reports 5xx, then hands the error on to
 * errorHandler, which still writes the standard { error: {...} } response.
 * Validation 400s and 404s are normal traffic, not incidents.
 */
export function reportServerErrors(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) {
    reportError(err, { tags: { route: `${req.method} ${req.path}` } });
  }
  next(err);
}
