/**
 * @fileoverview SEO controllers — server-rendered game landing pages, sitemap,
 * and robots. These make the catalog crawlable: each game gets a real HTML page
 * at /game/:appid/:slug with unique meta tags and JSON-LD, and the sitemap lists
 * them all. No client JS on these pages (CSP-safe, fully static content).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchGameWithLaunchOptions, fetchRelatedGames, getGamesForSitemap, getCatalogStats, getCatalogGrain } from '../services/gamesService.js';
import { slugify } from '../../shared/slugify.js';
import { jsonLdScript } from '../utils/jsonLdScript.js';
import { safeHttpUrl } from '../utils/safeUrl.js';

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

// Prefilled GitHub "new issue" URL for launch-option suggestions — a contribution
// path that needs no write API on our side.
const REPO_URL = 'https://github.com/soundwanders/vanilla-slops';
function suggestIssueUrl() {
  const params = new URLSearchParams({
    title: 'Launch option suggestion',
    labels: 'option-suggestion',
    body: [
      '**Game:**',
      '',
      '**Launch option(s):**',
      '```',
      '-your_option_here',
      '```',
      '',
      '**What it does / effect:**',
      '',
      '**Where you found it (source, if any):**',
      ''
    ].join('\n')
  });
  return `${REPO_URL}/issues/new?${params.toString()}`;
}

/**
 * Shared header for server-rendered pages: logo, "Search all games" CTA, a
 * "How it works" nav link, and the theme toggle. Pass current:'how-it-works'
 * to omit the nav link on its own page (it would be a redundant self-link and
 * an extra header item that can force the toggle to wrap).
 * @param {{current?: string}} [opts]
 */
function seoHeader({ current } = {}) {
  const hiwLink = current === 'how-it-works'
    ? ''
    : '<a href="/how-it-works" class="seo-nav-link">How it works</a>';
  const catLink = current === 'catalog'
    ? ''
    : '<a href="/catalog" class="seo-nav-link">The Bedrock</a>';
  return `  <header class="seo-header">
    <a href="/" class="seo-home" aria-label="Vanilla Slops home">
      <img src="/slops-logo.png" alt="" width="40" height="40" decoding="async" />
      <span>Vanilla Slops</span>
    </a>
    <a href="/" class="seo-cta">Search all games →</a>
    ${catLink}
    ${hiwLink}
    <button id="theme-toggle" aria-label="Toggle between dark and light theme" aria-pressed="false">
      <svg class="theme-icon icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
      <svg class="theme-icon icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="6.34" y2="6.34"/><line x1="17.66" y1="17.66" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="6.34" y1="17.66" x2="4.93" y2="19.07"/><line x1="19.07" y1="4.93" x2="17.66" y2="6.34"/></svg>
      <span class="sr-only">Toggle Theme</span>
    </button>
  </header>`;
}

/**
 * Shared footer for server-rendered pages.
 *
 * This lived in two hand-maintained copies that had already drifted: one read
 * "Community-verified", the other "Community-sourced", and only one carried the
 * How-it-works link. A third copy for /catalog would have made the drift a
 * habit. `current` suppresses a page's link to itself, the same way seoHeader
 * does.
 *
 * The tagline settles on "sourced" because that is the claim the project can
 * defend: the `verified` column is retired, and what every published option
 * actually carries is provenance rather than a verdict.
 *
 * @param {{current?: string}} [opts]
 */
function seoFooter({ current } = {}) {
  const links = [
    current === 'how-it-works' ? '' : '<a href="/how-it-works" class="footer-link">How Vanilla Slops Works</a>',
    current === 'catalog' ? '' : '<a href="/catalog" class="footer-link">The Bedrock</a>',
  ].filter(Boolean).map((l) => `    <p class="footer-line">${l}</p>`).join('\n');

  return `  <footer class="seo-foot">
    <p class="footer-name">
      <a href="/" class="footer-link">Vanilla Slops</a>
      <span class="footer-sep" aria-hidden="true">&middot;</span>
      <a href="https://github.com/soundwanders/vanilla-slops"
         target="_blank" rel="noopener noreferrer" class="footer-link footer-icon-link" aria-label="GitHub">
        <svg viewBox="0 0 16 16" width="17" height="17" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.65 7.65 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>
      </a>
    </p>
${links}
    <p class="footer-line">Community-sourced Steam launch options</p>
    <p class="footer-line">Not affiliated with Valve Corporation</p>
  </footer>`;
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

  // Steam publishes some products under two App IDs (Condition Zero is 80 and
  // 100). `duplicate_of` names the surviving row, and public_games hides the
  // other — but this page still reads the table, precisely so a link to the
  // hidden ID can be honoured instead of 404ing. Send it to the canonical game,
  // which is the same "one URL per game" rule the slug redirect below applies;
  // the slug-less target picks up its own 301 from that rule.
  if (game.duplicate_of) {
    return res.redirect(301, `/game/${game.duplicate_of}`);
  }

  // Redirect to the canonical slug if it's missing or wrong (one URL per game)
  const canonicalSlug = slugify(game.title);
  if (req.params.slug !== canonicalSlug) {
    return res.redirect(301, `/game/${appId}/${canonicalSlug}`);
  }

  // Never let the related list take the page down with it — it returns [] on
  // failure and the section simply doesn't render.
  const related = await fetchRelatedGames(game);

  res.set('Cache-Control', 'public, max-age=3600');
  res.type('html').send(renderGamePage(game, canonicalSlug, related));
}

function renderGamePage(game, slug, related = []) {
  const title = game.title || 'Unknown Game';
  const developer = game.developer || '';
  const publisher = game.publisher || '';
  const releaseDate = game.release_date || '';
  // Prefer the exact engine version (engine_detail, e.g. "id Tech 3") for
  // display, falling back to the family (game.engine, e.g. "id Tech"). Both skip
  // the "Unknown" placeholder — absence of data isn't worth a meta row.
  const engineFamily = game.engine && game.engine !== 'Unknown' ? game.engine : '';
  const engineDetail = game.engine_detail && game.engine_detail !== 'Unknown' ? game.engine_detail : '';
  const engine = engineDetail || engineFamily;
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
  <meta name="theme-color" media="(prefers-color-scheme: light)" content="#ffffff" />
  <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#161b24" />
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="${escapeHtml(metaDesc)}" />
  <link rel="canonical" href="${canonical}" />
${options.length === 0 ? `  <!-- A game with no documented options is usually correct rather than a
       failure, and the page stays useful to a person who searched for the
       title. But it is ~106 words with nothing specific to say, and 69 of them
       exist - enough thin pages to affect how the whole domain is assessed.
       getGamesForSitemap already leaves these out; a sitemap omission is only a
       hint, so state it directly. The follow half keeps link equity flowing on
       to the related games below. -->
  <meta name="robots" content="noindex, follow" />
` : ''}  <meta property="og:type" content="article" />
  <meta property="og:title" content="${escapeHtml(pageTitle)}" />
  <meta property="og:description" content="${escapeHtml(metaDesc)}" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:image" content="${steamImage}" />
  <meta property="og:site_name" content="Vanilla Slops" />
  <link rel="preconnect" href="https://cdn.cloudflare.steamstatic.com" crossorigin />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(pageTitle)}" />
  <meta name="twitter:description" content="${escapeHtml(metaDesc)}" />
  <meta name="twitter:image" content="${steamImage}" />
  <script type="application/ld+json">${jsonLdScript(jsonLd)}</script>
  <script type="application/ld+json">${jsonLdScript(breadcrumb)}</script>
  ${css ? `<link rel="stylesheet" href="${css}" />` : ''}
  <script src="/game-theme.js"></script>
  <script src="/game-copy.js" defer></script>
  <link rel="icon" href="/favicon.ico" />
</head>
<body class="seo-page">
${seoHeader()}

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

    ${options.length ? HOW_TO_APPLY_HTML : ''}

    ${renderRelatedGames(related)}

    <p class="seo-footer-cta">
      <a href="/" class="seo-cta">Browse ${escapeHtml(title)} and thousands more on Vanilla Slops →</a>
    </p>
  </main>

${seoFooter({ current: 'game' })}
</body>
</html>`;
}

// Internal links between game pages. Without them every game page is a leaf
// reachable only from the sitemap: no link equity moves between them, and a
// reader who wants the next game has to go back to the index and search again.
// The count and the reason are shown so the link says what it leads to rather
// than asking for a blind click.
function renderRelatedGames(related) {
  if (!Array.isArray(related) || related.length === 0) return '';

  const items = related.map((g) => {
    // Never total_options_count: it counts links the view hides, so a card
    // would promise options the page it links to cannot show (rev 14 §1f).
    const count = g.display_options_count ?? g.total_options_count ?? 0;
    return `        <li class="related-game">
          <a class="related-game-link" href="/game/${g.app_id}/${slugify(g.title)}">
            <span class="related-game-title">${escapeHtml(g.title)}</span>
            <span class="related-game-meta">${count} option${count === 1 ? '' : 's'}<span class="related-game-sep" aria-hidden="true">·</span>${escapeHtml(g.label || '')}</span>
          </a>
        </li>`;
  }).join('\n');

  return `<section class="related-games" aria-labelledby="related-games-heading">
      <h2 id="related-games-heading">Related games</h2>
      <ul class="related-games-list">
${items}
      </ul>
    </section>`;
}

const RISK_LABELS = { safe: 'Safe', caution: 'Caution', experimental: 'Experimental' };

// Static, game-agnostic explainer for feedback #5 (general usage docs). The
// steps are identical for every game, so this is rendered once per page rather
// than per option.
const HOW_TO_APPLY_HTML = `
    <section class="how-to-apply" aria-labelledby="how-to-apply-heading">
      <h2 id="how-to-apply-heading">How to apply a launch option on Steam</h2>
      <ol class="how-to-steps">
        <li>Open <strong>Steam</strong> and go to your <strong>Library</strong>.</li>
        <li><strong>Right-click</strong> the game and choose <strong>Properties</strong>.</li>
        <li>On the <strong>General</strong> tab, find the <strong>Launch Options</strong> field.</li>
        <li>Type or paste the option (e.g. <code>-windowed</code>) into the field. To use several at once, separate them with spaces (e.g. <code>-windowed -novid</code>).</li>
        <li>Close Properties. Steam saves automatically, and the option applies next time you launch the game.</li>
      </ol>
      <p class="how-to-note">To remove one, reopen the same field and delete the text. Options are game-specific; an option that helps one game may do nothing (or misbehave) in another.</p>
      <p class="how-to-warning"><strong>Worth knowing:</strong> a launch option can break a game's rendering, reset local settings, or trip anti-cheat in multiplayer. Read the description first, add one at a time, and treat anything rated above <strong>Safe</strong> as a deliberate experiment.</p>
    </section>`;

// Turn a raw source slug into a readable label. `manual_curation` was the only
// underscored value and it is gone — its rows became PCGamingWiki, Steam
// Community and Universal — so this is now defensive against a future slug
// rather than something the current data exercises.
function humanizeSource(src) {
  const s = (src || 'Community').trim();
  if (s.includes('_')) {
    const spaced = s.replace(/_/g, ' ');
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
  }
  return s;
}

// Render the source as a real link when a URL exists (slop-scraper's future
// source_url column), otherwise plain, honest text — no fake affordance.
function renderSource(opt) {
  const label = escapeHtml(humanizeSource(opt.source));
  // A scheme the browser would treat as code has no business in an href, and
  // escaping does not stop it — `javascript:` is valid attribute syntax. A
  // rejected URL degrades to the same plain-text branch as a missing one, which
  // is the honest outcome: no fake affordance.
  const href = safeHttpUrl(opt.source_url);
  if (href) {
    return `<a class="option-source" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" title="Source: ${label} (opens in a new tab)">${label}</a>`;
  }
  return `<span class="option-source" title="Where this launch option was sourced from">${label}</span>`;
}

function formatAddedDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function renderOption(opt) {
  const command = opt.command || opt.option || '';
  // Wrapper tools (`gamemoderun %command%`, `mangohud %command%`) and Proton environment variables
  // store a form that does nothing pasted on its own — Steam substitutes
  // %command% with the executable, so the working form is the usage example.
  // Same rule as the SPA's pasteableCommand(), and it must stay in step with it.
  // Both conditions matter: an example may document a *different* setting than
  // the row it hangs off (`-w 640` is documented as `-w 1920 -h 1080`, and
  // `PROTON_NO_ESYNC=0` as `PROTON_NO_ESYNC=1 %command%`), so the example is
  // only used when it starts with this command — i.e. is the same option,
  // spelled runnably.
  const example = opt.usage_example || '';
  const pasteable = example.includes('%command%') && example.startsWith(command)
    ? example
    : command;
  const showExample = opt.usage_example && opt.usage_example !== pasteable;
  // Drop placeholder/non-answer descriptions so the source link shows instead.
  const rawDesc = (opt.description || '').trim();
  const isPlaceholder = ['no description available', 'launch option from pcgamingwiki'].includes(rawDesc.toLowerCase());
  const description = isPlaceholder ? '' : rawDesc;
  const addedDate = formatAddedDate(opt.created_at);
  const verifiedDate = formatAddedDate(opt.last_verified_at);
  // `verified` retired in favour of risk_level + future community votes
  const votes = opt.upvotes > 0 ? `<span class="option-votes">👍 ${opt.upvotes}</span>` : '';
  // Metadata badges. risk_level is set on every published row; categories can be
  // absent or Uncategorized (36% of rows — obscure game-specific flags, not a
  // classifier gap). Render nothing when absent.
  const risk = RISK_LABELS[opt.risk_level] ? `<span class="risk-badge risk-${opt.risk_level}">${RISK_LABELS[opt.risk_level]}</span>` : '';
  const cats = Array.isArray(opt.categories)
    ? opt.categories.filter(c => c && c !== 'Uncategorized').map(c => `<span class="cat-chip">${escapeHtml(c)}</span>`).join('')
    : '';
  return `  <li class="launch-option">
    <div class="option-command" data-command="${escapeHtml(pasteable)}" role="button" tabindex="0" aria-label="Copy launch option: ${escapeHtml(pasteable)}">
      <code>${escapeHtml(pasteable)}</code>
      <span class="copy-indicator" aria-hidden="true">
        <svg class="ci-icon ci-copy" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        <svg class="ci-icon ci-done" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
        <span class="copy-word">Copy</span>
      </span>
    </div>
    ${description ? `<div class="option-description">${escapeHtml(description)}</div>` : ''}
    ${(opt.effect || showExample) ? `
    <dl class="option-usage">
      ${opt.effect ? `<div class="option-usage-row"><dt>Effect</dt><dd>${escapeHtml(opt.effect)}</dd></div>` : ''}
      ${showExample ? `<div class="option-usage-row"><dt>Example</dt><dd><code>${escapeHtml(opt.usage_example)}</code></dd></div>` : ''}
    </dl>` : ''}
    ${cats ? `<div class="option-cats">${cats}</div>` : ''}
    <div class="option-meta">
      <div class="option-provenance">
        ${renderSource(opt)}
        ${addedDate ? `<span class="option-date">Added ${addedDate}</span>` : ''}
        ${verifiedDate ? `<span class="option-date option-verified" title="Last re-checked against its source">Last checked ${verifiedDate}</span>` : ''}
      </div>
      <div class="option-badges">${risk}${votes}</div>
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
 * GET /how-it-works — server-rendered methodology page. Static, honest content
 * about how the catalog is sourced, tagged, and validated. Facts confirmed
 * against the slop-scraper code (see docs/slop-scraper-followthrough.md §6).
 */
export async function howItWorksController(req, res) {
  // Figures are decorative-if-absent (getCatalogStats never throws), so the page
  // renders either way.
  const stats = await getCatalogStats();
  // Only cache in production. Locally, an hour-long cache means every rebuild
  // leaves the browser holding HTML that points at a bundle hash which no longer
  // exists, so the page renders unstyled until a hard refresh.
  res.set('Cache-Control', process.env.NODE_ENV === 'production'
    ? 'public, max-age=3600'
    : 'no-store');
  res.type('html').send(renderHowItWorks(stats));
}

/**
 * The three-figure line under the subtitle. Omitted entirely when the counts
 * aren't available — a half-empty stat row looks broken in a way that no stat
 * row does. Deliberately excludes a "sources" count: the numbered list of
 * sources sits a few inches below it.
 */
function renderFigures({ games, options, lastUpdated } = {}) {
  if (!games || !options) return '';
  const updated = formatAddedDate(lastUpdated);
  const parts = [
    `<span><strong>${games.toLocaleString('en-US')}</strong> games catalogued</span>`,
    `<span><strong>${options.toLocaleString('en-US')}</strong> launch options</span>`,
  ];
  if (updated) {
    parts.push(`<span>last updated <strong>${escapeHtml(updated)}</strong></span>`);
  }
  return `    <p class="hiw-figures">${parts.join('<span class="hiw-figures-sep" aria-hidden="true">·</span>')}</p>\n`;
}

/** A chapter marker between the page's three movements. */
function movement(number, label) {
  return `    <div class="hiw-movement" role="separator" aria-label="${escapeHtml(label)}">
      <span class="hiw-movement-num">${number}</span>
      <span class="hiw-movement-label">${escapeHtml(label)}</span>
    </div>`;
}

function renderHowItWorks(stats) {
  const canonical = `${SITE_URL}/how-it-works`;
  const pageTitle = 'How Vanilla Slops Works — Sourcing, Tagging & Validation';
  const metaDesc = truncate(
    'Where our Steam launch options come from, how they are categorized and ' +
    'risk-rated, what "verified" actually means, and how to apply them.', 160
  );
  const css = getCssHref();

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Vanilla Slops', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'How it works', item: canonical },
    ],
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light dark" />
  <meta name="theme-color" media="(prefers-color-scheme: light)" content="#ffffff" />
  <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#161b24" />
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="${escapeHtml(metaDesc)}" />
  <link rel="canonical" href="${canonical}" />
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${escapeHtml(pageTitle)}" />
  <meta property="og:description" content="${escapeHtml(metaDesc)}" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:site_name" content="Vanilla Slops" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${escapeHtml(pageTitle)}" />
  <meta name="twitter:description" content="${escapeHtml(metaDesc)}" />
  <script type="application/ld+json">${jsonLdScript(breadcrumb)}</script>
  ${css ? `<link rel="stylesheet" href="${css}" />` : ''}
  <script src="/game-theme.js"></script>
  <link rel="icon" href="/favicon.ico" />
</head>
<body class="seo-page">
${seoHeader({ current: 'how-it-works' })}

  <main class="seo-main how-it-works-page">
    <nav class="seo-breadcrumb" aria-label="Breadcrumb">
      <a href="/">Home</a> <span aria-hidden="true">/</span> <span>How it works</span>
    </nav>

    <h1 class="seo-title">How Vanilla Slops Works</h1>
    <p class="seo-subtitle">
      A searchable catalog of community-sourced Steam launch options. Here's
      where the data comes from, what each field means, and where we draw the
      line. That last part matters.
    </p>
${renderFigures(stats)}
    <div class="hiw-layout">
      <nav class="hiw-toc" aria-label="On this page">
        <div class="hiw-toc-inner">
          <p class="hiw-toc-title">On this page</p>
          <ol class="hiw-toc-list">
            <li><a href="#hiw-sources">Where the options come from</a></li>
            <li><a href="#hiw-tagging">How they're categorized and rated</a></li>
            <li><a href="#hiw-glossary">Field glossary</a></li>
            <li><a href="#how-to-apply-heading">Applying one on Steam</a></li>
            <li><a href="#hiw-validation">What we claim, and don't</a></li>
            <li><a href="#hiw-contribute">Suggesting an option</a></li>
            <li><a href="#hiw-ethos">What it stands for</a></li>
          </ol>
        </div>
      </nav>

      <div class="hiw-body">
${movement('I', 'Where the data comes from')}

    <section class="hiw-section" aria-labelledby="hiw-sources">
      <h2 id="hiw-sources">Where the launch options come from</h2>
      <p>Every option is gathered by a crawler we call <em>slop-scraper</em>,
      which reads from the places players already trust, in this order:</p>
      <ol class="hiw-pipeline">
        <li><strong>Curated &amp; engine-specific lists.</strong> Hand-picked
          options for known engines, plus a small set we curate ourselves.</li>
        <li><strong>PCGamingWiki.</strong> The community wiki's per-game pages.</li>
        <li><strong>Steam Community guides.</strong> Written by players who have
          already been there.</li>
        <li><strong>ProtonDB.</strong> Linux and Steam Deck reports and tweaks.</li>
      </ol>
      <p>A few options carry the source <strong>Universal</strong> rather than a
      site name &mdash; flags that work across many games whatever the engine
      (<code>-high</code>, <code>-fullscreen</code>, <code>-console</code>),
      collected by hand rather than lifted from any one game's page.</p>
      <p>Find the same command on a dozen games and we store it once and share
      it, so <code>-windowed</code> never fills the catalog with copies. Updates
      run on demand rather than on a schedule &mdash; the scraper runs when
      there's time to run it, and new options arrive in batches. That's why every
      option wears an <strong>Added</strong> date instead of pretending to be a
      live feed.</p>
    </section>

    <section class="hiw-section" aria-labelledby="hiw-tagging">
      <h2 id="hiw-tagging">How options are categorized and risk-rated</h2>
      <p>Categories and risk levels come from a fixed rule set that reads the
      command itself and where it came from, so the same input always produces
      the same grade. Display, performance, audio and skip-intro flags we
      recognize earn a <strong>Safe</strong> grade. Network and debug flags,
      which can reach multiplayer integrity and anti-cheat, sit at
      <strong>Experimental</strong> by default, since their effects are harder
      to pin down.</p>
    </section>

${movement('II', 'What you\'re looking at')}

    <section class="hiw-section" aria-labelledby="hiw-glossary">
      <h2 id="hiw-glossary">Field glossary</h2>
      <dl class="hiw-glossary">
        <dt><span class="risk-badge risk-safe">Safe</span></dt>
        <dd>Well-understood, low-impact tweaks (display, performance, audio,
          skip-intro).</dd>
        <dt><span class="risk-badge risk-caution">Caution</span></dt>
        <dd>Works, but can change behavior in ways worth understanding first.</dd>
        <dt><span class="risk-badge risk-experimental">Experimental</span></dt>
        <dd>Unproven, niche, or able to touch multiplayer and anti-cheat, so
          try it carefully.</dd>
        <dt>Category</dt>
        <dd>What an option does: Display, Performance, Audio, Network,
          Proton-Deck, Skip-Intro, or Debug-Dev. Some obscure flags stay
          Uncategorized.</dd>
        <dt>Engine</dt>
        <dd>The game's engine, shown on its page when we know it: the exact
          version where we have it (<em>id Tech 3</em>), otherwise the family
          (<em>id Tech</em>). When the engine is unknown we leave it off rather
          than guess.</dd>
        <dt>Source</dt>
        <dd>Where the option was found. When a stable link exists (say, ProtonDB),
          the source is clickable; otherwise it's shown as plain text.</dd>
        <dt>Added</dt>
        <dd>When the option entered the database.</dd>
        <dt>Last checked</dt>
        <dd>When it was last re-confirmed against its source (shown only when
          available).</dd>
      </dl>
    </section>
${HOW_TO_APPLY_HTML}
${movement('III', 'What we claim, and what we don\'t')}

    <section class="hiw-section" aria-labelledby="hiw-validation">
      <h2 id="hiw-validation">What "verified" means here (and what it doesn't)</h2>
      <p>We would rather under-promise than oversell, so here's the straight
      version:</p>
      <ul class="hiw-claims">
        <li>
          <h3>What we do</h3>
          <p>A save-gate turns away malformed or junk entries at the door, so
          what you see are real, well-formed commands from the sources above.</p>
        </li>
        <li>
          <h3>What we're building</h3>
          <p>A <strong>Last checked</strong> date that appears once an option has
          been re-confirmed against its source. Coverage grows over time. No date
          yet means it hasn't come up for review, not that it's broken.</p>
        </li>
        <li>
          <h3>What we don't claim</h3>
          <p>Options are <em>sourced</em>, not personally tested on every game.
          Community voting isn't live, so we don't dangle vote counts as a trust
          signal. Read an option's description before you paste it in.</p>
        </li>
      </ul>
    </section>

    <section class="hiw-section" aria-labelledby="hiw-null">
      <h2 id="hiw-null">When a field is blank on purpose</h2>
      <p>Now and then you'll open an option and find no description, just a
      source link. When the only text a source offered was wrong, circular
      (<em>"use the -nomovie flag"</em>), or a pasted list of <em>other</em>
      flags, we store nothing and show the link instead. The same goes for a
      game that lists no options at all: most games simply don't have any
      documented. <strong>A blank field is a decision, not a missing
      one.</strong></p>
    </section>

    <section class="hiw-section" aria-labelledby="hiw-contribute">
      <h2 id="hiw-contribute">Know one we're missing?</h2>
      <p>This catalog grows with the community. If you know a launch option that
      isn't here, <a href="${suggestIssueUrl()}" target="_blank" rel="noopener noreferrer">suggest
      it on GitHub</a> and we'll review it against the sources above.</p>
    </section>

    <section class="hiw-section hiw-ethos" aria-labelledby="hiw-ethos">
      <h2 id="hiw-ethos">Where it came from, and what it stands for</h2>
      <p>Launch options are scattered across wikis, Steam guides and decade-old
      forum threads, and finding the right flag for one game costs you a handful
      of tabs and a guess about whether any of it is still true. We went looking
      for a single searchable place that listed them and cited its sources,
      couldn't find one, and built it.</p>
      <p>What that means in practice is a short list of commitments. The catalog
      is free and needs no account. There are no ads and no analytics, the site
      sets no cookies, and the only thing it remembers is whether you picked the
      light or dark theme, which stays in your own browser. The crawler that
      gathers the data is published for anyone to read, every option names where
      it came from, and when we don't know something we leave it blank rather
      than fill it in with something that sounds right.</p>
      <p>This is a small project, maintained by hand. The goal isn't to be the
      biggest catalog; it's to be the fastest way to an option you can trust.</p>
    </section>

      </div>
    </div>

    <!-- Outside .hiw-layout on purpose: centred on the page shell, so these line
         up with the site footer below them instead of with the prose column. -->
    <p class="hiw-signoff">The rest is up to you. <span class="hiw-frog" aria-hidden="true">🐸</span></p>

    <p class="seo-footer-cta">
      <a href="/" class="seo-cta">Browse the full catalog of Steam launch options →</a>
    </p>
  </main>

${seoFooter({ current: 'how-it-works' })}
</body>
</html>`;
}


/**
 * GET /catalog — the option vocabulary as a graded bed.
 *
 * The page is a single idea: launch options are distributed by a violent power
 * law, and that is easier to feel than to state. Each layer is a reach tier;
 * the layer's depth is how many options live there and the type size is the
 * grain. Coarse rests on fine, which is what the distribution physically is.
 *
 * It is measured in OPTIONS, not links, and that is deliberate. Link totals
 * balloon whenever a documented engine flag is broadcast to newly identified
 * games, so link growth mostly reports how many engines we have identified —
 * never how much documentation arrived. The vocabulary is the honest unit, and
 * it is also the one that keeps this page legible as the catalogue grows: new
 * documentation thickens a layer, and an option that earns wider coverage moves
 * up through them.
 *
 * The markup below is complete on its own. The disturbance effect is added by
 * /catalog-grain.js afterwards and is never required to read the page.
 */
function renderCatalog(grain) {
  const canonical = `${SITE_URL}/catalog`;
  const pageTitle = 'The Bedrock: Every Launch Option We Publish — Vanilla Slops';
  const metaDesc = truncate(
    grain.options > 0
      ? `Every one of the ${grain.options} launch options we publish, sorted by how ` +
        'many games it reaches. A handful cover thousands; most cover exactly one.'
      : 'Every launch option we publish, sorted by how many games it reaches. ' +
        'A handful cover thousands; most cover exactly one.', 160
  );
  const css = getCssHref();

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Vanilla Slops', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'The Bedrock', item: canonical },
    ],
  };

  // Everything below the bed quotes live figures, so it is written once and
  // omitted whole when there is nothing to quote. Rendering it against an empty
  // result produced sentences like "0 of 0 options are used by a single game",
  // which is worse than saying nothing.
  const hasData = grain.tiers.length > 0 && grain.options > 0;
  const top = grain.tiers[0]?.options?.[0];
  const second = grain.tiers[0]?.options?.[1];

  const figures = hasData ? `
    <ul class="cat-figures">
      <li><b>${grain.options.toLocaleString()}</b><span>options published</span></li>
      <li><b>${grain.games.toLocaleString()}</b><span>games covered</span></li>
      <li><b>${grain.singletons.toLocaleString()}</b><span>used by one game</span></li>
    </ul>` : '';

  const bed = hasData ? `
    <h2 class="sr-only">The catalog by reach</h2>
    <div class="cat-bed" id="cat-bed">
      ${grain.tiers.map((t) => {
    const label = t.key === '1' ? '1 game' : `${t.key} games`;
    return `<section class="cat-layer" data-tier="${escapeHtml(t.key)}" aria-label="Options reaching ${escapeHtml(label)}">
        <h3 class="cat-layer-meta">
          <b>${t.options.length.toLocaleString()}</b>
          <span>${escapeHtml(label)}</span>
        </h3>
        <p class="cat-grain">${t.options.map((o) =>
      `<a class="cat-seed" href="/?optionSearch=${encodeURIComponent(o.command)}"
             title="${escapeHtml(o.command)}, used by ${o.reach.toLocaleString()} ${o.reach === 1 ? 'game' : 'games'}">${escapeHtml(o.command)}</a>`
    ).join('')}</p>
      </section>`;
  }).join('')}
    </div>` : `
    <p class="cat-unavailable">The catalog figures are briefly unavailable. Everything else on the site is unaffected. <a href="/">Search is right here</a>.</p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light dark" />
  <meta name="theme-color" media="(prefers-color-scheme: light)" content="#ffffff" />
  <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#161b24" />
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="${escapeHtml(metaDesc)}" />
  <link rel="canonical" href="${canonical}" />
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${escapeHtml(pageTitle)}" />
  <meta property="og:description" content="${escapeHtml(metaDesc)}" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:site_name" content="Vanilla Slops" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${escapeHtml(pageTitle)}" />
  <meta name="twitter:description" content="${escapeHtml(metaDesc)}" />
  <script type="application/ld+json">${jsonLdScript(breadcrumb)}</script>
  ${css ? `<link rel="stylesheet" href="${css}" />` : ''}
  <script src="/game-theme.js"></script>
  <link rel="icon" href="/favicon.ico" />
</head>
<body class="seo-page">
${seoHeader({ current: 'catalog' })}

  <main class="seo-main catalog-page">
    <nav class="seo-breadcrumb" aria-label="Breadcrumb">
      <a href="/">Home</a> <span aria-hidden="true">/</span> <span>The Bedrock</span>
    </nav>

    <h1 class="seo-title">The Bedrock</h1>
    <p class="seo-subtitle">
      Every launch option we publish, sorted by how many games it reaches.
      A handful cover thousands. Most cover exactly one.
    </p>
    ${figures}

    ${bed}

    ${hasData ? `<p class="cat-caption">
      Each layer is a reach tier. Its depth is how many options live there;
      the type size is the grain. Pick any command to search for it.
    </p>` : ''}

    ${hasData ? `<section class="cat-note">
      <h2>What you are looking at</h2>
      <p>
        ${top && second ? `<code>${escapeHtml(top.command)}</code> reaches
        ${top.reach.toLocaleString()} games and <code>${escapeHtml(second.command)}</code>
        reaches ${second.reach.toLocaleString()}. Neither is a setting belonging to any
        of them. They are Linux tools that wrap whatever you launch, which is why they
        apply almost everywhere.` : ''}
        Below that the ground drops away fast: ${grain.singletons.toLocaleString()} of
        ${grain.options.toLocaleString()} options are used by a single game. That bottom
        layer is the bedrock. Those are not failures. A flag that matters enormously
        to one game and to nothing else is exactly what a catalog like this is for.
      </p>

      <h2>What it deliberately does not say</h2>
      <p>
        Reach is not quality. The widest options are wide because they are engine-level
        or tool-level, not because they are the best thing to paste into a launch box.
        The flag that fixes your specific game is far more likely to be down in the
        fine material.
      </p>
      <p>
        This page counts <strong>options</strong>, never links. The number of
        game-to-option connections grows every time a documented engine flag is applied
        to newly identified games, so it mostly measures how many engines we have
        recognized.
      </p>

    </section>` : ''}

    <p class="seo-footer-cta">
      <a href="/" class="seo-cta">${hasData
    ? `Search all ${grain.games.toLocaleString()} games →`
    : 'Search all games →'}</a>
    </p>
  </main>
${seoFooter({ current: 'catalog' })}
  <script src="/catalog-grain.js" defer></script>
</body>
</html>`;
}

/**
 * GET /catalog — never fails on data. getCatalogGrain returns an empty result
 * rather than throwing, and the renderer degrades to an explanatory line.
 */
export async function catalogController(req, res) {
  const grain = await getCatalogGrain();
  // Same reasoning as howItWorksController: caching locally leaves the browser
  // holding HTML that points at a bundle hash a rebuild has already replaced.
  res.set('Cache-Control', process.env.NODE_ENV === 'production'
    ? 'public, max-age=1800, s-maxage=21600, stale-while-revalidate=86400'
    : 'no-store');
  res.type('html').send(renderCatalog(grain));
}

/**
 * GET /sitemap.xml — lists the homepage plus every game-with-options page.
 */
export async function sitemapController(req, res) {
  try {
    const games = await getGamesForSitemap();
    const urls = [
      `  <url><loc>${SITE_URL}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,
      `  <url><loc>${SITE_URL}/how-it-works</loc><changefreq>monthly</changefreq><priority>0.5</priority></url>`,
      `  <url><loc>${SITE_URL}/catalog</loc><changefreq>weekly</changefreq><priority>0.6</priority></url>`,
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
