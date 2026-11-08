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
 * No-ops entirely when SENTRY_DSN is unset, so local dev, tests and CI stay clean.
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { APP_VERSION } from './config/version.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Vercel injects env vars directly; only read a .env file when they're absent.
if (!process.env.SENTRY_DSN) {
  dotenv.config({ path: path.resolve(__dirname, '../../.env') });
}

const dsn = process.env.SENTRY_DSN;

export const sentryEnabled = Boolean(dsn);

/** @type {Promise<typeof import('@sentry/node')> | null} */
let sentry = null;

/** Reports still sending; the serverless entry waits on these before returning. */
const inFlight = new Set();

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

      // Don't let error reports carry request bodies, cookies or headers.
      sendDefaultPii: false,

      beforeSend(event) {
        // Belt-and-braces: never ship credentials even if something attaches them.
        if (event.request?.headers) delete event.request.headers;
        if (event.request?.cookies) delete event.request.cookies;
        return event;
      },
    });
    return Sentry;
  });
  return sentry;
}

/**
 * Send one error to Sentry. Never throws and never delays the response: the
 * caller carries on, and `settleErrorReports` waits for delivery afterwards.
 *
 * @param {unknown} error
 * @param {object} [context] - Sentry capture context, e.g. `{ tags: {...} }`
 */
export function reportError(error, context) {
  if (!sentryEnabled) return;
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
