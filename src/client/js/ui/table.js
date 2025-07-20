/**
 * @fileoverview Table.js
 * Handles games table display, launch options, and empty states
 * Includes intelligent empty states based on search context and strategy
 * @module Table
 * @requires api.js
 * @requires styles/animations.css
 * @requires styles/table.css
 * @requires utils.js
 * @requires constants.js
 */

import { fetchLaunchOptions } from '../api.js';

// ============================================================================
// CONSTANTS & CONFIGURATION
// ============================================================================

const CONFIG = {
  CLOSE_ALL_THRESHOLD: 2,
  ANIMATION_DELAY: 300,
  FEEDBACK_DURATION: 2000,
  SELECTORS: {
    tableContainer: '#table-container',
    launchOptionsRow: '.launch-options-row[style*="table-row"]',
    launchOptionsBtn: '.launch-options-btn',
    closeAllBtn: '#close-all-launch-options-btn'
  },
  CLASSES: {
    gamesTable: 'games-table',
    launchOptionsRow: 'launch-options-row',
    launchOptionsCell: 'launch-options-cell',
    launchOption: 'launch-option',
    optionCommand: 'option-command',
    closeAllBtn: 'close-all-btn',
    emptyTableState: 'empty-table-state'
  }
};

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

const TableState = {
  openLaunchOptionsRows: new Set(),
  currentStats: { withOptions: 0, withoutOptions: 0, total: 0 },
  currentFilters: {},
  isInitialized: false
};

// ============================================================================
// MAIN RENDER FUNCTIONS
// ============================================================================

/**
 * Main table render function - entry point for all table rendering
 * @param {Array} games - Array of game objects
 * @param {boolean} showLoading - Whether to show loading state
 */
export function renderTable(games, showLoading = false) {
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

  renderGamesTable(container, games);
  setupTableEventListeners();
}

/**
 * Render empty state with Options-First context
 * @param {Object} filters - Current filter state
 * @param {Object} stats - Game statistics
 */
export function renderEmptyState(filters = {}, stats = {}) {
  const container = getTableContainer();
  if (!container) return;

  TableState.currentStats = stats;
  TableState.currentFilters = filters;

  const emptyStateType = determineEmptyStateType(filters, stats);
  const emptyStateHTML = createEmptyStateHTML(emptyStateType, filters, stats);
  
  container.innerHTML = emptyStateHTML;
  setupEmptyStateEventListeners();
  
  console.log('Empty state rendered:', emptyStateType);
}

// ============================================================================
// TABLE RENDERING
// ============================================================================

/**
 * Render the actual games table
 */
function renderGamesTable(container, games) {
  const table = document.createElement('table');
  table.className = CONFIG.CLASSES.gamesTable;
  
  table.innerHTML = `
    <thead>
      <tr>
        <th>Game Title</th>
        <th>Developer</th>
        <th>Publisher</th>
        <th>Release Date</th>
        <th>Engine</th>
        <th>Launch Options</th>
      </tr>
    </thead>
    <tbody>
      ${games.map(game => createGameRowHTML(game)).join('')}
    </tbody>
  `;

  container.innerHTML = '';
  container.appendChild(table);
  
  console.log(`✅ Table rendered with ${games.length} games`);
}

/**
 * Create HTML for a single game row
 */
function createGameRowHTML(game) {
  const gameId = game.app_id;
  const optionsCount = game.total_options_count || 0;
  const releaseDate = formatDate(game.release_date);

  return `
    <tr data-game-id="${gameId}">
      <td data-label="Title">
        <div class="game-title">${escapeHtml(game.title || 'Unknown')}</div>
      </td>
      <td data-label="Developer">${escapeHtml(game.developer || 'Unknown')}</td>
      <td data-label="Publisher">${escapeHtml(game.publisher || 'Unknown')}</td>
      <td data-label="Release Date">${releaseDate}</td>
      <td data-label="Engine">${escapeHtml(game.engine || 'Unknown')}</td>
      <td data-label="Launch Options">
        <button 
          class="launch-options-btn" 
          data-game-id="${gameId}"
          aria-expanded="false"
          type="button"
        >
          Show Options
          ${optionsCount > 0 ? `<span class="options-count">${optionsCount}</span>` : ''}
        </button>
      </td>
    </tr>
  `;
}

// ============================================================================
// LOADING & BASIC EMPTY STATES
// ============================================================================

/**
 * Render loading state
 */
function renderLoadingState(container) {
  container.innerHTML = `
    <div class="table-loading">
      <div class="loading-spinner"></div>
      <span>Loading games...</span>
    </div>
  `;
}

/**
 * Render basic empty state (fallback)
 */
function renderBasicEmptyState(container) {
  container.innerHTML = `
    <div class="no-results">
      <h3>🎮 No games found</h3>
      <p>Try adjusting your search criteria or filters.</p>
    </div>
  `;
}

// ============================================================================
// EMPTY STATES (OPTIONS-FIRST)
// ============================================================================

/**
 * Determine what type of empty state to show
 */
function determineEmptyStateType(filters, stats) {
  const hasSearch = filters.search && filters.search.trim();
  const hasFilters = Object.entries(filters).some(([key, val]) => 
    key !== 'showAll' && key !== 'hasOptions' && val && val.toString().trim()
  );
  
  if (stats.total === 0) return 'database-empty';
  if (hasSearch && stats.total === 0) return 'search-no-results';
  if (!filters.showAll && stats.withOptions === 0) {
    return hasSearch || hasFilters ? 'search-no-results' : 'no-options-found';
  }
  if (hasFilters) return 'all-games-filtered';
  return 'default';
}

/**
 * Create HTML for different empty state types
 */
function createEmptyStateHTML(type, filters, stats) {
  const emptyStates = {
    'no-options-found': () => createNoOptionsFoundHTML(stats),
    'search-no-results': () => createSearchNoResultsHTML(filters, stats),
    'all-games-filtered': () => createAllFilteredHTML(filters, stats),
    'database-empty': () => createDatabaseEmptyHTML(),
    'default': () => createDefaultEmptyHTML(stats)
  };
  
  const createHTML = emptyStates[type] || emptyStates.default;
  return `<div class="${CONFIG.CLASSES.emptyTableState} ${type}">${createHTML()}</div>`;
}

/**
 * No options found state
 */
function createNoOptionsFoundHTML(stats) {
  const suggestions = ['Counter-Strike', 'Half-Life', 'Portal', 'Cyberpunk', 'Witcher', 'GTA'];
  
  return `
    <div class="empty-icon">🎮</div>
    <h3 class="empty-title">Looking for games with launch options?</h3>
    <p class="empty-description">
      We're showing games that have community-verified launch options for the best experience.
    </p>
    
    <div class="empty-stats">
      <div class="stat-card">
        <span class="stat-number">${stats.withOptions || 0}</span>
        <span class="stat-label">Games with options</span>
      </div>
      <div class="stat-card muted">
        <span class="stat-number">${stats.withoutOptions || 0}</span>
        <span class="stat-label">Games without options</span>
      </div>
    </div>
    
    <div class="empty-suggestions">
      <h4>Try searching for popular games:</h4>
      <div class="suggestion-chips">
        ${suggestions.map(search => 
          `<button class="suggestion-chip" data-search="${search}">${search}</button>`
        ).join('')}
      </div>
    </div>
    
    <div class="empty-actions">
      <button class="btn btn-primary" data-action="show-all">
        Show all ${stats.total || 0} games
      </button>
      <button class="btn btn-secondary" data-action="learn-more">
        Learn about launch options
      </button>
    </div>
  `;
}

/**
 * Search no results state
 */
function createSearchNoResultsHTML(filters, stats) {
  const searchTerm = filters.search || '';
  
  return `
    <div class="empty-icon">🔍</div>
    <h3 class="empty-title">No results found${searchTerm ? ` for "${searchTerm}"` : ''}</h3>
    <p class="empty-description">
      ${filters.showAll 
        ? 'No games match your search criteria.' 
        : 'No games with launch options match your search criteria.'
      }
    </p>
    
    ${!filters.showAll && stats.withoutOptions > 0 ? `
      <div class="empty-suggestion">
        <p>💡 Try <button class="inline-btn" data-action="show-all">showing all games</button> 
        to see ${stats.withoutOptions} more results without launch options.</p>
      </div>
    ` : ''}
    
    <div class="empty-actions">
      <button class="btn btn-secondary" data-action="clear-search">Clear search</button>
      <button class="btn btn-secondary" data-action="clear-filters">Clear all filters</button>
    </div>
    
    <div class="search-tips">
      <h4>Search tips:</h4>
      <ul>
        <li>Try different keywords or shorter terms</li>
        <li>Check for typos in game names</li>
        <li>Search by developer (e.g., "Valve", "id Software")</li>
        <li>Use partial game titles (e.g., "Half" for Half-Life)</li>
      </ul>
    </div>
  `;
}

/**
 * All games filtered state
 */
function createAllFilteredHTML(filters, stats) {
  const activeFilters = getActiveFiltersDescription(filters);
  
  return `
    <div class="empty-icon">🎛️</div>
    <h3 class="empty-title">No games match your filters</h3>
    <p class="empty-description">
      Your current filters are too restrictive. Try adjusting them to see more results.
    </p>
    
    <div class="active-filters-summary">
      <h4>Active filters:</h4>
      <div class="filter-summary">${activeFilters}</div>
    </div>
    
    <div class="empty-actions">
      <button class="btn btn-primary" data-action="clear-filters">Clear all filters</button>
      ${!filters.showAll ? `
        <button class="btn btn-secondary" data-action="show-all">Show all games</button>
      ` : ''}
    </div>
  `;
}

/**
 * Database empty state
 */
function createDatabaseEmptyHTML() {
  return `
    <div class="empty-icon">🗄️</div>
    <h3 class="empty-title">No games in database</h3>
    <p class="empty-description">
      The game database appears to be empty. This might be a temporary issue.
    </p>
    <div class="empty-actions">
      <button class="btn btn-primary" onclick="location.reload()">Refresh page</button>
    </div>
  `;
}

/**
 * Default empty state
 */
function createDefaultEmptyHTML(stats) {
  return `
    <div class="empty-icon">🎮</div>
    <h3 class="empty-title">Ready to find games?</h3>
    <p class="empty-description">
      Search through ${stats.total || 0} games to find the perfect launch options.
    </p>
    <div class="empty-stats">
      <div class="stat-card">
        <span class="stat-number">${stats.withOptions || 0}</span>
        <span class="stat-label">Games with launch options</span>
      </div>
      <div class="stat-card">
        <span class="stat-number">${stats.percentageWithOptions || 0}%</span>
        <span class="stat-label">Have launch options</span>
      </div>
    </div>
  `;
}

// ============================================================================
// LAUNCH OPTIONS FUNCTIONALITY
// ============================================================================

/**
 * Handle launch options button clicks
 */
async function handleLaunchOptionsClick(e) {
  const button = e.target.closest(CONFIG.SELECTORS.launchOptionsBtn);
  if (!button) return;

  e.preventDefault();
  e.stopPropagation();

  const gameId = button.dataset.gameId;
  if (!gameId) {
    console.error('No game ID found on button');
    return;
  }

  console.log(`🚀 Launch options clicked for game ID: ${gameId}`);

  const originalContent = button.innerHTML;
  
  try {
    const existingRow = document.querySelector(`.${CONFIG.CLASSES.launchOptionsRow}[data-game-id="${gameId}"]`);
    
    if (existingRow && existingRow.style.display !== 'none') {
      closeLaunchOptions(gameId);
      return;
    }

    closeAllLaunchOptions();
    setButtonLoadingState(button);

    const launchOptions = await fetchLaunchOptions(gameId, true);
    console.log(`✅ Received ${launchOptions.length} launch options for game ${gameId}`);

    displayLaunchOptions(gameId, launchOptions);
    setButtonHideState(button, originalContent);
    TableState.openLaunchOptionsRows.add(gameId);
    
    updateCloseAllButton();

  } catch (error) {
    console.error('Error handling launch options click:', error);
    showLaunchOptionsError(gameId, error.message);
    setButtonShowState(button, originalContent);
  }
}

/**
 * Display launch options in table
 */
function displayLaunchOptions(gameId, launchOptions) {
  const gameRow = document.querySelector(`tr[data-game-id="${gameId}"]`);
  if (!gameRow) {
    console.error(`Game row not found for ID: ${gameId}`);
    return;
  }

  // Remove existing row
  const existingRow = document.querySelector(`.${CONFIG.CLASSES.launchOptionsRow}[data-game-id="${gameId}"]`);
  if (existingRow) existingRow.remove();

  // Create new row
  const launchOptionsRow = document.createElement('tr');
  launchOptionsRow.className = CONFIG.CLASSES.launchOptionsRow;
  launchOptionsRow.dataset.gameId = gameId;

  const colspan = gameRow.children.length;
  
  if (launchOptions.length === 0) {
    launchOptionsRow.innerHTML = createNoOptionsHTML(colspan, gameId);
  } else {
    launchOptionsRow.innerHTML = createOptionsHTML(colspan, launchOptions, gameId);
  }

  gameRow.parentNode.insertBefore(launchOptionsRow, gameRow.nextSibling);
  setupLaunchOptionsRowEvents(launchOptionsRow);
  
  requestAnimationFrame(() => {
    launchOptionsRow.style.display = 'table-row';
  });

  console.log(`✨ Launch options displayed for game ${gameId}`);
}

/**
 * Create HTML for launch options content
 */
function createOptionsHTML(colspan, launchOptions, gameId) {
  const optionsHTML = launchOptions.map(option => createLaunchOptionHTML(option)).join('');
  
  return `
    <td colspan="${colspan}" class="${CONFIG.CLASSES.launchOptionsCell}">
      <ul class="launch-options-list">
        ${optionsHTML}
      </ul>
      <div class="launch-options-close-container">
        <button class="launch-options-close" data-game-id="${gameId}">
          Close Options
        </button>
      </div>
    </td>
  `;
}

/**
 * Create HTML for no options content
 */
function createNoOptionsHTML(colspan, gameId) {
  return `
    <td colspan="${colspan}" class="${CONFIG.CLASSES.launchOptionsCell}">
      <div class="no-options">
        <h4>No Launch Options Available</h4>
        <p>This game doesn't have any community-verified launch options yet.</p>
        <p>Consider contributing if you know of effective launch options!</p>
      </div>
      <div class="launch-options-close-container">
        <button class="launch-options-close" data-game-id="${gameId}">
          Close Options
        </button>
      </div>
    </td>
  `;
}

/**
 * Create HTML for individual launch option
 */
function createLaunchOptionHTML(option) {
  const verifiedBadge = option.verified ? '<span class="option-verified">Verified</span>' : '';
  const votesBadge = option.upvotes > 0 ? `<span class="option-votes">${option.upvotes}</span>` : '';
  const command = option.command || option.option || '';

  return `
    <li class="${CONFIG.CLASSES.launchOption}">
      <div class="${CONFIG.CLASSES.optionCommand}" data-command="${escapeHtml(command)}">
        <code>${escapeHtml(command)}</code>
      </div>
      
      ${option.description ? `<div class="option-description">${escapeHtml(option.description)}</div>` : ''}
      
      <div class="option-meta">
        <span class="option-source">${escapeHtml(option.source || 'Community')}</span>
        <div>
          ${verifiedBadge}
          ${votesBadge}
        </div>
      </div>
    </li>
  `;
}

/**
 * Close launch options for specific game
 */
function closeLaunchOptions(gameId) {
  const launchOptionsRow = document.querySelector(`.${CONFIG.CLASSES.launchOptionsRow}[data-game-id="${gameId}"]`);
  const button = document.querySelector(`.launch-options-btn[data-game-id="${gameId}"]`);
  
  if (launchOptionsRow) {
    launchOptionsRow.style.display = 'none';
    setTimeout(() => launchOptionsRow.remove(), CONFIG.ANIMATION_DELAY);
  }
  
  if (button) {
    setButtonShowState(button);
  }

  TableState.openLaunchOptionsRows.delete(gameId);
  updateCloseAllButton();
  
  console.log(`❌ Closed launch options for game ${gameId}`);
}

/**
 * Close all open launch options
 */
function closeAllLaunchOptions() {
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
  
  console.log(`🧹 Closed ${closedCount} launch options`);
  return closedCount;
}

/**
 * Show launch options error
 */
function showLaunchOptionsError(gameId, errorMessage) {
  const gameRow = document.querySelector(`tr[data-game-id="${gameId}"]`);
  if (!gameRow) return;

  const existingRow = document.querySelector(`.${CONFIG.CLASSES.launchOptionsRow}[data-game-id="${gameId}"]`);
  if (existingRow) existingRow.remove();

  const launchOptionsRow = document.createElement('tr');
  launchOptionsRow.className = CONFIG.CLASSES.launchOptionsRow;
  launchOptionsRow.dataset.gameId = gameId;

  const colspan = gameRow.children.length;
  
  launchOptionsRow.innerHTML = `
    <td colspan="${colspan}" class="${CONFIG.CLASSES.launchOptionsCell}">
      <div class="error">
        <h3>❌ Error Loading Launch Options</h3>
        <p>Failed to load launch options: ${escapeHtml(errorMessage)}</p>
        <div class="launch-options-close-container">
          <button class="launch-options-close" data-game-id="${gameId}">Close</button>
        </div>
      </div>
    </td>
  `;

  gameRow.parentNode.insertBefore(launchOptionsRow, gameRow.nextSibling);
  setupLaunchOptionsRowEvents(launchOptionsRow);
  
  launchOptionsRow.style.display = 'table-row';
}

// ============================================================================
// BUTTON STATE MANAGEMENT
// ============================================================================

function setButtonLoadingState(button) {
  button.disabled = true;
  button.innerHTML = `
    <span class="loading-spinner" style="width: 12px; height: 12px; border: 2px solid rgba(255,255,255,0.3); border-top: 2px solid white; border-radius: 50%; animation: spin 1s linear infinite; margin-right: 8px; display: inline-block;"></span>
    Loading...
  `;
}

function setButtonHideState(button, originalContent) {
  const hideContent = originalContent.replace(/Show Options/g, 'Hide Options');
  button.innerHTML = hideContent;
  button.disabled = false;
  button.setAttribute('aria-expanded', 'true');
}

function setButtonShowState(button, originalContent = null) {
  if (originalContent) {
    button.innerHTML = originalContent;
  } else {
    const currentContent = button.innerHTML;
    const showContent = currentContent.replace(/Hide Options/g, 'Show Options');
    button.innerHTML = showContent;
  }
  button.disabled = false;
  button.setAttribute('aria-expanded', 'false');
}

// ============================================================================
// CLOSE ALL FUNCTIONALITY
// ============================================================================

function updateCloseAllButton() {
  const openCount = getOpenLaunchOptionsCount();
  
  if (openCount >= CONFIG.CLOSE_ALL_THRESHOLD) {
    showCloseAllButton();
  } else {
    hideCloseAllButton();
  }
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
    setTimeout(() => closeAllBtn.style.display = 'none', CONFIG.ANIMATION_DELAY);
  }
}

function createCloseAllButton() {
  const closeAllBtn = document.createElement('button');
  closeAllBtn.id = 'close-all-launch-options-btn';
  closeAllBtn.className = CONFIG.CLASSES.closeAllBtn;
  closeAllBtn.innerHTML = `
    <span class="close-all-icon" aria-hidden="true">✕</span>
    <span class="close-all-text">Close All Options</span>
  `;
  closeAllBtn.setAttribute('aria-label', 'Close all open launch options');
  closeAllBtn.setAttribute('title', 'Close all open launch options (Esc key)');
  
  return closeAllBtn;
}

function handleCloseAllClick(e) {
  e.preventDefault();
  e.stopPropagation();
  
  const button = e.currentTarget;
  button.classList.add('clicked');
  
  const closedCount = closeAllLaunchOptions();
  
  if (closedCount > 0) {
    showCloseAllFeedback(closedCount);
  }
  
  setTimeout(() => button.classList.remove('clicked'), 200);
}

function showCloseAllFeedback(count) {
  const feedback = document.createElement('div');
  feedback.className = 'close-all-feedback';
  feedback.textContent = `${count} option${count !== 1 ? 's' : ''} closed`;
  
  const closeBtn = document.getElementById('close-all-launch-options-btn');
  if (closeBtn) {
    const rect = closeBtn.getBoundingClientRect();
    feedback.style.position = 'fixed';
    feedback.style.right = `${window.innerWidth - rect.left + 10}px`;
    feedback.style.top = `${rect.top + rect.height / 2}px`;
    feedback.style.transform = 'translateY(-50%)';
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
  
  if (!command) {
    console.error('No command found to copy');
    return;
  }

  try {
    await navigator.clipboard.writeText(command);
    showCopySuccess(element);
    console.log(`📋 Copied command: ${command}`);
  } catch (error) {
    console.error('Failed to copy command:', error);
    showCopyError(element);
    attemptTextSelection(element);
  }
}

function showCopySuccess(element) {
  element.classList.remove('copy-failed');
  element.classList.add('copied');
  setTimeout(() => element.classList.remove('copied'), 1000);
}

function showCopyError(element) {
  element.classList.remove('copied');
  element.classList.add('copy-failed');
  setTimeout(() => element.classList.remove('copy-failed'), 1000);
}

function attemptTextSelection(element) {
  try {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  } catch (fallbackError) {
    console.error('Fallback text selection also failed:', fallbackError);
  }
}

// ============================================================================
// EVENT MANAGEMENT
// ============================================================================

/**
 * Set up main table event listeners
 */
function setupTableEventListeners() {
  if (TableState.isInitialized) return;
  
  // Launch options buttons
  document.addEventListener('click', handleLaunchOptionsClick);
  
  // Close all button
  document.addEventListener('click', (e) => {
    if (e.target.closest('#close-all-launch-options-btn')) {
      handleCloseAllClick(e);
    }
  });
  
  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const openCount = getOpenLaunchOptionsCount();
      if (openCount > 0) {
        e.preventDefault();
        closeAllLaunchOptions();
      }
    }
  });
  
  TableState.isInitialized = true;
  console.log('🎯 Table event listeners initialized');
}

/**
 * Set up events for launch options row
 */
function setupLaunchOptionsRowEvents(container) {
  // Copy functionality
  const commandElements = container.querySelectorAll(`.${CONFIG.CLASSES.optionCommand}`);
  commandElements.forEach(element => {
    element.addEventListener('click', handleCommandClick);
    element.tabIndex = 0;
    
    element.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleCommandClick(e);
      }
    });
  });
  
  // Close button
  const closeButton = container.querySelector('.launch-options-close');
  if (closeButton) {
    closeButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const gameId = closeButton.dataset.gameId;
      if (gameId) {
        closeLaunchOptions(gameId);
      }
    });
  }
}

/**
 * Set up empty state event listeners
 */
function setupEmptyStateEventListeners() {
  // Action buttons
  document.addEventListener('click', (e) => {
    const action = e.target.dataset.action;
    if (!action) return;
    
    e.preventDefault();
    
    switch (action) {
      case 'show-all':
        triggerShowAllGames();
        break;
      case 'clear-search':
        triggerClearSearch();
        break;
      case 'clear-filters':
        triggerClearFilters();
        break;
      case 'learn-more':
        showLaunchOptionsInfo();
        break;
    }
  });
  
  // Suggestion chips
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('suggestion-chip')) {
      const searchTerm = e.target.dataset.search;
      if (searchTerm) {
        triggerSearch(searchTerm);
      }
    }
  });
}

// ============================================================================
// INTEGRATION TRIGGERS
// ============================================================================

function triggerShowAllGames() {
  const toggle = document.getElementById('showAllGamesToggle');
  if (toggle) {
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
  } else {
    // Fallback: dispatch custom event
    document.dispatchEvent(new CustomEvent('showAllGames'));
  }
}

function triggerClearSearch() {
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.value = '';
    searchInput.dispatchEvent(new Event('input'));
  }
}

function triggerClearFilters() {
  // Clear search
  triggerClearSearch();
  
  // Clear filter selects
  const filterSelects = document.querySelectorAll('.filter-select');
  filterSelects.forEach(select => {
    select.selectedIndex = 0;
    select.dispatchEvent(new Event('change'));
  });
  
  // Dispatch custom event for app to handle
  document.dispatchEvent(new CustomEvent('clearAllFilters'));
}

function triggerSearch(searchTerm) {
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.value = searchTerm;
    searchInput.dispatchEvent(new Event('input'));
  }
}

function showLaunchOptionsInfo() {
  const modal = document.createElement('div');
  modal.className = 'info-modal-overlay';
  modal.innerHTML = `
    <div class="info-modal">
      <div class="info-modal-header">
        <h3>What are Steam Launch Options?</h3>
        <button class="info-modal-close">&times;</button>
      </div>
      <div class="info-modal-body">
        <p>Steam launch options are special commands that modify how games start and run.</p>
        <h4>Common uses:</h4>
        <ul>
          <li><strong>Performance:</strong> Improve FPS and reduce stuttering</li>
          <li><strong>Graphics:</strong> Force specific resolutions or disable effects</li>
          <li><strong>Audio:</strong> Fix sound issues or force audio drivers</li>
          <li><strong>Compatibility:</strong> Resolve crashes and stability issues</li>
        </ul>
        <h4>How to use them:</h4>
        <ol>
          <li>Right-click the game in your Steam library</li>
          <li>Select "Properties"</li>
          <li>Find "Launch Options" field</li>
          <li>Copy and paste the launch options</li>
        </ol>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  const closeModal = () => document.body.removeChild(modal);
  modal.querySelector('.info-modal-close').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      closeModal();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function getTableContainer() {
  const container = document.querySelector(CONFIG.SELECTORS.tableContainer);
  if (!container) {
    console.error('Table container not found');
  }
  return container;
}

function getOpenLaunchOptionsCount() {
  return document.querySelectorAll(CONFIG.SELECTORS.launchOptionsRow).length;
}

function escapeHtml(text) {
  if (typeof text !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(dateString) {
  if (!dateString) return 'Unknown';
  try {
    return new Date(dateString).toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  } catch (error) {
    console.warn('Invalid date format:', dateString);
    return 'Unknown';
  }
}

function getActiveFiltersDescription(filters) {
  const activeFilters = [];
  
  if (filters.search) activeFilters.push(`Search: "${filters.search}"`);
  if (filters.developer) activeFilters.push(`Developer: ${filters.developer}`);
  if (filters.category) activeFilters.push(`Category: ${filters.category}`);
  if (filters.year) activeFilters.push(`Year: ${filters.year}`);
  if (filters.options) activeFilters.push(`Options: ${filters.options}`);
  if (!filters.showAll) activeFilters.push('Only games with launch options');
  
  return activeFilters.length > 0 
    ? activeFilters.map(filter => `<span class="filter-tag">${filter}</span>`).join('')
    : '<span class="no-filters">No specific filters</span>';
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize table features
 */
function initializeTable() {
  // Add required CSS if not present
  if (!document.querySelector('style[data-table-styles]')) {
    const style = document.createElement('style');
    style.setAttribute('data-table-styles', 'true');
    style.textContent = `
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }
  
  setupTableEventListeners();
  console.log('✅ Table initialized');
}

// Auto-initialize when module loads
initializeTable();

// ============================================================================
// PUBLIC API
// ============================================================================

export {
  // Launch options management
  closeAllLaunchOptions,
  
  // Utility functions
  escapeHtml,
  formatDate,
  
  // For external control
  triggerShowAllGames,
  triggerClearSearch,
  triggerClearFilters
};