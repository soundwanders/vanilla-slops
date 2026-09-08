import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { APP_VERSION } from '../config/version.js';

const require = createRequire(import.meta.url);
const pkg = require('../../../package.json');
const lock = require('../../../package-lock.json');

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

/**
 * package.json is not the only file in the repo that states this project's
 * version. package-lock.json states it twice more, nothing reads either copy at
 * runtime, and so they drifted four releases behind before anyone looked: the
 * lockfile still said 1.3.2 on the day 1.5.1 shipped.
 *
 * `npm version <x> --no-git-tag-version` writes all three. A hand edit to
 * package.json writes one.
 */
describe('package-lock.json', () => {
  it('states the same project version as package.json, in both places', () => {
    expect(lock.version).toBe(pkg.version);
    expect(lock.packages[''].version).toBe(pkg.version);
  });

  /**
   * The obvious way to fix the drift above is a global find-and-replace of the
   * old version string. It is also wrong: on the day this was written, two
   * unrelated dependencies were legitimately pinned at 1.3.2, and a blind
   * replace would have rewritten their `version` fields while leaving
   * `resolved` and `integrity` pointing at the real 1.3.2 tarball. Nothing
   * fails at that moment. It surfaces much later as an `npm ci` integrity
   * error that reads like a registry problem.
   *
   * Every registry entry encodes its version in the tarball URL, so the two can
   * be checked against each other. 570 entries, zero exceptions.
   */
  it('never has a dependency version that disagrees with its tarball URL', () => {
    const mismatched = Object.entries(lock.packages)
      .filter(([, meta]) => meta.resolved?.includes('registry.npmjs.org') && meta.version)
      .filter(([, meta]) => !meta.resolved.endsWith(`-${meta.version}.tgz`))
      .map(([path, meta]) => `${path}: version ${meta.version} vs ${meta.resolved}`);

    expect(mismatched).toEqual([]);
  });
});
