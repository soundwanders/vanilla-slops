import js from '@eslint/js';
import globals from 'globals';

/**
 * Flat config, replacing `.eslintrc.json` and `.eslintignore`.
 *
 * ESLint 9 made this format the default and 10 dropped the old one entirely,
 * along with the `--ext` flag — file selection now lives here, in `files`,
 * which is why `npm run lint` is just `eslint .` rather than `eslint src/
 * --ext .js`. `.eslintignore` is likewise no longer read; ignores are the
 * `ignores` block below.
 *
 * This is a faithful port, not a re-think: the rule set is still
 * `eslint:recommended` plus the same two overrides the project has always
 * carried. Tightening it and migrating at the same time would make any new
 * warning ambiguous — config change, or real finding? The bar stays 0 errors
 * and 0 warnings, so a stricter pass is a separate decision on a separate day.
 */
export default [
  {
    // Was `.eslintignore`. `src/client/dist/` is build output; the scratch
    // prefix matches the repo's convention for throwaway files.
    ignores: ['src/client/dist/**', 'node_modules/**', '.tmp-*'],
  },

  js.configs.recommended,

  {
    // Was `--ext .js`. The repo is ESM throughout (`"type": "module"`), and
    // `smoke-test.mjs` at the root is linted too, which the old `src/`-scoped
    // invocation never covered.
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      // Was `env: { browser, node, es2021 }`. Applied to everything rather
      // than split by directory, exactly as before: client code legitimately
      // reads `process.env.NODE_ENV` (Vite substitutes it at build time), so a
      // browser-only global set would flag StateManager.js.
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
      },
    },
    rules: {
      'no-unused-vars': 'warn',
      'no-console': 'off',
    },
  },
];
