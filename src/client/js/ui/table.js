import { fetchLaunchOptions } from '../api.js';
// The same slug the server computes and 301-redirects to, so an internal link
// is already canonical and a click costs no redirect hop. Imported rather than
// transcribed: this was a hand-copied duplicate until 2026-08-22, and while the
// two copies still matched, nothing anywhere checked that they did.
import { slugify } from '../../../shared/slugify.js';
import { MOBILE_BREAKPOINT } from '../constants.js';
import { CONFIG, TableState, getTableContainer, getOpenLaunchOptionsCount, escapeHtml, pasteableCommand } from './table-shared.js';
import {
  buffMobileTableView, buffMobileTouch, buffMobileOptions,
  isMobileDevice, getSafeAreaInsets, ensureTouchTarget, setupMobileEventListeners
} from './mobile-gestures.js';
import {
  renderEmptyState, renderBasicEmptyState,
  triggerClearSearch, triggerClearFilters
} from './empty-states.js';

window.addEventListener('resize', debounce(() => {
  TableState.isMobile = window.innerWidth <= MOBILE_BREAKPOINT;
}, 250));

// The Steam wordmark-less logo, used for the secondary link out to the store.
// It replaced a bare `↗`, which had two problems: it read as "goes somewhere"
// rather than "goes to Steam", so noticing it cost the reader a beat to resolve;
// and as a text glyph its presentation is platform-dependent (U+2197 carries an
// emoji variation sequence, so some stacks paint their own palette and ignore
// `color`). A recognisable mark lets someone who wants the store leave at a
// glance and everyone else filter it out without thinking — which is the point,
// since the game page is the primary destination here.
const STEAM_ICON_SVG =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">' +
  '<path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 1.409 1.5 1.009 2.455-.397.957-1.497 1.41-2.454 1.012H7.54zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.663 0 3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.253 0-2.265-1.014-2.265-2.265z"/>' +
  '</svg>';

// ============================================================================
// MAIN RENDER FUNCTIONS
// ============================================================================

export function renderTable(games, showLoading = false, tableOptions = {}) {
  const container = getTableContainer();
  if (!container) return;

  if (showLoading) {
    renderLoadingState(container);
    return;
  }

  if (!games || games.length === 0) {
    renderBasicEmptyState(container);
    return;
  }

  TableState.sortConfig = tableOptions;
  // Remember which option attributes are being filtered so expansions can
  // highlight and float the matching options (feedback #1 payoff).
  TableState.activeOptionFilter = {
    category: tableOptions.activeCategory || '',
    risk: tableOptions.activeRisk || '',
    command: tableOptions.activeCommand || ''
  };
  renderGamesTable(container, games);
  setupTableEventListeners();

  if (TableState.isMobile) {
    buffMobileTouch(container);
  }
}

export { renderEmptyState };

// ============================================================================
// TABLE RENDERING
// ============================================================================

const SORTABLE_COLUMNS = [
  { label: CONFIG.DATA_LABELS.title, field: 'title' },
  { label: CONFIG.DATA_LABELS.developer, field: 'developer' },
  { label: CONFIG.DATA_LABELS.publisher, field: null },
  { label: CONFIG.DATA_LABELS.releaseDate, field: 'release_date' }, // ISO YYYY-MM-DD sorts chronologically
  { label: CONFIG.DATA_LABELS.engine, field: null },
  { label: CONFIG.DATA_LABELS.launchOptions, field: 'options' },
];

function buildSortHeader({ label, field }) {
  const { sort, order } = TableState.sortConfig || {};
  const isActive = field && field === sort;
  const ariaSort = !field ? '' : isActive ? (order === 'asc' ? 'ascending' : 'descending') : 'none';
  const indicator = field
    ? `<span class="sort-indicator" aria-hidden="true">${isActive ? (order === 'asc' ? '▲' : '▼') : '⇅'}</span>`
    : '';
  const cls = [field ? 'sortable' : '', isActive ? 'sort-active' : ''].filter(Boolean).join(' ');
  const attrs = [
    'role="columnheader"',
    field ? `tabindex="0" data-sort="${field}" aria-sort="${ariaSort}"` : '',
    cls ? `class="${cls}"` : '',
  ].filter(Boolean).join(' ');
  return `<th ${attrs}>${label}${indicator}</th>`;
}

function renderGamesTable(container, games) {
  const table = document.createElement('table');
  table.className = `${CONFIG.CLASSES.gamesTable} ${CONFIG.CLASSES.mobileResponsive}`;
  table.setAttribute('role', 'table');
  table.setAttribute('aria-label', 'Games with launch options');

  table.innerHTML = `
    <thead>
      <tr role="row">
        ${SORTABLE_COLUMNS.map(buildSortHeader).join('')}
      </tr>
    </thead>
    <tbody>
      ${games.map(game => createGameRowHTML(game)).join('')}
    </tbody>
  `;

  container.innerHTML = '';
  container.appendChild(table);

  if (TableState.isMobile) buffMobileTableView(table);
}

function createGameRowHTML(game) {
  const gameId = game.app_id;
  // `display_options_count` is what the expansion will actually render;
  // `total_options_count` counts links to options the view hides, so a badge
  // built on it promises rows that never arrive. Falls back to the raw column
  // so an older cached payload still shows a number rather than a zero.
  const optionsCount = game.display_options_count ?? game.total_options_count ?? 0;
  const releaseDate = formatDate(game.release_date);
  const slug = slugify(game.title);
  const title = escapeHtml(game.title || 'Unknown');
  const developer = escapeHtml(game.developer || 'Unknown');
  const publisher = escapeHtml(game.publisher || 'Unknown');
  const engine = escapeHtml(game.engine || 'Unknown');

  return `
    <tr role="row" data-game-id="${gameId}" class="game-row">
      <td data-label="${CONFIG.DATA_LABELS.title}" role="gridcell" class="game-title-cell">
        <div class="game-title">
          <a href="/game/${gameId}/${slug}"
             class="game-page-link"
             title="${title} launch options"
          >${title}</a>
          <a href="https://store.steampowered.com/app/${gameId}"
             target="_blank"
             rel="noopener noreferrer"
             class="steam-link"
             title="View ${title} on Steam"
             aria-label="View ${title} on Steam store (opens in a new tab)"
          >${STEAM_ICON_SVG}</a>
        </div>
      </td>
      <td data-label="${CONFIG.DATA_LABELS.developer}" role="gridcell" class="game-developer-cell">
        <span title="${developer}">${developer}</span>
      </td>
      <td data-label="${CONFIG.DATA_LABELS.publisher}" role="gridcell" class="game-publisher-cell">
        <span title="${publisher}">${publisher}</span>
      </td>
      <td data-label="${CONFIG.DATA_LABELS.releaseDate}" role="gridcell" class="game-date-cell">
        <span title="${releaseDate}">${releaseDate}</span>
      </td>
      <td data-label="${CONFIG.DATA_LABELS.engine}" role="gridcell" class="game-engine-cell">
        <span title="${engine}">${engine}</span>
      </td>
      <td data-label="${CONFIG.DATA_LABELS.launchOptions}" role="gridcell" class="launch-options-cell">
        ${generateLaunchOptionsButton(gameId, title, optionsCount)}
      </td>
    </tr>
  `;
}

function generateLaunchOptionsButton(gameId, gameTitle, optionsCount) {
  if (optionsCount > 0) {
    return `
      <button
        class="launch-options-btn"
        data-game-id="${gameId}"
        aria-label="Show ${optionsCount} launch options for ${escapeHtml(gameTitle)}"
        aria-expanded="false"
        type="button"
        ${TableState.touchDevice ? 'ontouchstart=""' : ''}
      >
        <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 17 6-6-6-6"/><path d="M12 19h8"/></svg>
        <span class="btn-text">Options</span>
        <span class="options-count" aria-label="${optionsCount} options">${optionsCount}</span>
      </button>
    `;
  }
  return `
    <span class="no-options-text" aria-label="No known launch options for ${escapeHtml(gameTitle)} yet">
      <span class="no-options-icon" aria-hidden="true">—</span>
      <span class="no-options-label">No known options yet</span>
    </span>
  `;
}

// ============================================================================
// LOADING STATE
// ============================================================================

function renderLoadingState(container) {
  _renderSkeletonInto(container);
}

export function renderSkeletonTable(rowCount = 8) {
  const container = getTableContainer();
  if (!container) return;
  _renderSkeletonInto(container, rowCount);
}

function _renderSkeletonInto(container, rowCount = 8) {
  const { title, developer, publisher, releaseDate, engine, launchOptions } = CONFIG.DATA_LABELS;
  const cols = [title, developer, publisher, releaseDate, engine, launchOptions];

  const rows = Array.from({ length: rowCount }, () => `
    <tr class="skeleton-row" aria-hidden="true">
      ${cols.map(label => `<td data-label="${label}"><div class="skeleton-cell"></div></td>`).join('')}
    </tr>
  `).join('');

  container.innerHTML = `
    <table class="${CONFIG.CLASSES.gamesTable} ${CONFIG.CLASSES.mobileResponsive}"
           aria-busy="true" aria-label="Loading games">
      <thead>
        <tr role="row">
          <th>${title}</th>
          <th>${developer}</th>
          <th>${publisher}</th>
          <th>${releaseDate}</th>
          <th>${engine}</th>
          <th>${launchOptions}</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// ============================================================================
// LAUNCH OPTIONS
// ============================================================================

async function handleLaunchOptionsClick(e) {
  const button = e.target.closest(CONFIG.SELECTORS.launchOptionsBtn);
  if (!button) return;

  e.preventDefault();
  e.stopPropagation();

  if (TableState.touchDevice) {
    button.classList.add('touch-active');
    setTimeout(() => button.classList.remove('touch-active'), 150);
  }

  const gameId = button.dataset.gameId;
  if (!gameId) return;

  const originalContent = button.innerHTML;

  try {
    const existingRow = document.querySelector(`.${CONFIG.CLASSES.launchOptionsRow}[data-game-id="${gameId}"]`);
    if (existingRow && existingRow.classList.contains('is-open')) {
      closeLaunchOptions(gameId);
      return;
    }

    closeAllLaunchOptions();

    // Open the row now, with a placeholder, instead of after the round trip.
    // The wait used to be dead air followed by a whole section appearing at
    // once; the row is the acknowledgement that the click landed. The skeleton
    // inside it fades in on a delay (CSS), so a cache hit swaps straight to the
    // real content and the placeholder is never seen.
    button.classList.add('loading');
    button.setAttribute('aria-busy', 'true');
    showLaunchOptionsLoading(gameId);

    const launchOptions = await fetchLaunchOptions(gameId, true);
    displayLaunchOptions(gameId, launchOptions);
    setButtonHideState(button, originalContent);
    TableState.openLaunchOptionsRows.add(gameId);
    updateCloseAllButton();
  } catch (error) {
    showLaunchOptionsError(gameId, error.message);
    setButtonShowState(button, originalContent);
  } finally {
    button.classList.remove('loading');
    button.removeAttribute('aria-busy');
  }
}

/**
 * Insert the expansion row immediately, holding a placeholder, so the click has
 * a visible result before the data arrives. Replaced in place by
 * displayLaunchOptions — same row element, so there is one open animation
 * rather than two.
 *
 * @param {string} gameId - Steam app ID
 */
function showLaunchOptionsLoading(gameId) {
  const gameRow = document.querySelector(`tr[data-game-id="${gameId}"]`);
  if (!gameRow) return;

  const existingRow = document.querySelector(`.${CONFIG.CLASSES.launchOptionsRow}[data-game-id="${gameId}"]`);
  if (existingRow) existingRow.remove();

  const row = document.createElement('tr');
  row.className = `${CONFIG.CLASSES.launchOptionsRow} is-open is-loading ${TableState.isMobile ? 'mobile-options-row' : ''}`;
  row.dataset.gameId = gameId;

  const colspan = gameRow.children.length;
  // Three bars is a shape, not a count — we don't know how many options there
  // are yet, and guessing would make the layout jump when the truth arrives.
  row.innerHTML = `
    <td colspan="${colspan}" class="${CONFIG.CLASSES.launchOptionsCell}">
      <div class="lo-skeleton" role="status" aria-live="polite">
        <span class="sr-only">Loading launch options…</span>
        <div class="lo-skeleton-bar"></div>
        <div class="lo-skeleton-bar"></div>
        <div class="lo-skeleton-bar"></div>
      </div>
    </td>
  `;

  gameRow.parentNode.insertBefore(row, gameRow.nextSibling);
}

function displayLaunchOptions(gameId, launchOptions) {
  const gameRow = document.querySelector(`tr[data-game-id="${gameId}"]`);
  if (!gameRow) return;

  // Reuse the placeholder row the click already opened, so the content swaps
  // inside a row that is on screen rather than the row being torn out and
  // rebuilt — one open animation, and no visible collapse-then-expand.
  const existingRow = document.querySelector(`.${CONFIG.CLASSES.launchOptionsRow}[data-game-id="${gameId}"]`);
  const launchOptionsRow = existingRow || document.createElement('tr');
  // `is-open` is the marker for "this expansion is showing" (see
  // CONFIG.SELECTORS.launchOptionsRow). Deliberately NOT an inline display:
  // the mobile card layout sets every table element to `display: block`, and an
  // inline `table-row` outranks that media query — the row would then get its
  // own anonymous table box, which sizes to content and pushes ~20px past the
  // viewport, clipping the option cards' right border.
  launchOptionsRow.className = `${CONFIG.CLASSES.launchOptionsRow} is-open ${TableState.isMobile ? 'mobile-options-row' : ''}`;
  launchOptionsRow.dataset.gameId = gameId;

  const colspan = gameRow.children.length;
  const gameTitle = gameRow.querySelector('.game-page-link')?.textContent?.trim() || '';

  launchOptionsRow.innerHTML = launchOptions.length === 0
    ? createNoOptionsHTML(colspan, gameId, gameTitle)
    : createOptionsHTML(colspan, launchOptions, gameId);

  if (!existingRow) gameRow.parentNode.insertBefore(launchOptionsRow, gameRow.nextSibling);
  setupLaunchOptionsRowEvents(launchOptionsRow);
  setupOptionFilter(launchOptionsRow);

  if (TableState.isMobile) buffMobileOptions(launchOptionsRow);

  requestAnimationFrame(() => {
    // Row must be laid out before we can measure command widths.
    fitCommandText(launchOptionsRow);
    bindCommandFitResize();
  });
}

// Keep single-line command codes fitted as the viewport reflows. Scales the
// currently-open rows only; closed rows are refitted when they next open.
let commandFitResizeBound = false;
function bindCommandFitResize() {
  if (commandFitResizeBound) return;
  commandFitResizeBound = true;
  let raf = 0;
  window.addEventListener('resize', () => {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => fitCommandText(document));
  });
}

// One row = always. Reset to the CSS base size, then shrink the font just enough
// that the command fits its box on a single line. The full command lives in
// data-command (used for copy), so the ellipsis safety net never loses data.
function fitCommandText(scope) {
  const MIN_PX = 11;
  const codes = scope.querySelectorAll('.option-command code');
  codes.forEach((code) => {
    code.style.fontSize = '';
    if (!code.clientWidth) return;
    let size = parseFloat(getComputedStyle(code).fontSize) || 16;
    let guard = 16;
    while (code.scrollWidth > code.clientWidth + 1 && size > MIN_PX && guard-- > 0) {
      size -= 1;
      code.style.fontSize = `${size}px`;
    }
  });
}

// A game's expansion this size or larger gets an in-place filter input.
const OPTION_FILTER_THRESHOLD = 8;

// Wire the in-expansion filter input to show/hide options as the user types.
function setupOptionFilter(row) {
  const input = row.querySelector('.option-filter-input');
  if (!input) return;
  const items = [...row.querySelectorAll('.launch-option')];
  const counter = row.querySelector('.option-filter-count');
  const empty = row.querySelector('.option-filter-empty');

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    let visible = 0;
    items.forEach((li) => {
      const hay = li.dataset.search || li.textContent.toLowerCase();
      const show = !q || hay.includes(q);
      li.style.display = show ? '' : 'none';
      if (show) visible++;
    });
    if (counter) counter.textContent = q ? `${visible} of ${items.length} shown` : '';
    if (empty) empty.hidden = !(q && visible === 0);
  });
}

// True when a category/risk filter is active and this option satisfies all of
// it — i.e. it's (one of) the option(s) that made its game match the filter.
function optionMatchesActiveFilter(option) {
  const f = TableState.activeOptionFilter || {};
  if (!f.category && !f.risk && !f.command) return false;
  const riskOk = !f.risk || option.risk_level === f.risk;
  const catOk = !f.category || (Array.isArray(option.categories) && option.categories.includes(f.category));
  const cmd = (option.command || option.option || '').toLowerCase();
  const cmdOk = !f.command || cmd.includes(f.command.toLowerCase());
  return riskOk && catOk && cmdOk;
}

function createOptionsHTML(colspan, launchOptions, gameId) {
  const f = TableState.activeOptionFilter || {};
  const filterActive = Boolean(f.category || f.risk);

  // When a filter is active, float the matching options to the top so the user
  // immediately sees why this game matched. (Array sort is stable in modern JS.)
  const ordered = filterActive
    ? [...launchOptions].sort((a, b) =>
        (optionMatchesActiveFilter(b) ? 1 : 0) - (optionMatchesActiveFilter(a) ? 1 : 0))
    : launchOptions;

  const optionsHTML = ordered.map(option => createLaunchOptionHTML(option)).join('');
  const mobileClass = TableState.isMobile ? 'mobile-options-content' : '';

  // For long lists, offer an in-place filter so users can narrow to a command
  // without scrolling the whole set.
  const showFilter = launchOptions.length >= OPTION_FILTER_THRESHOLD;
  const filterHTML = showFilter ? `
      <div class="option-filter">
        <input type="search" class="option-filter-input"
               placeholder="Filter these ${launchOptions.length} options…"
               aria-label="Filter this game's launch options" />
        <span class="option-filter-count" role="status" aria-live="polite"></span>
      </div>` : '';

  return `
    <td colspan="${colspan}" class="${CONFIG.CLASSES.launchOptionsCell} ${mobileClass}" data-label="Launch Options Details">
      ${filterHTML}
      <ul class="launch-options-list ${TableState.isMobile ? 'mobile-options-list' : ''}">
        ${optionsHTML}
      </ul>
      <p class="option-filter-empty" hidden>No options match that filter.</p>
      <div class="launch-options-close-container ${TableState.isMobile ? 'mobile-close-container' : ''}">
        <button class="launch-options-close ${TableState.isMobile ? 'mobile-close-btn' : ''}" data-game-id="${gameId}">
          <span class="close-text">Hide Options</span>
        </button>
      </div>
    </td>
  `;
}

// Build a prefilled GitHub "new issue" URL so contributors can suggest an
// option without any write API on our side. Game context is filled in when known.
const REPO_URL = 'https://github.com/soundwanders/vanilla-slops';
function suggestOptionUrl(gameTitle, gameId) {
  const label = gameTitle || (gameId ? `game ${gameId}` : '');
  const title = label ? `Launch option suggestion: ${label}` : 'Launch option suggestion';
  const body = [
    `**Game:** ${gameTitle || '(name)'}${gameId ? ` (Steam App ID: ${gameId})` : ''}`,
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
  ].join('\n');
  const params = new URLSearchParams({ title, body, labels: 'option-suggestion' });
  return `${REPO_URL}/issues/new?${params.toString()}`;
}

function createNoOptionsHTML(colspan, gameId, gameTitle = '') {
  const mobileClass = TableState.isMobile ? 'mobile-no-options' : '';
  const btnClass = TableState.isMobile ? 'btn mobile-btn' : 'btn';

  return `
    <td colspan="${colspan}" class="${CONFIG.CLASSES.launchOptionsCell} ${mobileClass}" data-label="Launch Options Details">
      <div class="no-options ${mobileClass}">
        <div class="no-options-icon">🔍</div>
        <h4>No Launch Options Available</h4>
        <p>This game doesn't have any community-verified launch options yet.</p>
        <p>Know one that works? Help the next player out.</p>
        <a class="${btnClass} btn-secondary suggest-option-btn"
           href="${suggestOptionUrl(gameTitle, gameId)}"
           target="_blank" rel="noopener noreferrer">Suggest a launch option ↗</a>
      </div>
      <div class="launch-options-close-container ${TableState.isMobile ? 'mobile-close-container' : ''}">
        <button class="launch-options-close ${TableState.isMobile ? 'mobile-close-btn' : ''}" data-game-id="${gameId}">
          <span class="close-icon" aria-hidden="true">✕</span>
          <span class="close-text">Close</span>
        </button>
      </div>
    </td>
  `;
}

// Placeholder/non-answer descriptions the scraper leaves behind. Render the
// source link instead (honest fallback) rather than a description that isn't one.
const PLACEHOLDER_DESCRIPTIONS = new Set([
  'no description available',
  'launch option from pcgamingwiki'
]);
function cleanDescription(desc) {
  const d = (desc || '').trim();
  return PLACEHOLDER_DESCRIPTIONS.has(d.toLowerCase()) ? '' : d;
}

// Ties each option's disclosure button to the block it controls via aria-controls.
// A counter rather than option.id: the id only has to be unique within the
// document for the lifetime of the render, and this does not care what shape
// the row arrives in.
let _detailSeq = 0;

function createLaunchOptionHTML(option) {
  const detailId = `opt-detail-${++_detailSeq}`;
  // `verified` retired in favour of risk_level (consistent, computed) + community
  // votes as the future human signal — see the metadata trust model.
  const votesBadge = option.upvotes > 0 ? `<span class="option-votes">👍 ${option.upvotes}</span>` : '';
  const riskBadge = renderRiskBadge(option.risk_level);
  const categoryChips = renderCategoryChips(option.categories);
  const addedDate = formatAddedDate(option.created_at);
  const verifiedDate = formatAddedDate(option.last_verified_at);
  const command = option.command || option.option || '';
  const pasteable = pasteableCommand(option, command);
  const mobileClass = TableState.isMobile ? 'mobile-launch-option' : '';
  const isMatch = optionMatchesActiveFilter(option);
  const matchFlag = isMatch
    ? '<span class="option-match-flag" title="Matches your active filter">Matches filter</span>'
    : '';
  const description = cleanDescription(option.description);
  // A wrapper tool now shows its working form as the command itself, so the
  // Example row would just repeat it — drop the row rather than print it twice.
  const showExample = option.usage_example && option.usage_example !== pasteable;
  // Lowercased haystack for the in-expansion filter (command + description).
  // Keyed on the stored command, which since slop-scraper rev 15 is already
  // the working `gamemoderun %command%` form.
  const searchText = escapeHtml(`${command} ${description}`.toLowerCase().trim());

  return `
    <li class="${CONFIG.CLASSES.launchOption} ${mobileClass}${isMatch ? ' option-match' : ''}" data-search="${searchText}">
      <div class="${CONFIG.CLASSES.optionCommand} ${TableState.isMobile ? 'mobile-command' : ''}"
           data-command="${escapeHtml(pasteable)}"
           role="button"
           tabindex="0"
           aria-label="Copy launch option command: ${escapeHtml(pasteable)}"
           ${TableState.touchDevice ? 'ontouchstart=""' : ''}>
        <code>${escapeHtml(pasteable)}</code>
        <span class="copy-indicator" aria-hidden="true">
          <svg class="ci-icon ci-copy" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          <svg class="ci-icon ci-done" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
          <span class="copy-word">Copy</span>
        </span>
      </div>
      ${description ? `
        <div class="option-description ${TableState.isMobile ? 'mobile-description' : ''}">
          ${escapeHtml(description)}
        </div>
      ` : ''}
      <button class="option-detail-toggle"
              type="button"
              aria-expanded="false"
              aria-controls="${detailId}">
        <span class="odt-label">Details</span>
        <svg class="odt-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
      </button>
      <div class="option-detail" id="${detailId}">
        ${(option.effect || showExample) ? `
          <dl class="option-usage">
            ${option.effect ? `<div class="option-usage-row"><dt>Effect</dt><dd>${escapeHtml(option.effect)}</dd></div>` : ''}
            ${showExample ? `<div class="option-usage-row"><dt>Example</dt><dd><code>${escapeHtml(option.usage_example)}</code></dd></div>` : ''}
          </dl>
        ` : ''}
        ${categoryChips ? `<div class="option-cats">${categoryChips}</div>` : ''}
        <div class="option-meta ${TableState.isMobile ? 'mobile-meta' : ''}">
          <div class="option-provenance">
            ${renderSource(option)}
            ${addedDate ? `<span class="option-date">Added ${addedDate}</span>` : ''}
            ${verifiedDate ? `<span class="option-date option-verified" title="Last re-checked against its source">Last checked ${verifiedDate}</span>` : ''}
          </div>
          <div class="option-badges">${matchFlag}${riskBadge}${votesBadge}</div>
        </div>
      </div>
    </li>
  `;
}

// --- Metadata badges (slop-scraper columns) --------------------------------
// risk_level and categories are live and selected by fetchLaunchOptionsForGame.
// risk_level is set on every published row; categories is often absent or
// Uncategorized (36% — genuinely obscure game-specific flags), so both renderers
// stay defensive and emit nothing rather than an empty badge.
const RISK_LABELS = { safe: 'Safe', caution: 'Caution', experimental: 'Experimental' };

function renderRiskBadge(level) {
  const label = RISK_LABELS[level];
  return label ? `<span class="risk-badge risk-${level}">${label}</span>` : '';
}

function renderCategoryChips(categories) {
  if (!Array.isArray(categories) || categories.length === 0) return '';
  return categories
    .filter(c => c && c !== 'Uncategorized')
    .map(c => `<span class="cat-chip">${escapeHtml(c)}</span>`)
    .join('');
}

// Raw source values are sometimes slugs (e.g. "manual_curation"); present them
// readably while leaving already-clean names (PCGamingWiki, ProtonDB) untouched.
function humanizeSource(src) {
  const s = (src || 'Community').trim();
  if (s.includes('_')) {
    const spaced = s.replace(/_/g, ' ');
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
  }
  return s;
}

// Link-ready: renders a real link when the scraper provides source_url (see the
// slop-scraper handoff), otherwise a plain, honest provenance label — no fake
// "clickable" affordance.
function renderSource(option) {
  const label = escapeHtml(humanizeSource(option.source));
  if (option.source_url) {
    return `<a class="option-source" href="${escapeHtml(option.source_url)}" target="_blank" rel="noopener noreferrer" title="Source: ${label} (opens in a new tab)">${label}</a>`;
  }
  return `<span class="option-source" title="Where this launch option was sourced from">${label}</span>`;
}

// created_at is the date the scraper added the option to the database — a real
// per-batch signal, shown as an "Added" date so users can gauge freshness.
function formatAddedDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ============================================================================
// BUTTON STATE
// ============================================================================

function setButtonHideState(button, originalContent) {
  const content = originalContent || button.dataset.originalContent || button.innerHTML;
  button.innerHTML = content.replace(/Show Options/g, 'Hide Options')
                            .replace(/show-options/g, 'hide-options')
                            .replace(/Options/g, 'Hide');
  button.disabled = false;
  button.classList.remove('loading');
  button.classList.add('options-shown');
  button.setAttribute('aria-expanded', 'true');
  button.style.minWidth = '';
}

function setButtonShowState(button, originalContent = null) {
  const stored = originalContent || button.dataset.originalContent;
  if (stored) {
    button.innerHTML = stored;
  } else {
    button.innerHTML = button.innerHTML.replace(/Hide Options/g, 'Show Options')
                                       .replace(/hide-options/g, 'show-options')
                                       .replace(/Hide/g, 'Options');
  }
  button.disabled = false;
  button.classList.remove('loading', 'options-shown');
  button.setAttribute('aria-expanded', 'false');
  button.style.minWidth = '';
  delete button.dataset.originalContent;
}

// ============================================================================
// CLOSE ALL
// ============================================================================

function updateCloseAllButton() {
  const openCount = getOpenLaunchOptionsCount();
  if (openCount >= CONFIG.CLOSE_ALL_THRESHOLD) showCloseAllButton();
  else hideCloseAllButton();
}

function showCloseAllButton() {
  let closeAllBtn = document.getElementById('close-all-launch-options-btn');
  if (!closeAllBtn) {
    closeAllBtn = createCloseAllButton();
    document.body.appendChild(closeAllBtn);
  }
  closeAllBtn.style.display = 'flex';
  setTimeout(() => closeAllBtn.classList.add('visible'), 10);
}

function hideCloseAllButton() {
  const closeAllBtn = document.getElementById('close-all-launch-options-btn');
  if (closeAllBtn) {
    closeAllBtn.classList.remove('visible');
    setTimeout(() => { closeAllBtn.style.display = 'none'; }, CONFIG.ANIMATION_DELAY);
  }
}

function createCloseAllButton() {
  const btn = document.createElement('button');
  btn.id = 'close-all-launch-options-btn';
  btn.className = `${CONFIG.CLASSES.closeAllBtn} ${TableState.isMobile ? 'mobile-close-all' : ''}`;
  btn.innerHTML = TableState.isMobile
    ? `<span class="close-all-icon mobile-icon" aria-hidden="true">✕</span><span class="close-all-text mobile-text">Close All</span>`
    : `<span class="close-all-icon" aria-hidden="true">✕</span><span class="close-all-text">Close All Options</span>`;
  btn.setAttribute('aria-label', 'Close all open launch options');
  btn.setAttribute('title', 'Close all open launch options (Esc key)');
  if (TableState.isMobile) ensureTouchTarget(btn);
  return btn;
}

function handleCloseAllClick(e) {
  e.preventDefault();
  e.stopPropagation();

  const button = e.currentTarget;
  button.classList.add('clicked');

  if (TableState.touchDevice && 'vibrate' in navigator) navigator.vibrate(100);

  const closedCount = closeAllLaunchOptions();
  if (closedCount > 0) showCloseAllFeedback(closedCount);

  setTimeout(() => button.classList.remove('clicked'), 200);
}

function showCloseAllFeedback(count) {
  const feedback = document.createElement('div');
  feedback.className = `close-all-feedback ${TableState.isMobile ? 'mobile-feedback' : ''}`;
  feedback.textContent = `${count} option${count !== 1 ? 's' : ''} closed`;

  const closeBtn = document.getElementById('close-all-launch-options-btn');
  if (closeBtn) {
    const rect = closeBtn.getBoundingClientRect();
    feedback.style.position = 'fixed';
    if (TableState.isMobile) {
      feedback.style.top = `${rect.top - 50}px`;
      feedback.style.left = '50%';
      feedback.style.transform = 'translateX(-50%)';
    } else {
      feedback.style.right = `${window.innerWidth - rect.left + 10}px`;
      feedback.style.top = `${rect.top + rect.height / 2}px`;
      feedback.style.transform = 'translateY(-50%)';
    }
  }

  document.body.appendChild(feedback);
  setTimeout(() => feedback.classList.add('visible'), 10);
  setTimeout(() => {
    feedback.classList.remove('visible');
    setTimeout(() => feedback.remove(), CONFIG.ANIMATION_DELAY);
  }, CONFIG.FEEDBACK_DURATION);
}

// ============================================================================
// COPY FUNCTIONALITY
// ============================================================================

async function handleCommandClick(e) {
  e.preventDefault();
  e.stopPropagation();

  const element = e.currentTarget;
  const command = element.dataset.command;

  if (element.dataset.copying === 'true') return;
  if (!command) return;

  element.dataset.copying = 'true';

  if (TableState.touchDevice && 'vibrate' in navigator) navigator.vibrate(50);

  try {
    await navigator.clipboard.writeText(command);
    showCopySuccess(element);
  } catch (error) {
    showCopyError(element);
    attemptTextSelection(element);
  } finally {
    setTimeout(() => { element.dataset.copying = 'false'; }, 500);
  }
}

// The copy-indicator (icon + word) swaps via the .copied / .copy-failed class in CSS
function showCopySuccess(element) {
  element.classList.remove('copy-failed');
  element.classList.add('copied');
  const word = element.querySelector('.copy-word');
  if (word) {
    word.dataset.reset = word.dataset.reset || word.textContent;
    word.textContent = 'Copied';
    setTimeout(() => { word.textContent = word.dataset.reset; }, 1200);
  }
  setTimeout(() => element.classList.remove('copied'), 1200);
}

function showCopyError(element) {
  element.classList.remove('copied');
  element.classList.add('copy-failed');
  const word = element.querySelector('.copy-word');
  if (word) {
    word.dataset.reset = word.dataset.reset || word.textContent;
    word.textContent = 'Failed';
    setTimeout(() => { word.textContent = word.dataset.reset; }, 1200);
  }
  setTimeout(() => element.classList.remove('copy-failed'), 1200);
}

function attemptTextSelection(element) {
  try {
    const codeEl = element.querySelector('code') || element;
    const range = document.createRange();
    range.selectNodeContents(codeEl);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    if (TableState.isMobile) {
      const instruction = document.createElement('div');
      instruction.className = 'copy-instruction mobile-instruction';
      instruction.textContent = "Text selected — use your device's copy function";
      document.body.appendChild(instruction);
      setTimeout(() => instruction.remove(), 3000);
    }
  } catch (_) { /* clipboard access intentionally swallowed */ }
}

function cleanupLaunchOptionsEvents(container) {
  container.querySelectorAll(`.${CONFIG.CLASSES.optionCommand}`).forEach(el => {
    if (el._clickHandler) el.removeEventListener('click', el._clickHandler);
    if (el._keydownHandler) el.removeEventListener('keydown', el._keydownHandler);
    if (el._touchStartHandler) el.removeEventListener('touchstart', el._touchStartHandler);
    if (el._touchEndHandler) el.removeEventListener('touchend', el._touchEndHandler);
    delete el.dataset.eventsSetup;
    delete el.dataset.copying;
    delete el._clickHandler;
    delete el._keydownHandler;
    delete el._touchStartHandler;
    delete el._touchEndHandler;
  });
}

// ============================================================================
// CLOSE FUNCTIONS
// ============================================================================

function closeLaunchOptions(gameId) {
  const row = document.querySelector(`.${CONFIG.CLASSES.launchOptionsRow}[data-game-id="${gameId}"]`);
  const button = document.querySelector(`.launch-options-btn[data-game-id="${gameId}"]`);

  if (row) {
    row.classList.remove('is-open');
    row.style.display = 'none';
    setTimeout(() => row.remove(), CONFIG.ANIMATION_DELAY);
  }
  if (button) setButtonShowState(button);

  TableState.openLaunchOptionsRows.delete(gameId);
  updateCloseAllButton();
}

export function closeAllLaunchOptions() {
  const openRows = document.querySelectorAll(CONFIG.SELECTORS.launchOptionsRow);
  let closedCount = 0;

  openRows.forEach(row => {
    const gameId = row.dataset.gameId;
    if (gameId && row.classList.contains('is-open')) {
      closeLaunchOptions(gameId);
      closedCount++;
    }
  });

  TableState.openLaunchOptionsRows.clear();
  updateCloseAllButton();
  return closedCount;
}

function showLaunchOptionsError(gameId, errorMessage) {
  const gameRow = document.querySelector(`tr[data-game-id="${gameId}"]`);
  if (!gameRow) return;

  const existingRow = document.querySelector(`.${CONFIG.CLASSES.launchOptionsRow}[data-game-id="${gameId}"]`);
  if (existingRow) existingRow.remove();

  const launchOptionsRow = document.createElement('tr');
  launchOptionsRow.className = `${CONFIG.CLASSES.launchOptionsRow} is-open ${TableState.isMobile ? 'mobile-error-row' : ''}`;
  launchOptionsRow.dataset.gameId = gameId;

  const colspan = gameRow.children.length;
  const mobileClass = TableState.isMobile ? 'mobile-error' : '';

  launchOptionsRow.innerHTML = `
    <td colspan="${colspan}" class="${CONFIG.CLASSES.launchOptionsCell} ${mobileClass}" data-label="Launch Options Error">
      <div class="error ${mobileClass}">
        <div class="error-icon">❌</div>
        <h3>Error Loading Launch Options</h3>
        <p>Failed to load launch options: ${escapeHtml(errorMessage)}</p>
        <div class="launch-options-close-container ${TableState.isMobile ? 'mobile-close-container' : ''}">
          <button class="launch-options-close ${TableState.isMobile ? 'mobile-close-btn' : ''}" data-game-id="${gameId}">
            <span class="close-icon" aria-hidden="true"></span>
            <span class="close-text">Close</span>
          </button>
        </div>
      </div>
    </td>
  `;

  gameRow.parentNode.insertBefore(launchOptionsRow, gameRow.nextSibling);
  setupLaunchOptionsRowEvents(launchOptionsRow);

  if (TableState.isMobile) {
    const errorButton = launchOptionsRow.querySelector('.launch-options-close');
    if (errorButton) ensureTouchTarget(errorButton);
  }
}

// ============================================================================
// EVENT SETUP
// ============================================================================

function _handleCloseAllDelegated(e) {
  if (e.target.closest('#close-all-launch-options-btn')) handleCloseAllClick(e);
}

function _handleEscapeKey(e) {
  if (e.key === 'Escape' && getOpenLaunchOptionsCount() > 0) {
    e.preventDefault();
    closeAllLaunchOptions();
  }
}

function handleSortHeaderInteraction(e) {
  const th = e.target.closest('th[data-sort]');
  if (!th) return;
  const field = th.dataset.sort;
  const { sort, order, onSortChange } = TableState.sortConfig || {};
  if (!onSortChange) return;
  const newOrder = field === sort ? (order === 'asc' ? 'desc' : 'asc') : 'asc';
  onSortChange(field, newOrder);
}

// Games whose options we've already asked for. Prefetch is best-effort: a
// failure here must never surface, because the click path will request the same
// data again and owns the error reporting.
const _prefetchedGameIds = new Set();

function prefetchLaunchOptionsFromEvent(e) {
  const button = e.target.closest?.('.launch-options-btn');
  if (!button) return;
  const gameId = button.dataset.gameId;
  if (!gameId || _prefetchedGameIds.has(gameId)) return;
  _prefetchedGameIds.add(gameId);
  fetchLaunchOptions(gameId, true).catch(() => {
    // Let the click retry from scratch rather than caching a failure
    _prefetchedGameIds.delete(gameId);
  });
}

/**
 * Per-option "Details" disclosure. Only ever visible on the mobile card — CSS
 * hides the button and keeps `.option-detail` open at desktop widths, so the
 * desktop layout is byte-for-byte what it was and this handler simply never
 * fires there. Doing the collapse in CSS rather than at render time means a
 * rotation or a resize is handled by the media query, with no re-render.
 */
function handleOptionDetailToggle(e) {
  const btn = e.target.closest('.option-detail-toggle');
  if (!btn) return;
  const item = btn.closest(`.${CONFIG.CLASSES.launchOption}`);
  if (!item) return;
  const open = item.classList.toggle('detail-open');
  btn.setAttribute('aria-expanded', String(open));
  const label = btn.querySelector('.odt-label');
  if (label) label.textContent = open ? 'Less' : 'Details';
}

function setupTableEventListeners() {
  if (TableState.isInitialized) return;

  document.addEventListener('click', handleLaunchOptionsClick);
  document.addEventListener('click', _handleCloseAllDelegated);
  document.addEventListener('click', handleSortHeaderInteraction);
  document.addEventListener('click', handleOptionDetailToggle);

  // Warm the cache before the click. The options for a game are ~130ms away and
  // never change mid-session, so starting the fetch on intent — pointer over the
  // button, or a finger landing on it — usually means the data is already in the
  // LRU by the time the click resolves, and the row opens with no wait at all.
  // `mouseover` rather than `mouseenter` because only the former bubbles to a
  // delegated listener; the id guard makes repeats free.
  document.addEventListener('mouseover', prefetchLaunchOptionsFromEvent);
  document.addEventListener('touchstart', prefetchLaunchOptionsFromEvent, { passive: true });
  document.addEventListener('focusin', prefetchLaunchOptionsFromEvent);
  document.addEventListener('keydown', _handleEscapeKey);
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('th[data-sort]')) {
      e.preventDefault();
      handleSortHeaderInteraction(e);
    }
  });

  if (TableState.isMobile) setupMobileEventListeners(getTableContainer);

  TableState.isInitialized = true;
}

function setupLaunchOptionsRowEvents(container) {
  cleanupLaunchOptionsEvents(container);

  container.querySelectorAll(`.${CONFIG.CLASSES.optionCommand}`).forEach(element => {
    const clickHandler = (e) => handleCommandClick(e);
    const keydownHandler = (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && !TableState.touchDevice) {
        e.preventDefault();
        handleCommandClick(e);
      }
    };

    element._clickHandler = clickHandler;
    element._keydownHandler = keydownHandler;

    element.addEventListener('click', clickHandler);
    element.tabIndex = 0;
    element.addEventListener('keydown', keydownHandler);

    if (TableState.touchDevice) {
      const touchStartHandler = () => element.classList.add('touch-active');
      const touchEndHandler = () => element.classList.remove('touch-active');
      element._touchStartHandler = touchStartHandler;
      element._touchEndHandler = touchEndHandler;
      element.addEventListener('touchstart', touchStartHandler, { passive: true });
      element.addEventListener('touchend', touchEndHandler, { passive: true });
    }

    element.dataset.eventsSetup = 'true';
  });

  const closeButton = container.querySelector('.launch-options-close');
  if (closeButton) {
    if (closeButton._clickHandler) closeButton.removeEventListener('click', closeButton._clickHandler);

    const closeClickHandler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const gameId = closeButton.dataset.gameId;
      if (gameId) closeLaunchOptions(gameId);
    };

    closeButton._clickHandler = closeClickHandler;
    closeButton.addEventListener('click', closeClickHandler);
    if (TableState.isMobile) ensureTouchTarget(closeButton);
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function formatDate(dateString) {
  if (!dateString) return 'Unknown';
  try {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch (_) {
    return 'Unknown';
  }
}

export function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

// ============================================================================
// INITIALIZATION
// ============================================================================

function initializeTable() {
  TableState.isMobile = isMobileDevice();
  TableState.touchDevice = 'ontouchstart' in window;

  if (!document.querySelector('style[data-table-styles]')) {
    const style = document.createElement('style');
    style.setAttribute('data-table-styles', 'true');
    style.textContent = `
      @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      .mobile-spinner { width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-top: 2px solid white; border-radius: 50%; animation: spin 1s linear infinite; margin-right: 8px; }
      .touch-active { opacity: 0.7; transform: scale(0.95); }
      .mobile-instruction { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: var(--color-surface-raised); color: var(--color-text-primary); padding: 12px 20px; border-radius: 8px; font-size: 14px; z-index: var(--z-popover); box-shadow: var(--shadow-lg); }
    `;
    document.head.appendChild(style);
  }

  document.body.classList.toggle('mobile-device', TableState.isMobile);
  document.body.classList.toggle('touch-device', TableState.touchDevice);

  setupTableEventListeners();
}

initializeTable();

// ============================================================================
// PUBLIC API
// ============================================================================

export {
  isMobileDevice,
  getSafeAreaInsets,
  escapeHtml,
  formatDate,
  triggerClearSearch,
  triggerClearFilters,
  TableState
};
