import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { APP_VERSION } from '../config/version.js';

const require = createRequire(import.meta.url);
const pkg = require('../../../package.json');

describe('APP_VERSION', () => {
  it('is exactly what package.json says, with no second place to update', () => {
    expect(APP_VERSION).toBe(pkg.version);
  });

  it('is a real semver, not a fallback string', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+(-[\w.]+)?$/);
    // The old /health fallback. If this ever comes back it means the version
    // is being read from somewhere that isn't package.json again.
    expect(APP_VERSION).not.toBe('1.0.0');
  });

  it('does not depend on npm having started the process', () => {
    // npm_package_version is only set when npm runs the process; Vercel does not.
    const saved = process.env.npm_package_version;
    delete process.env.npm_package_version;
    expect(APP_VERSION).toBe(pkg.version);
    if (saved !== undefined) process.env.npm_package_version = saved;
  });
});
