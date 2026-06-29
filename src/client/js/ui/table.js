import { fetchLaunchOptions } from '../api.js';
import { MOBILE_BREAKPOINT } from '../constants.js';
import { CONFIG, TableState, getTableContainer, getOpenLaunchOptionsCount, escapeHtml } from './table-shared.js';
import {
  buffMobileTableView, buffMobileTouch, buffMobileOptions,
  isMobileDevice, getSafeAreaInsets, ensureTouchTarget, setupMobileEventListeners
} from './mobile-gestures.js';
import {
  renderEmptyState, renderBasicEmptyState,
  triggerShowAllGames, triggerClearSearch, triggerClearFilters
} from './empty-states.js';

window.addEventListener('resize', debounce(() => {
  TableState.isMobile = window.innerWidth <= MOBILE_BREAKPOINT;
}, 250));

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
  { label: CONFIG.DATA_LABELS.releaseDate, field: null }, // text column, not sortable until migrated to date type
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
  const optionsCount = game.total_options_count || 0;
  const releaseDate = formatDate(game.release_date);
  const title = escapeHtml(game.title || 'Unknown');
  const developer = escapeHtml(game.developer || 'Unknown');
  const publisher = escapeHtml(game.publisher || 'Unknown');
  const engine = escapeHtml(game.engine || 'Unknown');

  return `
    <tr role="row" data-game-id="${gameId}" class="game-row">
      <td data-label="${CONFIG.DATA_LABELS.title}" role="gridcell" class="game-title-cell">
        <div class="game-title">
          <a href="https://store.steampowered.com/app/${gameId}"
             target="_blank"
             rel="noopener noreferrer"
             class="steam-link"
             title="View on Steam store"
          >${title}<span class="steam-external-icon" aria-hidden="true">↗</span></a>
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
        <span class="btn-text">Options</span>
        <span class="options-count" aria-label="${optionsCount} options">${optionsCount}</span>
      </button>
    `;
  }
  return `
    <span class="no-options-text" aria-label="No launch options available">
      <span class="no-options-icon" aria-hidden="true">—</span>
      <span class="no-options-label">No Options</span>
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
    if (existingRow && existingRow.style.display !== 'none') {
      closeLaunchOptions(gameId);
      return;
    }

    closeAllLaunchOptions();

    const launchOptions = await fetchLaunchOptions(gameId, true);
    displayLaunchOptions(gameId, launchOptions);
    setButtonHideState(button, originalContent);
    TableState.openLaunchOptionsRows.add(gameId);
    updateCloseAllButton();
  } catch (error) {
    showLaunchOptionsError(gameId, error.message);
    setButtonShowState(button, originalContent);
  }
}

function displayLaunchOptions(gameId, launchOptions) {
  const gameRow = document.querySelector(`tr[data-game-id="${gameId}"]`);
  if (!gameRow) return;

  const existingRow = document.querySelector(`.${CONFIG.CLASSES.launchOptionsRow}[data-game-id="${gameId}"]`);
  if (existingRow) existingRow.remove();

  const launchOptionsRow = document.createElement('tr');
  launchOptionsRow.className = `${CONFIG.CLASSES.launchOptionsRow} ${TableState.isMobile ? 'mobile-options-row' : ''}`;
  launchOptionsRow.dataset.gameId = gameId;

  const colspan = gameRow.children.length;

  launchOptionsRow.innerHTML = launchOptions.length === 0
    ? createNoOptionsHTML(colspan, gameId)
    : createOptionsHTML(colspan, launchOptions, gameId);

  gameRow.parentNode.insertBefore(launchOptionsRow, gameRow.nextSibling);
  setupLaunchOptionsRowEvents(launchOptionsRow);

  if (TableState.isMobile) buffMobileOptions(launchOptionsRow, closeLaunchOptions);

  requestAnimationFrame(() => { launchOptionsRow.style.display = 'table-row'; });
}

function createOptionsHTML(colspan, launchOptions, gameId) {
  const optionsHTML = launchOptions.map(option => createLaunchOptionHTML(option)).join('');
  const mobileClass = TableState.isMobile ? 'mobile-options-content' : '';

  return `
    <td colspan="${colspan}" class="${CONFIG.CLASSES.launchOptionsCell} ${mobileClass}" data-label="Launch Options Details">
      <ul class="launch-options-list ${TableState.isMobile ? 'mobile-options-list' : ''}">
        ${optionsHTML}
      </ul>
      <div class="launch-options-close-container ${TableState.isMobile ? 'mobile-close-container' : ''}">
        <button class="launch-options-close ${TableState.isMobile ? 'mobile-close-btn' : ''}" data-game-id="${gameId}">
          <span class="close-text">Hide Options</span>
        </button>
      </div>
    </td>
  `;
}

function createNoOptionsHTML(colspan, gameId) {
  const mobileClass = TableState.isMobile ? 'mobile-no-options' : '';

  return `
    <td colspan="${colspan}" class="${CONFIG.CLASSES.launchOptionsCell} ${mobileClass}" data-label="Launch Options Details">
      <div class="no-options ${mobileClass}">
        <div class="no-options-icon">🔍</div>
        <h4>No Launch Options Available</h4>
        <p>This game doesn't have any community-verified launch options yet.</p>
        <p>Consider contributing if you know of effective launch options!</p>
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

function createLaunchOptionHTML(option) {
  const verifiedBadge = option.verified ? '<span class="option-verified">✅ Verified</span>' : '';
  const votesBadge = option.upvotes > 0 ? `<span class="option-votes">👍 ${option.upvotes}</span>` : '';
  const command = option.command || option.option || '';
  const mobileClass = TableState.isMobile ? 'mobile-launch-option' : '';

  return `
    <li class="${CONFIG.CLASSES.launchOption} ${mobileClass}">
      <div class="${CONFIG.CLASSES.optionCommand} ${TableState.isMobile ? 'mobile-command' : ''}"
           data-command="${escapeHtml(command)}"
           role="button"
           tabindex="0"
           aria-label="Copy launch option command: ${escapeHtml(command)}"
           ${TableState.touchDevice ? 'ontouchstart=""' : ''}>
        <code>${escapeHtml(command)}</code>
        ${TableState.isMobile ? '<span class="copy-hint">Tap to copy</span>' : ''}
      </div>
      ${option.description ? `
        <div class="option-description ${TableState.isMobile ? 'mobile-description' : ''}">
          ${escapeHtml(option.description)}
        </div>
      ` : ''}
      <div class="option-meta ${TableState.isMobile ? 'mobile-meta' : ''}">
        <span class="option-source">${escapeHtml(option.source || 'Community')}</span>
        <div class="option-badges">${verifiedBadge}${votesBadge}</div>
      </div>
    </li>
  `;
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

function showCopySuccess(element) {
  element.classList.remove('copy-failed');
  element.classList.add('copied');
  if (TableState.isMobile) {
    const hint = element.querySelector('.copy-hint');
    if (hint) {
      hint.textContent = 'Copied!';
      setTimeout(() => { hint.textContent = 'Tap to copy'; }, 1000);
    }
  }
  setTimeout(() => element.classList.remove('copied'), 1000);
}

function showCopyError(element) {
  element.classList.remove('copied');
  element.classList.add('copy-failed');
  if (TableState.isMobile) {
    const hint = element.querySelector('.copy-hint');
    if (hint) {
      hint.textContent = 'Copy failed';
      setTimeout(() => { hint.textContent = 'Tap to copy'; }, 1000);
    }
  }
  setTimeout(() => element.classList.remove('copy-failed'), 1000);
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
    if (gameId && row.style.display !== 'none') {
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
  launchOptionsRow.className = `${CONFIG.CLASSES.launchOptionsRow} ${TableState.isMobile ? 'mobile-error-row' : ''}`;
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

  launchOptionsRow.style.display = 'table-row';
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

function setupTableEventListeners() {
  if (TableState.isInitialized) return;

  document.addEventListener('click', handleLaunchOptionsClick);
  document.addEventListener('click', _handleCloseAllDelegated);
  document.addEventListener('click', handleSortHeaderInteraction);
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
  triggerShowAllGames,
  triggerClearSearch,
  triggerClearFilters,
  TableState
};
