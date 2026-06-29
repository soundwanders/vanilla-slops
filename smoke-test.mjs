import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const errors = [];
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', err => errors.push(`PAGE ERROR: ${err.message}`));

async function waitForTable(timeout = 8000) {
  await page.waitForSelector('tbody tr:not(.skeleton-row)', { timeout });
  await page.waitForTimeout(200);
}

// === 1. Page load ===
await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
await waitForTable(12000);
const rows1 = await page.$$eval('tbody tr', r => r.length);
const resultsText = await page.$eval('#resultsCount', el => el.textContent).catch(() => '?');
console.log(`1. Page load: ${rows1} rows, "${resultsText}"`);

// === 2. Search "half-life" ===
const searchInput = await page.$('input[type="search"], .search-input, input[placeholder*="earch" i]');
if (searchInput) {
  await searchInput.fill('half-life');
  await page.waitForTimeout(1000); // debounce
  await waitForTable();
  const rows2 = await page.$$eval('tbody tr', r => r.length);
  const first = await page.$eval('tbody tr:first-child td:first-child', el => el.textContent.trim()).catch(() => '?');
  console.log(`2. Search half-life: ${rows2} rows, first cell: "${first}"`);
} else {
  console.log('2. WARN: search input not found');
}

// === 3. Clear search ===
if (searchInput) {
  await searchInput.fill('');
  await page.waitForTimeout(1000);
  await waitForTable();
  const rows3 = await page.$$eval('tbody tr', r => r.length);
  const res3 = await page.$eval('#resultsCount', el => el.textContent).catch(() => '?');
  console.log(`3. Clear search: ${rows3} rows, "${res3}"`);
}

// === 4. Expand launch options ===
const firstRow = await page.$('tbody tr:first-child');
if (firstRow) {
  const titleBefore = await page.$eval('tbody tr:first-child td:first-child', el => el.textContent.trim()).catch(() => '?');
  await firstRow.click();
  await page.waitForTimeout(600);
  const expandedEl = await page.$('.slop-details, .launch-options-panel, .options-expanded, [class*="launch-option"]');
  console.log(`4. Expand "${titleBefore}": panel found=${!!expandedEl}`);
  // collapse it
  await firstRow.click();
  await page.waitForTimeout(400);
}

// === 5. Show All Games toggle ===
// checkbox is added dynamically — find by id set in main.js
const checkbox = await page.$('#showAllGamesFilter');
if (checkbox) {
  await checkbox.check();
  await page.waitForTimeout(1200);
  await waitForTable();
  const rows5 = await page.$$eval('tbody tr', r => r.length);
  const res5 = await page.$eval('#resultsCount', el => el.textContent).catch(() => '?');
  console.log(`5. Show All toggle ON: ${rows5} rows visible, "${res5}"`);
  await checkbox.uncheck();
  await page.waitForTimeout(800);
  await waitForTable();
} else {
  // dump what checkboxes exist
  const checkboxes = await page.$$eval('input[type="checkbox"]', els => els.map(e => e.id + '|' + e.className));
  console.log(`5. WARN: #showAllGamesFilter not found. Checkboxes on page: ${JSON.stringify(checkboxes)}`);
}

// === 6. Engine filter ===
const engineSelect = await page.$('#engineFilter');
if (engineSelect) {
  const isEnabled = await engineSelect.evaluate(el => !el.disabled);
  const opts = await engineSelect.$$eval('option', os => os.map(o => o.value).filter(v => v));
  console.log(`6. Engine filter: enabled=${isEnabled}, ${opts.length} options. First: "${opts[0]}"`);
  if (isEnabled && opts[0]) {
    await engineSelect.selectOption(opts[0]);
    await page.waitForTimeout(800);
    await waitForTable();
    const rows6 = await page.$$eval('tbody tr', r => r.length);
    const res6 = await page.$eval('#resultsCount', el => el.textContent).catch(() => '?');
    console.log(`   After filter "${opts[0]}": ${rows6} rows, "${res6}"`);
    await engineSelect.selectOption('');
    await page.waitForTimeout(600);
    await waitForTable();
  }
} else {
  console.log('6. WARN: #engineFilter not found');
}

// === 7. Pagination ===
const paginationHTML = await page.$eval('.pagination, [class*="pagination"], nav[aria-label*="page" i]', el => el.outerHTML.substring(0, 500)).catch(() => null);
if (paginationHTML) {
  // try clicking a page-2 button
  const nextBtn = await page.$('[data-page="2"], [aria-label="Next"], [aria-label="Next page"], button.pagination-next, .next-page');
  if (nextBtn) {
    await nextBtn.click();
    await page.waitForTimeout(1000);
    await waitForTable();
    const rows7 = await page.$$eval('tbody tr', r => r.length);
    console.log(`7. Page 2: ${rows7} rows`);
  } else {
    console.log(`7. Pagination HTML (first 400 chars): ${paginationHTML.substring(0, 400)}`);
  }
} else {
  console.log('7. WARN: no pagination element found');
}

await page.screenshot({ path: '/tmp/smoke-final.png' });

// === 8. Console errors ===
console.log(`\n8. Console errors: ${errors.length ? errors.join('\n   ') : 'none'}`);

await browser.close();
Deno?.exit?.(0);
process.exit(0);
