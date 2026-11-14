import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.js'],
    // The controllers report their 5xx to Sentry, and instrument.js falls back
    // to the root .env for the DSN. Set, even to nothing, it is never read from
    // there, so a test that exercises a failure cannot send a real report.
    env: { SENTRY_DSN: '' },
  },
});
