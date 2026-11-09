import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * ProtonDB's reports are under the Open Database License, and the site shows
 * data derived from them. ODbL §4.3 asks for a notice wherever that data is
 * shown, and §9.1 ends the licence automatically without one. A footer edit
 * that drops the line is an easy mistake, so it fails here instead.
 * slop-scraper rev 23 §9g.
 */

vi.mock('../config/supabaseClient.js', () => ({
  default: { from: () => { throw new Error('no database in tests'); } },
}));

const { PROTONDB_NOTICE_HTML, howItWorksController } = await import('../controllers/seoController.js');

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

async function renderHowItWorks() {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const res = { set: vi.fn().mockReturnThis(), type: vi.fn().mockReturnThis(), send: vi.fn() };
  await howItWorksController({}, res);
  return res.send.mock.calls[0][0];
}

describe('ProtonDB licence notice', () => {
  it('uses the licence\'s suggested wording, with both links', () => {
    const text = PROTONDB_NOTICE_HTML.replace(/<[^>]+>/g, '');
    expect(text).toBe('Contains information from ProtonDB, which is made available here under the Open Database License (ODbL).');
    expect(PROTONDB_NOTICE_HTML).toContain('href="https://www.protondb.com"');
    expect(PROTONDB_NOTICE_HTML).toContain('href="https://opendatacommons.org/licenses/odbl/1-0/"');
  });

  it('is in the homepage footer, identical to the server-rendered one', () => {
    const footer = read('../../client/index.html').match(/<footer>[\s\S]*?<\/footer>/)[0];
    expect(footer).toContain(PROTONDB_NOTICE_HTML);
  });

  it('is in the footer of a server-rendered page', async () => {
    const footer = (await renderHowItWorks()).match(/<footer class="seo-foot">[\s\S]*?<\/footer>/)[0];
    expect(footer).toContain(PROTONDB_NOTICE_HTML);
  });

  // Every server-rendered page draws its footer from seoFooter(). A second
  // hand-written footer is how the two copies drifted once before.
  it('has no server-rendered footer except the shared one', () => {
    expect(read('../controllers/seoController.js').match(/<footer/g)).toHaveLength(1);
  });

  it('offers the derived data on request on How It Works, with a way to ask', async () => {
    const html = await renderHowItWorks();
    expect(html).toMatch(/available under the same licence on request/);
    expect(html).toContain('https://github.com/soundwanders/vanilla-slops/issues/new?title=Request%3A+ProtonDB-derived+data');
  });
});
