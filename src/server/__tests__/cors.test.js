import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import setupCORS from '../middlewares/cors.js';

const ORIGINAL_ENV = { ...process.env };
afterAll(() => { process.env = { ...ORIGINAL_ENV }; });

beforeEach(() => {
  process.env.NODE_ENV = 'production';
  process.env.CORS_ORIGIN = 'https://launchoptions.dev';
  delete process.env.DOMAIN_URL;
});

/**
 * Drives the real cors middleware and reports what it decided.
 * @returns {{err: Error|undefined, headers: Record<string,string>}}
 */
function request(origin, { method = 'GET' } = {}) {
  const middleware = setupCORS();
  const headers = {};
  const req = { method, headers: origin === undefined ? {} : { origin } };
  const res = {
    setHeader: (k, v) => { headers[k.toLowerCase()] = String(v); },
    getHeader: (k) => headers[k.toLowerCase()],
    end: () => {},
    statusCode: 200,
  };
  let err;
  middleware(req, res, (e) => { err = e; });
  return { err, headers };
}

describe('CORS in production — allowed traffic', () => {
  it('reflects the configured origin and keeps credentials on', () => {
    const { err, headers } = request('https://launchoptions.dev');
    expect(err).toBeUndefined();
    expect(headers['access-control-allow-origin']).toBe('https://launchoptions.dev');
    expect(headers['access-control-allow-credentials']).toBe('true');
  });

  it('allows a request with no Origin header at all (same-origin, curl)', () => {
    expect(request(undefined).err).toBeUndefined();
  });

  it('honours a comma-separated CORS_ORIGIN list', () => {
    process.env.CORS_ORIGIN = 'https://launchoptions.dev, https://www.launchoptions.dev/';
    expect(request('https://www.launchoptions.dev').err).toBeUndefined();
  });
});

describe('CORS in production — rejected traffic', () => {
  it('rejects an unrelated origin', () => {
    const { err, headers } = request('https://evil.example.com');
    expect(err).toBeDefined();
    expect(headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rejects a host that merely contains the old Railway suffix', () => {
    // The removed bootstrap branch matched with `includes('.railway.app')`, so
    // this host satisfied it. Nothing should special-case Railway now: the site
    // runs on Vercel and CORS_ORIGIN has been set since launch.
    expect(request('https://foo.railway.app.evil.com').err).toBeDefined();
    expect(request('https://vanilla-slops.up.railway.app').err).toBeDefined();
  });

  it('still rejects Railway hosts when CORS_ORIGIN is unset', () => {
    // The branch was reachable only in this configuration, which production has
    // never been in. Asserting it here is what stops it being reintroduced.
    delete process.env.CORS_ORIGIN;
    expect(request('https://vanilla-slops.up.railway.app').err).toBeDefined();
  });

  it('reports a rejection as 403, not as a server fault', () => {
    // A bare Error reached errorHandler with no status, became a 500, and
    // Sentry files 5xx as incidents — so every crawler with a foreign Origin
    // looked like an outage.
    const { err } = request('https://evil.example.com');
    expect(err.status).toBe(403);
    expect(err.code).toBe('CORS_FORBIDDEN');
  });
});

describe('CORS outside production', () => {
  it('stays permissive for local development', () => {
    process.env.NODE_ENV = 'development';
    expect(request('http://localhost:5173').err).toBeUndefined();
    expect(request('http://127.0.0.1:3000').err).toBeUndefined();
  });
});
