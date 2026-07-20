/**
 * Vercel serverless entry point.
 *
 * The Express app is wrapped rather than exported directly so Sentry can flush
 * before the function freezes. Vercel may suspend a serverless function the
 * moment a response is sent — Sentry's transport is async, so without an
 * explicit flush error reports are silently dropped in production.
 */
import '../src/server/instrument.js'; // must stay first — arms Sentry before anything can throw
import { Sentry, sentryEnabled } from '../src/server/instrument.js';
import app from '../src/server/app.js';

export default async function handler(req, res) {
  try {
    await new Promise((resolve) => {
      // 'finish' = response sent; 'close' = client hung up. Either ends the request.
      res.once('finish', resolve);
      res.once('close', resolve);
      app(req, res);
    });
  } finally {
    if (sentryEnabled) {
      // Bounded so a slow Sentry ingest can never hold the response open.
      await Sentry.flush(2000).catch(() => {});
    }
  }
}
