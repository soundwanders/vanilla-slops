/**
 * The application version, read from package.json so there is exactly one place
 * it is ever written.
 *
 * `/health` used to read `process.env.npm_package_version`, which npm only sets
 * for processes it starts itself. Vercel invokes the function directly, so in
 * production that was always undefined and the endpoint fell back to reporting
 * "1.0.0" — wrong from the first release onward, and quietly so.
 *
 * `createRequire` rather than an import attribute: `with { type: 'json' }` needs
 * Node 22, and a parse error there would take down the whole function if the
 * deployment ever ran an older runtime. A require() call is also traced
 * statically by Vercel's bundler, which guarantees package.json is included in
 * the deployed function.
 */
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pkg = require('../../../package.json');

/** @type {string} e.g. "1.3.0" */
export const APP_VERSION = pkg.version;
