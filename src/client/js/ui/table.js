/**
 * @fileoverview Updated Table.js for Vanilla Slops
 * Handles games table display with full mobile support including data-label attributes
 * Includes intelligent empty states, launch options, and touch-optimized interactions
 * @module Table
 * @requires api.js
 * @requires styles/animations.css
 * @requires styles/table.css
 * @requires styles/mobile.css (new mobile fixes)
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
  MOBILE_BREAKPOINT: 768,
  TOUCH_TARGET_MIN: 44, // Minimum touch target size in pixels
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
    emptyTableState: 'empty-table-state',
    mobileResponsive: 'mobile-responsive-table'
  },
  // Mobile-specific data labels for table cells
  DATA_LABELS: {
    title: 'Game Title',
    developer: 'Developer', 
    publisher: 'Publisher',
    releaseDate: 'Release Date',
    engine: 'Engine',
    launchOptions: 'Launch Options'
  }
};

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

const TableState = {
  openLaunchOptionsRows: new Set(),
  currentStats: { withOptions: 0, withoutOptions: 0, total: 0 },
  currentFilters: {},
  isInitialized: false,
  isMobile: window.innerWidth <= CONFIG.MOBILE_BREAKPOINT,
  touchDevice: 'ontouchstart' in window
};

// Update mobile state on resize
window.addEventListener('resize', debounce(() => {
  TableState.isMobile = window.innerWidth <= CONFIG.MOBILE_BREAKPOINT;
}, 250));

// ============================================================================
// MAIN RENDER FUNCTIONS
// ============================================================================

/**
 * Main table render function - entry point for all table rendering
 * Enhanced with mobile-first approach and proper data attributes
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
  
  // Add mobile-specific enhancements
  if (TableState.isMobile) {
    enhanceMobileExperience(container);
  }
  
  console.log(`✅ Table rendered with ${games.length} games (Mobile: ${TableState.isMobile})`);
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
  
  // Add mobile-specific empty state enhancements
  if (TableState.isMobile) {
    enhanceMobileEmptyState(container);
  }
  
  console.log('Empty state rendered:', emptyStateType);
}

// ============================================================================
// TABLE RENDERING WITH MOBILE SUPPORT
// ============================================================================

/**
 * Render the actual games table with full mobile data-label support
 */
function renderGamesTable(container, games) {
  const table = document.createElement('table');
  table.className = `${CONFIG.CLASSES.gamesTable} ${CONFIG.CLASSES.mobileResponsive}`;
  table.setAttribute('role', 'table');
  table.setAttribute('aria-label', 'Games with launch options');
  
  table.innerHTML = `
    <thead>
      <tr role="row">
        <th role="columnheader" tabindex="0" aria-sort="none">${CONFIG.DATA_LABELS.title}</th>
        <th role="columnheader" tabindex="0" aria-sort="none">${CONFIG.DATA_LABELS.developer}</th>
        <th role="columnheader" tabindex="0" aria-sort="none">${CONFIG.DATA_LABELS.publisher}</th>
        <th role="columnheader" tabindex="0" aria-sort="none">${CONFIG.DATA_LABELS.releaseDate}</th>
        <th role="columnheader" tabindex="0" aria-sort="none">${CONFIG.DATA_LABELS.engine}</th>
        <th role="columnheader">${CONFIG.DATA_LABELS.launchOptions}</th>
      </tr>
    </thead>
    <tbody>
      ${games.map(game => createGameRowHTML(game)).join('')}
    </tbody>
  `;

  container.innerHTML = '';
  container.appendChild(table);
  
  // Add mobile-specific table enhancements
  if (TableState.isMobile) {
    enhanceMobileTable(table);
  }
  
  console.log(`✨ Table rendered with proper mobile data-labels (${games.length} games)`);
}

/**
 * Create HTML for a single game row with COMPLETE mobile data-label support
 * This ensures every table cell has the required data-label attribute
 */
function createGameRowHTML(game) {
  const gameId = game.app_id;
  const optionsCount = game.total_options_count || 0;
  const releaseDate = formatDate(game.release_date);
  const title = escapeHtml(game.title || 'Unknown Game');
  const developer = escapeHtml(game.developer || 'Unknown Developer');
  const publisher = escapeHtml(game.publisher || 'Unknown Publisher');
  const engine = escapeHtml(game.engine || 'Unknown Engine');

  return `
    <tr role="row" data-game-id="${gameId}" class="game-row">
      <td data-label="${CONFIG.DATA_LABELS.title}" role="gridcell" class="game-title-cell">
        <div class="game-title" title="${title}">
          ${title}
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

/**
 * Generate launch options button with mobile-optimized design
 */
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
        <span class="btn-text">Show Options</span>
        <span class="options-count" aria-label="${optionsCount} options">${optionsCount}</span>
      </button>
    `;
  } else {
    return `
      <span class="no-options-text" aria-label="No launch options available">
        <span class="no-options-icon" aria-hidden="true">—</span>
        <span class="no-options-label">No Options</span>
      </span>
    `;
  }
}

// ============================================================================
// MOBILE ENHANCEMENTS
// ============================================================================

/**
 * Add mobile-specific enhancements to the table
 */
function enhanceMobileTable(table) {
  // Add mobile class for CSS targeting
  table.classList.add('mobile-optimized');
  
  // Ensure proper touch targets
  const buttons = table.querySelectorAll('.launch-options-btn');
  buttons.forEach(button => {
    ensureTouchTarget(button);
  });
  
  // Add mobile-specific accessibility
  table.setAttribute('aria-label', 'Games table - swipe horizontally on mobile to view all data');
  
  // Add mobile scroll hint if needed
  if (table.scrollWidth > table.clientWidth) {
    addMobileScrollHint(table);
  }
  
  console.log('🤳 Mobile table enhancements applied');
}

/**
 * Enhance mobile experience with touch optimizations
 */
function enhanceMobileExperience(container) {
  // Add touch-friendly classes
  container.classList.add('mobile-optimized');
  
  // Optimize for touch
  if (TableState.touchDevice) {
    addTouchOptimizations(container);
  }
  
  // Add mobile-specific event handlers
  addMobileEventHandlers(container);
  
  console.log('📱 Mobile experience enhancements applied');
}

/**
 * Add touch optimizations for mobile devices
 */
function addTouchOptimizations(container) {
  // Add touch-action for better scrolling
  container.style.touchAction = 'pan-y';
  
  // Add haptic feedback for supported devices
  if ('vibrate' in navigator) {
    container.addEventListener('touchstart', (e) => {
      if (e.target.closest('.launch-options-btn')) {
        navigator.vibrate(50); // Subtle haptic feedback
      }
    }, { passive: true });
  }
  
  // Prevent accidental zoom on double-tap
  let lastTouchEnd = 0;
  container.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) {
      e.preventDefault();
    }
    lastTouchEnd = now;
  }, { passive: false });
}

/**
 * Add mobile-specific event handlers
 */
function addMobileEventHandlers(container) {
  // Handle mobile-specific interactions
  container.addEventListener('touchstart', (e) => {
    const target = e.target.closest('[data-mobile-action]');
    if (target) {
      target.classList.add('touch-active');
    }
  }, { passive: true });
  
  container.addEventListener('touchend', (e) => {
    const target = e.target.closest('[data-mobile-action]');
    if (target) {
      target.classList.remove('touch-active');
    }
  }, { passive: true });
}

/**
 * Ensure proper touch target sizing
 */
function ensureTouchTarget(element) {
  const rect = element.getBoundingClientRect();
  const minSize = CONFIG.TOUCH_TARGET_MIN;
  
  if (rect.width < minSize || rect.height < minSize) {
    element.style.minWidth = `${minSize}px`;
    element.style.minHeight = `${minSize}px`;
    element.style.display = 'inline-flex';
    element.style.alignItems = 'center';
    element.style.justifyContent = 'center';
  }
}

/**
 * Add mobile scroll hint for horizontal overflow
 */
function addMobileScrollHint(table) {
  const hint = document.createElement('div');
  hint.className = 'mobile-scroll-hint';
  hint.innerHTML = '← Scroll to see more →';
  hint.setAttribute('aria-hidden', 'true');
  
  table.parentNode.insertBefore(hint, table);
  
  // Hide hint after user scrolls
  let hasScrolled = false;
  table.addEventListener('scroll', () => {
    if (!hasScrolled) {
      hasScrolled = true;
      hint.style.opacity = '0';
      setTimeout(() => hint.remove(), 300);
    }
  }, { once: true });
}

/**
 * Enhance mobile empty state
 */
function enhanceMobileEmptyState(container) {
  // Add mobile-friendly classes
  container.classList.add('mobile-empty-state');
  
  // Ensure buttons are touch-friendly
  const buttons = container.querySelectorAll('button, .btn');
  buttons.forEach(button => {
    ensureTouchTarget(button);
  });
  
  // Optimize text for mobile readability
  const descriptions = container.querySelectorAll('.empty-description');
  descriptions.forEach(desc => {
    desc.style.lineHeight = '1.6';
    desc.style.fontSize = 'var(--font-size-base)';
  });
}

// ============================================================================
// LOADING & BASIC EMPTY STATES
// ============================================================================

/**
 * Render loading state with mobile considerations
 */
function renderLoadingState(container) {
  container.innerHTML = `
    <div class="table-loading ${TableState.isMobile ? 'mobile-loading' : ''}">
      <div class="loading-spinner"></div>
      <span>Loading games...</span>
    </div>
  `;
}

/**
 * Render basic empty state (fallback) with mobile support
 */
function renderBasicEmptyState(container) {
  container.innerHTML = `
    <div class="no-results ${TableState.isMobile ? 'mobile-no-results' : ''}">
      <div class="empty-icon">🎮</div>
      <h3>No games found</h3>
      <p>Try adjusting your search criteria or filters.</p>
      ${TableState.isMobile ? '<p class="mobile-hint">Tap the filter button to adjust your search.</p>' : ''}
    </div>
  `;
}

// ============================================================================
// EMPTY STATES (OPTIONS-FIRST) - MOBILE ENHANCED
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
 * Create HTML for different empty state types with mobile support
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
  const mobileClass = TableState.isMobile ? 'mobile-empty-state' : '';
  return `<div class="${CONFIG.CLASSES.emptyTableState} ${type} ${mobileClass}">${createHTML()}</div>`;
}

/**
 * No options found state with mobile enhancements
 */
function createNoOptionsFoundHTML(stats) {
  const suggestions = ['Counter-Strike', 'Half-Life', 'Portal', 'Cyberpunk', 'Witcher', 'GTA'];
  const buttonClass = TableState.isMobile ? 'btn mobile-btn' : 'btn';
  
  return `
    <div class="empty-icon">🎮</div>
    <h3 class="empty-title">Looking for games with launch options?</h3>
    <p class="empty-description">
      We're showing games that have community-verified launch options for the best experience.
    </p>
    
    <div class="empty-stats ${TableState.isMobile ? 'mobile-stats' : ''}">
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
      <div class="suggestion-chips ${TableState.isMobile ? 'mobile-chips' : ''}">
        ${suggestions.map(search => 
          `<button class="suggestion-chip ${TableState.isMobile ? 'mobile-chip' : ''}" data-search="${search}">${search}</button>`
        ).join('')}
      </div>
    </div>
    
    <div class="empty-actions ${TableState.isMobile ? 'mobile-actions' : ''}">
      <button class="${buttonClass} btn-primary" data-action="show-all">
        Show all ${stats.total || 0} games
      </button>
      <button class="${buttonClass} btn-secondary" data-action="learn-more">
        Learn about launch options
      </button>
    </div>
  `;
}

/**
 * Search no results state with mobile enhancements
 */
function createSearchNoResultsHTML(filters, stats) {
  const searchTerm = filters.search || '';
  const buttonClass = TableState.isMobile ? 'btn mobile-btn' : 'btn';
  
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
      <div class="empty-suggestion ${TableState.isMobile ? 'mobile-suggestion' : ''}">
        <p>💡 Try <button class="inline-btn" data-action="show-all">showing all games</button> 
        to see ${stats.withoutOptions} more results without launch options.</p>
      </div>
    ` : ''}
    
    <div class="empty-actions ${TableState.isMobile ? 'mobile-actions' : ''}">
      <button class="${buttonClass} btn-secondary" data-action="clear-search">Clear search</button>
      <button class="${buttonClass} btn-secondary" data-action="clear-filters">Clear all filters</button>
    </div>
    
    <div class="search-tips ${TableState.isMobile ? 'mobile-tips' : ''}">
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
 * All games filtered state with mobile enhancements
 */
function createAllFilteredHTML(filters, stats) {
  const activeFilters = getActiveFiltersDescription(filters);
  const buttonClass = TableState.isMobile ? 'btn mobile-btn' : 'btn';
  
  return `
    <div class="empty-icon">🎛️</div>
    <h3 class="empty-title">No games match your filters</h3>
    <p class="empty-description">
      Your current filters are too restrictive. Try adjusting them to see more results.
    </p>
    
    <div class="active-filters-summary ${TableState.isMobile ? 'mobile-filters' : ''}">
      <h4>Active filters:</h4>
      <div class="filter-summary">${activeFilters}</div>
    </div>
    
    <div class="empty-actions ${TableState.isMobile ? 'mobile-actions' : ''}">
      <button class="${buttonClass} btn-primary" data-action="clear-filters">Clear all filters</button>
      ${!filters.showAll ? `
        <button class="${buttonClass} btn-secondary" data-action="show-all">Show all games</button>
      ` : ''}
    </div>
  `;
}

/**
 * Database empty state
 */
function createDatabaseEmptyHTML() {
  const buttonClass = TableState.isMobile ? 'btn mobile-btn' : 'btn';
  
  return `
    <div class="empty-icon">🗄️</div>
    <h3 class="empty-title">No games in database</h3>
    <p class="empty-description">
      The game database appears to be empty. This might be a temporary issue.
    </p>
    <div class="empty-actions ${TableState.isMobile ? 'mobile-actions' : ''}">
      <button class="${buttonClass} btn-primary" onclick="location.reload()">Refresh page</button>
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
    <div class="empty-stats ${TableState.isMobile ? 'mobile-stats' : ''}">
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
// LAUNCH OPTIONS FUNCTIONALITY - MOBILE ENHANCED
// ============================================================================

/**
 * Handle launch options button clicks with mobile considerations
 */
async function handleLaunchOptionsClick(e) {
  const button = e.target.closest(CONFIG.SELECTORS.launchOptionsBtn);
  if (!button) return;

  e.preventDefault();
  e.stopPropagation();

  // Add touch feedback on mobile
  if (TableState.touchDevice) {
    button.classList.add('touch-active');
    setTimeout(() => button.classList.remove('touch-active'), 150);
  }

  const gameId = button.dataset.gameId;
  if (!gameId) {
    console.error('No game ID found on button');
    return;
  }

  console.log(`🚀 Launch options clicked for game ID: ${gameId} (Mobile: ${TableState.isMobile})`);

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
 * Display launch options in table with mobile enhancements
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

  // Create new row with mobile support
  const launchOptionsRow = document.createElement('tr');
  launchOptionsRow.className = `${CONFIG.CLASSES.launchOptionsRow} ${TableState.isMobile ? 'mobile-options-row' : ''}`;
  launchOptionsRow.dataset.gameId = gameId;

  const colspan = gameRow.children.length;
  
  if (launchOptions.length === 0) {
    launchOptionsRow.innerHTML = createNoOptionsHTML(colspan, gameId);
  } else {
    launchOptionsRow.innerHTML = createOptionsHTML(colspan, launchOptions, gameId);
  }

  gameRow.parentNode.insertBefore(launchOptionsRow, gameRow.nextSibling);
  setupLaunchOptionsRowEvents(launchOptionsRow);
  
  // Add mobile-specific enhancements
  if (TableState.isMobile) {
    enhanceMobileLaunchOptions(launchOptionsRow);
  }
  
  requestAnimationFrame(() => {
    launchOptionsRow.style.display = 'table-row';
  });

  console.log(`✨ Launch options displayed for game ${gameId} (Mobile optimized: ${TableState.isMobile})`);
}

/**
 * Create HTML for launch options content with mobile support
 */
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
          <span class="close-icon" aria-hidden="true">✕</span>
          <span class="close-text">Hide Options</span>
        </button>
      </div>
    </td>
  `;
}

/**
 * Create HTML for no options content with mobile support
 */
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

/**
 * Create HTML for individual launch option with mobile enhancements
 */
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
        <span class="option-source">📝 ${escapeHtml(option.source || 'Community')}</span>
        <div class="option-badges">
          ${verifiedBadge}
          ${votesBadge}
        </div>
      </div>
    </li>
  `;
}

/**
 * Enhance mobile launch options display
 */
function enhanceMobileLaunchOptions(container) {
  // Add mobile-specific classes
  container.classList.add('mobile-enhanced');
  
  // Ensure all interactive elements are touch-friendly
  const interactiveElements = container.querySelectorAll('button, [role="button"]');
  interactiveElements.forEach(element => {
    ensureTouchTarget(element);
  });
  
  // Add swipe-to-close gesture on mobile
  if (TableState.touchDevice) {
    addSwipeToClose(container);
  }
  
  console.log('📱 Mobile launch options enhancements applied');
}

/**
 * Add swipe-to-close gesture for mobile
 */
function addSwipeToClose(container) {
  let startY = 0;
  let currentY = 0;
  let isDragging = false;
  
  container.addEventListener('touchstart', (e) => {
    startY = e.touches[0].clientY;
    isDragging = true;
  }, { passive: true });
  
  container.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    currentY = e.touches[0].clientY;
    const deltaY = currentY - startY;
    
    // Add visual feedback for swipe
    if (deltaY > 50) {
      container.style.transform = `translateY(${Math.min(deltaY - 50, 50)}px)`;
      container.style.opacity = Math.max(1 - (deltaY - 50) / 100, 0.5);
    }
  }, { passive: true });
  
  container.addEventListener('touchend', () => {
    if (!isDragging) return;
    isDragging = false;
    
    const deltaY = currentY - startY;
    
    if (deltaY > 100) {
      // Swipe down to close
      const gameId = container.dataset.gameId;
      if (gameId) {
        closeLaunchOptions(gameId);
      }
    } else {
      // Reset position
      container.style.transform = '';
      container.style.opacity = '';
    }
  }, { passive: true });
}

// ============================================================================
// BUTTON STATE MANAGEMENT - MOBILE ENHANCED
// ============================================================================

function setButtonLoadingState(button) {
  button.disabled = true;
  button.classList.add('loading');
  
  if (TableState.isMobile) {
    button.innerHTML = `
      <span class="loading-spinner mobile-spinner"></span>
      <span class="btn-text">Loading...</span>
    `;
  } else {
    button.innerHTML = `
      <span class="loading-spinner"></span>
      Loading...
    `;
  }
}

function setButtonHideState(button, originalContent) {
  const hideContent = originalContent.replace(/Show Options/g, 'Hide Options')
                                   .replace(/show-options/g, 'hide-options');
  button.innerHTML = hideContent;
  button.disabled = false;
  button.classList.remove('loading');
  button.classList.add('options-shown');
  button.setAttribute('aria-expanded', 'true');
}

function setButtonShowState(button, originalContent = null) {
  if (originalContent) {
    button.innerHTML = originalContent;
  } else {
    const currentContent = button.innerHTML;
    const showContent = currentContent.replace(/Hide Options/g, 'Show Options')
                                     .replace(/hide-options/g, 'show-options');
    button.innerHTML = showContent;
  }
  button.disabled = false;
  button.classList.remove('loading', 'options-shown');
  button.setAttribute('aria-expanded', 'false');
}

// ============================================================================
// CLOSE ALL FUNCTIONALITY - MOBILE ENHANCED
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
  closeAllBtn.className = `${CONFIG.CLASSES.closeAllBtn} ${TableState.isMobile ? 'mobile-close-all' : ''}`;
  
  if (TableState.isMobile) {
    closeAllBtn.innerHTML = `
      <span class="close-all-icon mobile-icon" aria-hidden="true">✕</span>
      <span class="close-all-text mobile-text">Close All</span>
    `;
  } else {
    closeAllBtn.innerHTML = `
      <span class="close-all-icon" aria-hidden="true">✕</span>
      <span class="close-all-text">Close All Options</span>
    `;
  }
  
  closeAllBtn.setAttribute('aria-label', 'Close all open launch options');
  closeAllBtn.setAttribute('title', 'Close all open launch options (Esc key)');
  
  // Ensure touch target on mobile
  if (TableState.isMobile) {
    ensureTouchTarget(closeAllBtn);
  }
  
  return closeAllBtn;
}

function handleCloseAllClick(e) {
  e.preventDefault();
  e.stopPropagation();
  
  const button = e.currentTarget;
  button.classList.add('clicked');
  
  // Add haptic feedback on mobile
  if (TableState.touchDevice && 'vibrate' in navigator) {
    navigator.vibrate(100);
  }
  
  const closedCount = closeAllLaunchOptions();
  
  if (closedCount > 0) {
    showCloseAllFeedback(closedCount);
  }
  
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
// COPY FUNCTIONALITY - MOBILE ENHANCED
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

  // Add haptic feedback on mobile
  if (TableState.touchDevice && 'vibrate' in navigator) {
    navigator.vibrate(50);
  }

  try {
    await navigator.clipboard.writeText(command);
    showCopySuccess(element);
    console.log(`📋 Copied command: ${command} (Mobile: ${TableState.isMobile})`);
  } catch (error) {
    console.error('Failed to copy command:', error);
    showCopyError(element);
    attemptTextSelection(element);
  }
}

function showCopySuccess(element) {
  element.classList.remove('copy-failed');
  element.classList.add('copied');
  
  // Show mobile-specific feedback
  if (TableState.isMobile) {
    const hint = element.querySelector('.copy-hint');
    if (hint) {
      hint.textContent = 'Copied!';
      setTimeout(() => hint.textContent = 'Tap to copy', 1000);
    }
  }
  
  setTimeout(() => element.classList.remove('copied'), 1000);
}

function showCopyError(element) {
  element.classList.remove('copied');
  element.classList.add('copy-failed');
  
  // Show mobile-specific error feedback
  if (TableState.isMobile) {
    const hint = element.querySelector('.copy-hint');
    if (hint) {
      hint.textContent = 'Copy failed';
      setTimeout(() => hint.textContent = 'Tap to copy', 1000);
    }
  }
  
  setTimeout(() => element.classList.remove('copy-failed'), 1000);
}

function attemptTextSelection(element) {
  try {
    const codeElement = element.querySelector('code') || element;
    const range = document.createRange();
    range.selectNodeContents(codeElement);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    
    // Show mobile instruction
    if (TableState.isMobile) {
      const instruction = document.createElement('div');
      instruction.className = 'copy-instruction mobile-instruction';
      instruction.textContent = 'Text selected - use your device\'s copy function';
      document.body.appendChild(instruction);
      
      setTimeout(() => instruction.remove(), 3000);
    }
  } catch (fallbackError) {
    console.error('Fallback text selection also failed:', fallbackError);
  }
}

// [Continue with remaining functions - close functions, event management, integration triggers, utility functions...]

// ============================================================================
// CLOSE FUNCTIONS
// ============================================================================

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
            <span class="close-icon" aria-hidden="true">✕</span>
            <span class="close-text">Close</span>
          </button>
        </div>
      </div>
    </td>
  `;

  gameRow.parentNode.insertBefore(launchOptionsRow, gameRow.nextSibling);
  setupLaunchOptionsRowEvents(launchOptionsRow);
  
  // Add mobile enhancements to error state
  if (TableState.isMobile) {
    const errorButton = launchOptionsRow.querySelector('.launch-options-close');
    if (errorButton) {
      ensureTouchTarget(errorButton);
    }
  }
  
  launchOptionsRow.style.display = 'table-row';
}

// ============================================================================
// EVENT MANAGEMENT - MOBILE ENHANCED
// ============================================================================

/**
 * Set up main table event listeners with mobile considerations
 */
function setupTableEventListeners() {
  if (TableState.isInitialized) return;
  
  // Launch options buttons (with passive event listeners for mobile performance)
  document.addEventListener('click', handleLaunchOptionsClick);
  
  // Close all button
  document.addEventListener('click', (e) => {
    if (e.target.closest('#close-all-launch-options-btn')) {
      handleCloseAllClick(e);
    }
  });
  
  // Keyboard shortcuts (desktop) and mobile gestures
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const openCount = getOpenLaunchOptionsCount();
      if (openCount > 0) {
        e.preventDefault();
        closeAllLaunchOptions();
      }
    }
  });
  
  // Mobile-specific event listeners
  if (TableState.isMobile) {
    setupMobileEventListeners();
  }
  
  TableState.isInitialized = true;
  console.log(`🎯 Table event listeners initialized (Mobile: ${TableState.isMobile})`);
}

/**
 * Set up mobile-specific event listeners
 */
function setupMobileEventListeners() {
  // Handle orientation changes
  window.addEventListener('orientationchange', () => {
    setTimeout(() => {
      // Refresh mobile state and re-optimize
      TableState.isMobile = window.innerWidth <= CONFIG.MOBILE_BREAKPOINT;
      
      // Re-enhance mobile experience if still mobile
      if (TableState.isMobile) {
        const container = getTableContainer();
        if (container) {
          enhanceMobileExperience(container);
        }
      }
    }, 100);
  });
  
  // Handle visibility changes (mobile app switching)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // App went to background, pause any animations
      document.body.classList.add('app-hidden');
    } else {
      // App came back to foreground
      document.body.classList.remove('app-hidden');
    }
  });
}

/**
 * Set up events for launch options row with mobile enhancements
 */
function setupLaunchOptionsRowEvents(container) {
  // Copy functionality with mobile optimizations
  const commandElements = container.querySelectorAll(`.${CONFIG.CLASSES.optionCommand}`);
  commandElements.forEach(element => {
    element.addEventListener('click', handleCommandClick);
    element.tabIndex = 0;
    
    // Keyboard support (mainly for desktop/keyboard users)
    element.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleCommandClick(e);
      }
    });
    
    // Mobile-specific touch events
    if (TableState.touchDevice) {
      element.addEventListener('touchstart', (e) => {
        element.classList.add('touch-active');
      }, { passive: true });
      
      element.addEventListener('touchend', (e) => {
        element.classList.remove('touch-active');
      }, { passive: true });
    }
  });
  
  // Close button with mobile enhancements
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
    
    // Ensure proper touch target
    if (TableState.isMobile) {
      ensureTouchTarget(closeButton);
    }
  }
}

/**
 * Set up empty state event listeners with mobile support
 */
function setupEmptyStateEventListeners() {
  // Action buttons
  document.addEventListener('click', (e) => {
    const action = e.target.dataset.action;
    if (!action) return;
    
    e.preventDefault();
    
    // Add haptic feedback on mobile
    if (TableState.touchDevice && 'vibrate' in navigator) {
      navigator.vibrate(50);
    }
    
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
// INTEGRATION TRIGGERS - MOBILE AWARE
// ============================================================================

function triggerShowAllGames() {
  const checkbox = document.getElementById('showAllGamesFilter');
  if (checkbox) {
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    // Fallback: dispatch custom event
    document.dispatchEvent(new CustomEvent('showAllGames'));
  }
  
  console.log('🌍 Triggered show all games');
}

function triggerClearSearch() {
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.value = '';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    
    // Focus search input for better UX (but not on mobile to avoid keyboard)
    if (!TableState.isMobile) {
      searchInput.focus();
    }
  }
  
  console.log('🔍 Triggered clear search');
}

function triggerClearFilters() {
  // Clear search
  triggerClearSearch();
  
  // Clear filter selects
  const filterSelects = document.querySelectorAll('.filter-select');
  filterSelects.forEach(select => {
    select.selectedIndex = 0;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  
  // Clear show all checkbox
  const showAllCheckbox = document.getElementById('showAllGamesFilter');
  if (showAllCheckbox) {
    showAllCheckbox.checked = false;
    showAllCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
  }
  
  // Dispatch custom event for app to handle
  document.dispatchEvent(new CustomEvent('clearAllFilters'));
  
  console.log('🧹 Triggered clear all filters');
}

function triggerSearch(searchTerm) {
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.value = searchTerm;
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    
    // Scroll to top on mobile after search
    if (TableState.isMobile) {
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 300);
    }
  }
  
  console.log(`🔍 Triggered search for: ${searchTerm}`);
}

function showLaunchOptionsInfo() {
  const modal = document.createElement('div');
  modal.className = `info-modal-overlay ${TableState.isMobile ? 'mobile-modal' : ''}`;
  modal.innerHTML = `
    <div class="info-modal ${TableState.isMobile ? 'mobile-info-modal' : ''}">
      <div class="info-modal-header">
        <h3>What are Steam Launch Options?</h3>
        <button class="info-modal-close ${TableState.isMobile ? 'mobile-modal-close' : ''}">&times;</button>
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
        ${TableState.isMobile ? '<p><strong>Mobile tip:</strong> Tap any launch option to copy it to your clipboard!</p>' : ''}
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Prevent body scroll on mobile
  if (TableState.isMobile) {
    document.body.style.overflow = 'hidden';
  }
  
  const closeModal = () => {
    document.body.removeChild(modal);
    if (TableState.isMobile) {
      document.body.style.overflow = '';
    }
  };
  
  const closeButton = modal.querySelector('.info-modal-close');
  if (closeButton) {
    closeButton.addEventListener('click', closeModal);
    // Ensure touch target on mobile
    if (TableState.isMobile) {
      ensureTouchTarget(closeButton);
    }
  }
  
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
// UTILITY FUNCTIONS - MOBILE ENHANCED
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
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: TableState.isMobile ? 'short' : 'short', 
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
    ? activeFilters.map(filter => `<span class="filter-tag ${TableState.isMobile ? 'mobile-filter-tag' : ''}">${filter}</span>`).join('')
    : '<span class="no-filters">No specific filters</span>';
}

/**
 * Debounce function for performance
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Check if device is mobile
 */
function isMobileDevice() {
  return /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
         window.innerWidth <= CONFIG.MOBILE_BREAKPOINT;
}

/**
 * Get safe area insets for devices with notches (iPhone X, etc.)
 */
function getSafeAreaInsets() {
  const safeAreaTop = getComputedStyle(document.documentElement).getPropertyValue('--sat') || '0px';
  const safeAreaBottom = getComputedStyle(document.documentElement).getPropertyValue('--sab') || '0px';
  
  return {
    top: parseInt(safeAreaTop),
    bottom: parseInt(safeAreaBottom)
  };
}

// ============================================================================
// INITIALIZATION - MOBILE AWARE
// ============================================================================

/**
 * Initialize table features with mobile detection
 */
function initializeTable() {
  // Update mobile state
  TableState.isMobile = isMobileDevice();
  TableState.touchDevice = 'ontouchstart' in window;
  
  // Add required CSS if not present
  if (!document.querySelector('style[data-table-styles]')) {
    const style = document.createElement('style');
    style.setAttribute('data-table-styles', 'true');
    style.textContent = `
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      
      .mobile-spinner {
        width: 16px;
        height: 16px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-top: 2px solid white;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin-right: 8px;
      }
      
      .touch-active {
        opacity: 0.7;
        transform: scale(0.95);
      }
      
      .mobile-instruction {
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: var(--color-surface-raised);
        color: var(--color-text-primary);
        padding: 12px 20px;
        border-radius: 8px;
        font-size: 14px;
        z-index: 1000;
        box-shadow: var(--shadow-lg);
      }
    `;
    document.head.appendChild(style);
  }
  
  // Add device classes to body
  document.body.classList.toggle('mobile-device', TableState.isMobile);
  document.body.classList.toggle('touch-device', TableState.touchDevice);
  
  setupTableEventListeners();
  
  console.log(`✅ Table initialized (Mobile: ${TableState.isMobile}, Touch: ${TableState.touchDevice})`);
}

// Auto-initialize when module loads
initializeTable();

// ============================================================================
// PUBLIC API - MOBILE ENHANCED
// ============================================================================

export {
  // Launch options management
  closeAllLaunchOptions,
  
  // Mobile utilities
  isMobileDevice,
  getSafeAreaInsets,
  
  // Utility functions
  escapeHtml,
  formatDate,
  debounce,
  
  // For external control
  triggerShowAllGames,
  triggerClearSearch,
  triggerClearFilters,
  
  // Mobile state
  TableState
};