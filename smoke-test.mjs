/**
 * Browser smoke test — drives the real UI against the real database.
 *
 * This is the only check in the repo that exercises what a visitor actually
 * touches. Vitest covers pure functions; nothing else opens a page, clicks a
 * row and reads what came back. The bug that prompted the rewrite (a copy
 * control that took focus, announced itself as a button, and did nothing when
 * pressed) was invisible to every unit test and would have been obvious here.
 *
 * Run with the dev server up:
 *
 *   npm run dev        # in one terminal — Vite on 3000, Express on 8000
 *   npm run smoke      # in another
 *
 * Override the target with SMOKE_URL to point at a preview or production.
 *
 * ---------------------------------------------------------------------------
 * It exits non-zero when a check fails. This matters more than it sounds: the
 * previous version printed observations, swallowed every failure and ended with
 * `process.exit(0)`, so it could not fail. Five of its selectors had also gone
 * stale — #showAllGamesFilter, .slop-details, .launch-options-panel,
 * .options-expanded and .pagination-next no longer exist anywhere in the source
 * — meaning it was reporting "WARN: not found" about its own rot while still
 * passing. A green check that verifies nothing is worse than no check at all,
 * because it gets believed.
 * ---------------------------------------------------------------------------
 */

import { chromium } from 'playwright';

const BASE = process.env.SMOKE_URL || 'http://localhost:3000';

const results = [];
let failed = 0;

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  if (!ok) failed++;
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

/** Assert-style check that records rather than throwing, so one failure does
 *  not hide the state of everything after it. */
function check(name, condition, detail) {
  record(name, Boolean(condition), detail);
  return Boolean(condition);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

// Console errors are a failure signal in their own right. Filtered: favicon
// 404s and third-party noise say nothing about the app.
const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error' && !/favicon/i.test(msg.text())) consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => consoleErrors.push(`PAGE ERROR: ${err.message}`));

/** Wait for real rows — `.skeleton-row` is the loading placeholder and would
 *  otherwise satisfy a naive `tbody tr` wait. */
async function waitForTable(timeout = 15000) {
  await page.waitForSelector('tbody tr.game-row', { timeout });
}

async function rowCount() {
  return page.$$eval('tbody tr.game-row', (r) => r.length);
}

/** The catalogue-wide total the header reports, not the rows on this page. */
async function resultTotal() {
  const text = await page.$eval('#resultsCount', (el) => el.textContent).catch(() => '');
  const match = text.replace(/,/g, '').match(/\d+/);
  return match ? Number(match[0]) : -1;
}

try {
  // === 1. The page loads and the table paints ===============================
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await waitForTable();
  const rows = await rowCount();
  check('page load renders game rows', rows > 0, `${rows} rows`);

  const resultsText = await page.$eval('#resultsCount', (el) => el.textContent.trim()).catch(() => '');
  check('results count is populated', /\d/.test(resultsText), `"${resultsText}"`);

  // === 2. Search narrows the table =========================================
  const searchInput = await page.$('.search-input');
  if (check('search input exists', searchInput)) {
    const totalBefore = await resultTotal();

    await searchInput.fill('half-life');
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      (prev) => document.querySelector('#resultsCount')?.textContent.trim() !== prev,
      await page.$eval('#resultsCount', (el) => el.textContent.trim()),
      { timeout: 15000 }
    );
    await waitForTable();

    // Assert on the total, not on the first row. The default sort is
    // `featured`, so the top result is whichever curated game survives the
    // filter — checking it would test the sort order, not the search.
    const totalAfter = await resultTotal();
    check(
      'search narrows the result set',
      totalAfter > 0 && totalAfter < totalBefore,
      `${totalBefore} -> ${totalAfter}`
    );

    const titles = await page.$$eval('tbody tr.game-row .game-page-link', (els) =>
      els.map((e) => e.textContent.trim())
    );
    check(
      'search results are relevant',
      titles.some((t) => /half/i.test(t)),
      `${titles.length} titles, matched: ${titles.filter((t) => /half/i.test(t)).length}`
    );

    // === 3. Clearing restores the full list ================================
    await searchInput.fill('');
    await page.keyboard.press('Enter');
    await waitForTable();
    const restored = await resultTotal();
    check('clearing search restores the catalogue', restored === totalBefore, `${restored} of ${totalBefore}`);
  }

  // === 4. An expansion opens and shows real options ========================
  const optionsBtn = await page.$('.launch-options-btn');
  if (check('a row offers launch options', optionsBtn)) {
    await optionsBtn.click();
    await page.waitForSelector('tr.launch-options-row.is-open .launch-option', { timeout: 15000 });
    const optionCount = await page.$$eval('tr.launch-options-row.is-open .launch-option', (o) => o.length);
    check('expansion renders options', optionCount > 0, `${optionCount} options`);

    const expanded = await optionsBtn.getAttribute('aria-expanded');
    check('button reports aria-expanded=true', expanded === 'true', `got "${expanded}"`);

    // === 5. The copy control is operable by keyboard ======================
    // The regression this file exists for. Focus it and press Enter — the
    // control must act, not merely accept focus. Asserted via the class the
    // click handler adds rather than the clipboard, which headless Chromium
    // will not grant without a permission prompt.
    const command = await page.$('tr.launch-options-row.is-open .option-command');
    if (check('copy control is present', command)) {
      const focusable = await command.evaluate((el) => el.tabIndex >= 0 && el.getAttribute('role') === 'button');
      check('copy control is focusable and announced as a button', focusable);

      await command.focus();
      const isFocused = await command.evaluate((el) => el === document.activeElement);
      check('copy control takes focus', isFocused);

      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
      // `.copied` on success, `.copy-failed` when the clipboard write rejects —
      // headless Chromium often refuses it without a permission grant. Either
      // class proves the handler ran, which is the thing under test. Asserting
      // on the clipboard itself would fail for a reason unrelated to the bug.
      const acted = await command.evaluate(
        (el) => el.classList.contains('copied') || el.classList.contains('copy-failed')
      );
      check('Enter activates the copy control', acted);
    }

    // Re-query rather than reusing the handle: opening an expansion can
    // re-render the table, which detaches the original button element.
    const collapseBtn = await page.$('.launch-options-btn[aria-expanded="true"]');
    if (collapseBtn) {
      await collapseBtn.click().catch(() => {});
      await page.waitForTimeout(300);
    }
  }

  // === 6. Filters are populated from the facets endpoint ===================
  const engineSelect = await page.$('#engineFilter');
  if (check('engine filter exists', engineSelect)) {
    const opts = await engineSelect.$$eval('option', (os) => os.map((o) => o.value).filter(Boolean));
    check('engine filter is populated from facets', opts.length > 1, `${opts.length} engines`);

    const enabled = await engineSelect.evaluate((el) => !el.disabled);
    check('engine filter is enabled after load', enabled);

    if (opts.length > 1) {
      await engineSelect.selectOption(opts[0]);
      await waitForTable();
      const filtered = await rowCount();
      check('engine filter returns results', filtered > 0, `"${opts[0]}" -> ${filtered} rows`);
      await engineSelect.selectOption('');
      await waitForTable();
    }
  }

  // === 7. Pagination advances ==============================================
  const pageBtn = await page.$('.pagination-btn-page');
  if (check('pagination renders', pageBtn)) {
    const currentPage = () =>
      page.$eval('.pagination-text strong', (el) => Number(el.textContent.trim())).catch(() => -1);

    const before = await currentPage();
    const nextPage =
      (await page.$('.pagination-btn-next')) ||
      (await page.$('.pagination-btn-page:not(.active)'));

    await nextPage.click();
    // Wait for the page number itself to change. Waiting on the table alone
    // resolves instantly against the rows already on screen, which is how the
    // first version of this check reported "Page 1 -> Page 1" and passed.
    const advanced = await page
      .waitForFunction(
        (prev) => Number(document.querySelector('.pagination-text strong')?.textContent.trim()) !== prev,
        before,
        { timeout: 15000 }
      )
      .then(() => true)
      .catch(() => false);

    await waitForTable();
    const after = await currentPage();
    const paged = await rowCount();
    check(
      'pagination advances to another page',
      advanced && after > before && paged > 0,
      `page ${before} -> ${after}, ${paged} rows`
    );
  }

  // === 8. Nothing threw along the way =====================================
  check('no console errors', consoleErrors.length === 0, consoleErrors.join(' | ') || 'clean');
} catch (error) {
  record('smoke run completed', false, error.message);
} finally {
  // `.tmp-` prefix and a gitignore rule, per the repo's scratch-file rule —
  // a smoke run should not leave an untracked artefact at the root.
  await page.screenshot({ path: '.tmp-smoke-final.png' }).catch(() => {});
  await browser.close();
}

console.log(`\n${results.length - failed}/${results.length} checks passed against ${BASE}`);
if (failed > 0) {
  console.error(`\n${failed} check${failed === 1 ? '' : 's'} failed.`);
  process.exit(1);
}
process.exit(0);
