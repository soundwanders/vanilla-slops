/**
 * Vercel serverless entry point.
 *
 * The Express app is wrapped rather than exported directly so an error report
 * can finish sending before the function freezes. Vercel may suspend a
 * serverless function the moment a response is sent — Sentry's transport is
 * async, so without this wait error reports are silently dropped in
 * production. Only a request that produced a report waits; the rest return at
 * once (a flush after every response cost ~9 ms of CPU each, measured
 * 2026-11-08).
 */
import { settleErrorReports } from '../src/server/instrument.js';
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
    await settleErrorReports();
  }
}
