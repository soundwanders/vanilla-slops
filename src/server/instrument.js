/**
 * @fileoverview Sentry initialisation.
 *
 * MUST be the first import in every server entry point (`index.js`, `api/index.js`).
 * The Sentry SDK patches Node internals and libraries at require/import time, so
 * anything imported before this runs would miss instrumentation.
 *
 * Reads its own .env because it runs before config/env.js — Sentry has to be
 * armed before any other module gets a chance to throw.
 *
 * No-ops entirely when SENTRY_DSN is unset, so local dev, tests and CI stay clean.
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import * as Sentry from '@sentry/node';
import { APP_VERSION } from './config/version.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Vercel injects env vars directly; only read a .env file when they're absent.
if (!process.env.SENTRY_DSN) {
  dotenv.config({ path: path.resolve(__dirname, '../../.env') });
}

const dsn = process.env.SENTRY_DSN;

export const sentryEnabled = Boolean(dsn);

if (sentryEnabled) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',

    // Tags every event with the version that produced it, so an error can be
    // traced to a release instead of just a timestamp.
    release: APP_VERSION,

    // Errors only. Performance tracing would burn the free tier's quota fast
    // and we have no latency problem to investigate.
    tracesSampleRate: 0,

    // Don't let error reports carry request bodies, cookies or headers.
    sendDefaultPii: false,

    beforeSend(event) {
      // Belt-and-braces: never ship credentials even if something attaches them.
      if (event.request?.headers) delete event.request.headers;
      if (event.request?.cookies) delete event.request.cookies;
      return event;
    },
  });
}

export { Sentry };
