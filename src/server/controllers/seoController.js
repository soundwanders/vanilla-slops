/**
 * @fileoverview SEO controllers — server-rendered game landing pages, sitemap,
 * and robots. These make the catalog crawlable: each game gets a real HTML page
 * at /game/:appid/:slug with unique meta tags and JSON-LD, and the sitemap lists
 * them all. No client JS on these pages (CSP-safe, fully static content).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchGameWithLaunchOptions, getGamesForSitemap } from '../services/gamesService.js';
import { slugify } from '../utils/slugify.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_URL = (process.env.DOMAIN_URL || 'https://launchoptions.dev').replace(/\/$/, '');
const DIST_INDEX = path.resolve(__dirname, '../../client/dist/index.html');

// Resolve the hashed CSS bundle once (from the built index.html) so game pages
// reuse the site's styles. Degrades gracefully to unstyled-but-crawlable if the
// build isn't present (e.g. dev before `npm run build`).
let _cssHref = null;
function getCssHref() {
  if (_cssHref !== null) return _cssHref;
  try {
    const html = fs.readFileSync(DIST_INDEX, 'utf8');
    const m = html.match(/href="([^"]+\.css)"/i);
    _cssHref = m ? m[1] : '';
  } catch {
    _cssHref = '';
  }
  return _cssHref;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function xmlEscape(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function truncate(s, n) {
  const str = String(s || '').trim();
  return str.length <= n ? str : str.slice(0, n - 1).trimEnd() + '…';
}

/**
 * GET /game/:appid/:slug? — server-rendered game landing page.
 */
export async function gamePageController(req, res) {
  const appId = parseInt(req.params.appid, 10);
  if (isNaN(appId) || appId < 1) {
    return res.status(404).type('html').send(render404());
  }

  let game;
  try {
    game = await fetchGameWithLaunchOptions(appId);
  } catch {
    return res.status(404).type('html').send(render404());
  }
  if (!game) return res.status(404).type('html').send(render404());

  // Redirect to the canonical slug if it's missing or wrong (one URL per game)
  const canonicalSlug = slugify(game.title);
  if (req.params.slug !== canonicalSlug) {
    return res.redirect(301, `/game/${appId}/${canonicalSlug}`);
  }

  res.set('Cache-Control', 'public, max-age=3600');
  res.type('html').send(renderGamePage(game, canonicalSlug));
}

function renderGamePage(game, slug) {
  const title = game.title || 'Unknown Game';
  const developer = game.developer || '';
  const publisher = game.publisher || '';
  const releaseDate = game.release_date || '';
  const engine = game.engine && game.engine !== 'Unknown' ? game.engine : '';
  const options = Array.isArray(game.launchOptions) ? game.launchOptions : [];
  const canonical = `${SITE_URL}/game/${game.app_id}/${slug}`;
  const steamImage = `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.app_id}/header.jpg`;

  const pageTitle = `${title} Launch Options — Vanilla Slops`;
  const metaDesc = truncate(
    `${options.length} community-verified Steam launch option${options.length === 1 ? '' : 's'} for ${title}` +
    `${developer ? ` by ${developer}` : ''} — performance tweaks, graphics fixes, and more.`,
    160
  );
  const css = getCssHref();

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'VideoGame',
    name: title,
    url: canonical,
    gamePlatform: 'PC (Steam)',
    ...(developer ? { author: { '@type': 'Organization', name: developer } } : {}),
    ...(publisher ? { publisher: { '@type': 'Organization', name: publisher } } : {}),
  };
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Vanilla Slops', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: title, item: canonical },
    ],
  };

  const metaRows = [
    developer && `<div class="game-meta-row"><span>Developer</span><strong>${escapeHtml(developer)}</strong></div>`,
    publisher && `<div class="game-meta-row"><span>Publisher</span><strong>${escapeHtml(publisher)}</strong></div>`,
    releaseDate && `<div class="game-meta-row"><span>Released</span><strong>${escapeHtml(releaseDate)}</strong></div>`,
    engine && `<div class="game-meta-row"><span>Engine</span><strong>${escapeHtml(engine)}</strong></div>`,
  ].filter(Boolean).join('\n');

  const optionsHtml = options.length
    ? `<ul class="launch-options-list">\n${options.map(renderOption).join('\n')}\n</ul>`
    : `<p class="seo-empty">No community-verified launch options for ${escapeHtml(title)} yet.</p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light dark" />
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="${escapeHtml(metaDesc)}" />
  <link rel="canonical" href="${canonical}" />
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${escapeHtml(pageTitle)}" />
  <meta property="og:description" content="${escapeHtml(metaDesc)}" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:image" content="${steamImage}" />
  <meta property="og:site_name" content="Vanilla Slops" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(pageTitle)}" />
  <meta name="twitter:description" content="${escapeHtml(metaDesc)}" />
  <meta name="twitter:image" content="${steamImage}" />
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
  <script type="application/ld+json">${JSON.stringify(breadcrumb)}</script>
  ${css ? `<link rel="stylesheet" href="${css}" />` : ''}
  <script src="/game-theme.js"></script>
  <script src="/game-copy.js" defer></script>
  <link rel="icon" href="/favicon.ico" />
</head>
<body class="seo-page">
  <header class="seo-header">
    <a href="/" class="seo-home" aria-label="Vanilla Slops home">
      <img src="/slops-logo.png" alt="" width="40" height="40" />
      <span>Vanilla Slops</span>
    </a>
    <a href="/" class="seo-cta">Search all games →</a>
    <button id="theme-toggle" aria-label="Toggle between dark and light theme" aria-pressed="false">
      <svg class="theme-icon icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
      <svg class="theme-icon icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="6.34" y2="6.34"/><line x1="17.66" y1="17.66" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="6.34" y1="17.66" x2="4.93" y2="19.07"/><line x1="19.07" y1="4.93" x2="17.66" y2="6.34"/></svg>
      <span class="sr-only">Toggle Theme</span>
    </button>
  </header>

  <main class="seo-main">
    <nav class="seo-breadcrumb" aria-label="Breadcrumb">
      <a href="/">Home</a> <span aria-hidden="true">/</span> <span>${escapeHtml(title)}</span>
    </nav>

    <div class="seo-art" style="background-image:url('${steamImage}')" role="img" aria-label="${escapeHtml(title)} header art"></div>

    <span class="seo-eyebrow">Launch Options</span>
    <h1 class="seo-title">${escapeHtml(title)}</h1>
    <p class="seo-subtitle">
      ${options.length} community-verified launch option${options.length === 1 ? '' : 's'}
      for <a href="https://store.steampowered.com/app/${game.app_id}" target="_blank" rel="noopener noreferrer">${escapeHtml(title)} on Steam ↗</a>.
    </p>

    ${metaRows ? `<section class="game-meta">${metaRows}</section>` : ''}

    <section aria-label="Launch options">
      ${optionsHtml}
    </section>

    <p class="seo-footer-cta">
      <a href="/" class="seo-cta">Browse ${escapeHtml(title)} and thousands more on Vanilla Slops →</a>
    </p>
  </main>

  <footer class="seo-foot">
    <p class="footer-name">
      <a href="/" class="footer-link">Vanilla Slops</a>
      <span class="footer-sep" aria-hidden="true">&middot;</span>
      <a href="https://github.com/soundwanders/vanilla-slops"
         target="_blank" rel="noopener noreferrer" class="footer-link footer-icon-link" aria-label="GitHub">
        <svg viewBox="0 0 16 16" width="17" height="17" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.65 7.65 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>
      </a>
    </p>
    <p class="footer-line">Community-verified Steam launch options</p>
    <p class="footer-line">Not affiliated with Valve Corporation</p>
  </footer>
</body>
</html>`;
}

const RISK_LABELS = { safe: 'Safe', caution: 'Caution', experimental: 'Experimental' };

function renderOption(opt) {
  const command = opt.command || opt.option || '';
  const description = opt.description && opt.description !== 'No description available' ? opt.description : '';
  const source = opt.source || 'Community';
  const verified = opt.verified
    ? '<span class="option-verified">✓ Verified</span>'
    : '';
  const votes = opt.upvotes > 0 ? `<span class="option-votes">👍 ${opt.upvotes}</span>` : '';
  // Defensive metadata badges — undefined until the slop-scraper columns are live
  // and added to the query (see gamesService.js). Render nothing when absent.
  const risk = RISK_LABELS[opt.risk_level] ? `<span class="risk-badge risk-${opt.risk_level}">${RISK_LABELS[opt.risk_level]}</span>` : '';
  const cats = Array.isArray(opt.categories)
    ? opt.categories.filter(c => c && c !== 'Uncategorized').map(c => `<span class="cat-chip">${escapeHtml(c)}</span>`).join('')
    : '';
  return `  <li class="launch-option">
    <div class="option-command" data-command="${escapeHtml(command)}" role="button" tabindex="0" aria-label="Copy launch option: ${escapeHtml(command)}">
      <code>${escapeHtml(command)}</code>
      <span class="copy-indicator" aria-hidden="true">
        <svg class="ci-icon ci-copy" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        <svg class="ci-icon ci-done" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
        <span class="copy-word">Copy</span>
      </span>
    </div>
    ${description ? `<div class="option-description">${escapeHtml(description)}</div>` : ''}
    ${cats ? `<div class="option-cats">${cats}</div>` : ''}
    <div class="option-meta">
      <span class="option-source">${escapeHtml(source)}</span>
      <div class="option-badges">${risk}${verified}${votes}</div>
    </div>
  </li>`;
}

function render404() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex" />
  <title>Game not found — Vanilla Slops</title>
  ${getCssHref() ? `<link rel="stylesheet" href="${getCssHref()}" />` : ''}
  <script src="/game-theme.js"></script>
</head>
<body class="seo-page">
  <main class="seo-main">
    <h1 class="seo-title">Game not found</h1>
    <p class="seo-subtitle">We couldn't find that game. <a href="/">Search the full database →</a></p>
  </main>
</body>
</html>`;
}

/**
 * GET /sitemap.xml — lists the homepage plus every game-with-options page.
 */
export async function sitemapController(req, res) {
  try {
    const games = await getGamesForSitemap();
    const urls = [
      `  <url><loc>${SITE_URL}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,
      ...games.map((g) => {
        const loc = `${SITE_URL}/game/${g.app_id}/${slugify(g.title)}`;
        const lastmod = g.updated_at ? `<lastmod>${new Date(g.updated_at).toISOString().slice(0, 10)}</lastmod>` : '';
        return `  <url><loc>${xmlEscape(loc)}</loc>${lastmod}<changefreq>weekly</changefreq><priority>0.7</priority></url>`;
      }),
    ];

    res.set('Cache-Control', 'public, max-age=86400');
    res.type('application/xml').send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`
    );
  } catch (err) {
    console.error('sitemap error:', err);
    res.status(500).type('text/plain').send('sitemap generation failed');
  }
}
