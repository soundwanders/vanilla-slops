import { fetchGames, preloadPopularContent } from './api.js';
import { renderTable, renderEmptyState } from './ui/table.js';
import { setupThemeToggle } from './ui/theme.js';
import { renderPagination } from './ui/pagination.js';
import SlopSearch from './ui/search.js';

const PAGE_SIZE = 20;

/**
 * Application state management with Options-First strategy
 */
const AppState = {
  currentPage: 1,
  isLoading: false,
  filters: {
    // Options-First defaults
    hasOptions: true,  // Show games with options by default
    showAll: false     // Progressive disclosure toggle
  },
  totalPages: 0,
  searchInstance: null,
  filtersInitialized: false,
  lastScrollPosition: 0, 
  preventNextScroll: false,
  
  // Statistics for progressive disclosure UI
  gameStats: {
    withOptions: 0,
    withoutOptions: 0,
    total: 0,
    percentageWithOptions: 0
  }
};

/**
 * Initialize and populate filter dropdowns with real data
 */
async function initializeFilters() {
  if (AppState.filtersInitialized) return;
  
  try {
    // Show loading state on filters
    const filterSelects = document.querySelectorAll('.filter-select');
    filterSelects.forEach(select => {
      select.disabled = true;
      select.style.opacity = '0.6';
    });
    
    // Fetch facets from the API
    const response = await fetch('/api/games/facets?includeStats=true');
    if (!response.ok) {
      throw new Error(`Failed to fetch facets: ${response.status}`);
    }
    
    const facets = await response.json();
    
    // Store statistics for UI feedback
    if (facets.statistics) {
      AppState.gameStats = facets.statistics;
      console.log('📊 Game statistics loaded:', AppState.gameStats);
    }
    
    // Populate each filter dropdown
    populateFilterDropdown('developerFilter', facets.developers, 'All Developers');
    populateFilterDropdown('categoryFilter', facets.genres, 'All Categories');
    populateYearFilter(facets.releaseYears);
    populateOptionsFilter();
    
    // Initialize Options-First toggle
    initializeOptionsFirstToggle();
    
    // Remove loading state
    filterSelects.forEach(select => {
      select.disabled = false;
      select.style.opacity = '';
    });
    
    AppState.filtersInitialized = true;
    
  } catch (error) {
    console.error('Failed to initialize filters:', error);
    
    // Remove loading state and provide fallback
    const filterSelects = document.querySelectorAll('.filter-select');
    filterSelects.forEach(select => {
      select.disabled = false;
      select.style.opacity = '';
    });
  }
}

/**
 * Initialize the Options-First toggle UI component
 */
function initializeOptionsFirstToggle() {
  // Find or create the toggle container
  let toggleContainer = document.getElementById('options-first-toggle');
  
  if (!toggleContainer) {
    // Create the toggle container
    toggleContainer = document.createElement('div');
    toggleContainer.id = 'options-first-toggle';
    toggleContainer.className = 'options-first-toggle';
    
    // Find the best place to insert it (after filters)
    const filtersContainer = document.querySelector('.filters-container, .hero-filters');
    if (filtersContainer) {
      filtersContainer.insertAdjacentElement('afterend', toggleContainer);
    } else {
      // Fallback: add to active filters area
      const activeFilters = document.getElementById('activeFilters');
      if (activeFilters) {
        activeFilters.insertAdjacentElement('beforebegin', toggleContainer);
      }
    }
  }
  
  // Create toggle HTML
  toggleContainer.innerHTML = createOptionsFirstToggleHTML();
  
  // Add event listener
  const checkbox = toggleContainer.querySelector('#showAllGamesToggle');
  if (checkbox) {
    checkbox.addEventListener('change', handleOptionsFirstToggle);
    
    // Set initial state
    checkbox.checked = AppState.filters.showAll;
    
    // Update the label with current stats
    updateToggleLabel();
  }
}

/**
 * Create HTML for the Options-First toggle
 */
function createOptionsFirstToggleHTML() {
  return `
    <div class="toggle-container">
      <label class="toggle-label" for="showAllGamesToggle">
        <input 
          type="checkbox" 
          id="showAllGamesToggle" 
          class="toggle-checkbox"
          ${AppState.filters.showAll ? 'checked' : ''}
        >
        <span class="toggle-slider"></span>
        <span class="toggle-text" id="toggleText">
          Show games without launch options
        </span>
        <span class="toggle-stats" id="toggleStats">
          ${getToggleStatsText()}
        </span>
      </label>
      <div class="toggle-description">
        <span class="toggle-hint">
          ${AppState.filters.showAll 
            ? '✅ Showing all games in database' 
            : '🎯 Showing games with launch options (recommended)'
          }
        </span>
      </div>
    </div>
  `;
}

/**
 * Handle Options-First toggle changes
 */
function handleOptionsFirstToggle(event) {
  const isChecked = event.target.checked;
  
  console.log(`🎯 Options-First toggle changed: showAll=${isChecked}`);
  
  // Update app state
  AppState.filters.showAll = isChecked;
  AppState.filters.hasOptions = !isChecked; // Inverse relationship for clarity
  
  // Update UI feedback
  updateToggleLabel();
  
  // Trigger search with new parameters
  const newFilters = {
    ...AppState.filters,
    showAll: isChecked,
    hasOptions: !isChecked || undefined // Don't send hasOptions when showAll is true
  };
  
  // Reset to first page when changing strategy
  AppState.currentPage = 1;
  
  // Execute search
  handleFilterChange(newFilters, 'options-strategy-change');
}

/**
 * Update toggle label with current statistics
 */
function updateToggleLabel() {
  const toggleText = document.getElementById('toggleText');
  const toggleStats = document.getElementById('toggleStats');
  const toggleHint = document.querySelector('.toggle-hint');
  
  if (!toggleText || !toggleStats || !toggleHint) return;
  
  const stats = AppState.gameStats;
  const isShowingAll = AppState.filters.showAll;
  
  if (isShowingAll) {
    toggleStats.textContent = `(+${stats.withoutOptions} more games)`;
    toggleHint.innerHTML = '✅ Showing all games in database';
    toggleHint.className = 'toggle-hint showing-all';
  } else {
    toggleStats.textContent = `(${stats.withoutOptions} hidden)`;
    toggleHint.innerHTML = '🎯 Showing games with launch options (recommended)';
    toggleHint.className = 'toggle-hint options-first';
  }
}

/**
 * Get toggle statistics text
 */
function getToggleStatsText() {
  const stats = AppState.gameStats;
  if (AppState.filters.showAll) {
    return `(+${stats.withoutOptions} more games)`;
  } else {
    return `(${stats.withoutOptions} hidden)`;
  }
}

/**
 * Load page with Options-First strategy support
 */
async function loadPage(page = 1, replace = true, reason = 'search') {
  if (AppState.isLoading) return;
  
  AppState.isLoading = true;
  
  // Store scroll position before loading if user is interacting with content
  if (reason === 'launch-options-interaction' || reason === 'user-interaction') {
    storeScrollPosition();
    AppState.preventNextScroll = true;
  }
  
  showLoadingState(replace);

  try {
    // Query parameters with Options-First strategy
    const queryParams = {
      page,
      limit: PAGE_SIZE,
      search: AppState.filters.search || '',
      category: AppState.filters.category || '',
      developer: AppState.filters.developer || '',
      options: AppState.filters.options || '',
      year: AppState.filters.year || '',
      sort: AppState.filters.sort || 'total_options_count', // NEW DEFAULT
      order: AppState.filters.order || 'desc', // NEW DEFAULT
      
      // Options-First parameters
      hasOptions: AppState.filters.showAll ? undefined : AppState.filters.hasOptions,
      showAll: AppState.filters.showAll || undefined
    };

    console.log('🎯 Loading page with Options-First strategy:', {
      page,
      hasOptions: queryParams.hasOptions,
      showAll: queryParams.showAll,
      reason
    });

    const response = await fetchGames(queryParams);
    
    // Update application state
    AppState.currentPage = page;
    AppState.totalPages = response.totalPages || 0;
    
    // Update game statistics
    if (response.stats) {
      AppState.gameStats = response.stats;
      updateToggleLabel(); // Update toggle with fresh stats
    }

    // Update UI with smooth transitions
    updateResultsCount(response.total || 0, response.stats);
    clearResults();
    
    // Table rendering with empty state support
    if (response.games?.length > 0) {
      renderTable(response.games || [], false);
    } else {
      // Empty state with Options-First context
      renderEmptyState(AppState.filters, AppState.gameStats);
    }
    
    renderPagination(AppState.currentPage, AppState.totalPages, loadPage);
    updateURL();

    // Feedback logic
    if (response.games?.length > 0) {
      if (reason !== 'launch-options-interaction') {
        const strategyInfo = response.meta?.showingOptionsOnly ? ' (with launch options)' : '';
        showSuccessFeedback(`Loaded ${response.games.length} games${strategyInfo}`);
      }
    }

    // Handle scroll restoration
    if (AppState.preventNextScroll) {
      restoreScrollPosition();
    }

  } catch (error) {
    console.error('Error loading page:', error);
    showErrorState(error.message);
    AppState.preventNextScroll = false;
  } finally {
    AppState.isLoading = false;
    hideLoadingState();
  }
}

/**
 * Results count with strategy information
 */
function updateResultsCount(total, stats) {
  const resultsCount = document.getElementById('resultsCount');
  if (resultsCount) {
    let resultText = `${total} result${total !== 1 ? 's' : ''} found`;
    
    // Add strategy context
    if (stats && !AppState.filters.showAll) {
      resultText += ` • ${stats.withoutOptions} without options hidden`;
    }
    
    resultsCount.textContent = resultText;
  }
}

/**
 * URL management with Options-First parameters
 */
function updateURL() {
  const params = new URLSearchParams();

  Object.entries(AppState.filters).forEach(([key, value]) => {
    if (value && value.toString().trim()) {
      // Handle boolean parameters properly
      if (key === 'showAll' && value === true) {
        params.set(key, 'true');
      } else if (key === 'hasOptions' && AppState.filters.showAll) {
        // Don't include hasOptions when showAll is true
        return;
      } else if (typeof value === 'boolean') {
        if (value !== false) { // Only include non-default boolean values
          params.set(key, value.toString());
        }
      } else {
        params.set(key, value);
      }
    }
  });

  if (AppState.currentPage > 1) {
    params.set('page', AppState.currentPage);
  }

  const newURL = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
  window.history.replaceState(null, '', newURL);
}

/**
 * URL parameter parsing with Options-First defaults
 */
function parseURLParams() {
  const params = new URLSearchParams(window.location.search);

  AppState.currentPage = parseInt(params.get('page')) || 1;
  
  // Parse Options-First parameters
  const showAll = params.get('showAll') === 'true';
  const hasOptions = params.get('hasOptions') !== 'false'; // Default true
  
  AppState.filters = {
    search: params.get('search') || '',
    category: params.get('category') || '',
    developer: params.get('developer') || '', 
    options: params.get('options') || '',
    year: params.get('year') || '',
    sort: params.get('sort') || 'total_options_count', 
    order: params.get('order') || 'desc', 
    
    // Options-First strategy parameters
    showAll: showAll,
    hasOptions: showAll ? true : hasOptions // If showAll, hasOptions doesn't matter
  };
  
  console.log('🔗 Parsed URL with Options-First strategy:', {
    showAll: AppState.filters.showAll,
    hasOptions: AppState.filters.hasOptions
  });
}

// Keep existing helper functions with logging
function storeScrollPosition() {
  AppState.lastScrollPosition = window.pageYOffset || document.documentElement.scrollTop;
}

function restoreScrollPosition() {
  if (AppState.preventNextScroll) {
    setTimeout(() => {
      window.scrollTo(0, AppState.lastScrollPosition);
      AppState.preventNextScroll = false;
    }, 50);
  }
}

function showSuccessFeedback(message) {
  const resultsCount = document.getElementById('resultsCount');
  if (resultsCount) {
    resultsCount.style.color = 'var(--color-success)';
    resultsCount.style.fontWeight = 'var(--font-weight-semibold)';
    
    setTimeout(() => {
      resultsCount.style.color = '';
      resultsCount.style.fontWeight = '';
    }, 2000);
  }
}

function showLoadingState(clearContent = false) {
  const tableContainer = document.getElementById('table-container');
  if (tableContainer && clearContent) {
    if (!AppState.preventNextScroll) {
      tableContainer.innerHTML = `
        <div class="loading">
          <div class="spinner"></div>
          <span>Loading games...</span>
        </div>
      `;
    }
  }
  
  const formElements = document.querySelectorAll('.filter-select, .sort-select');
  formElements.forEach(el => {
    el.disabled = true;
    el.style.opacity = '0.6';
  });
}

function hideLoadingState() {
  const loadingElements = document.querySelectorAll('.loading');
  loadingElements.forEach(el => el.remove());
  
  const formElements = document.querySelectorAll('.filter-select, .sort-select');
  formElements.forEach(el => {
    el.disabled = false;
    el.style.opacity = '';
  });
}

function showErrorState(message) {
  const tableContainer = document.getElementById('table-container');
  if (tableContainer) {
    tableContainer.innerHTML = `
      <div class="error">
        <h3>❌ Error Loading Games</h3>
        <p>${message}</p>
        <button onclick="location.reload()" class="retry-btn">
          🔄 Try Again
        </button>
      </div>
    `;
  }
}

function clearResults() {
  const tableContainer = document.getElementById('table-container');
  if (tableContainer) {
    tableContainer.innerHTML = '';
  }
  
  const existingPagination = document.querySelector('.pagination-container');
  if (existingPagination) {
    existingPagination.remove();
  }
}

/**
 * Filter change handling with Options-First support
 */
function handleFilterChange(newFilters, reason = 'user-filter') {
  console.log('🎯 Filter change with Options-First strategy:', newFilters, reason);
  
  // Determine if this is likely a user interaction with launch options
  const isLaunchOptionsInteraction = document.querySelector('.launch-options-row[style*="table-row"]') !== null;
  
  if (isLaunchOptionsInteraction && reason !== 'options-strategy-change') {
    reason = 'launch-options-interaction';
  }
  
  // Update app state
  AppState.filters = { ...AppState.filters, ...newFilters };
  AppState.currentPage = 1; // Reset to first page on filter change
  
  // Load new results with context
  loadPage(1, true, reason);
}

/**
 * Search component initialization with Options-First support
 */
function initializeSearchComponent() {
  const container = document.querySelector('.search-container, .hero-search');
  if (!container) {
    console.error('Search container not found in DOM');
    return null;
  }

  try {
    const searchConfig = {
      inputId: 'searchInput',
      suggestionsId: 'suggestionsDropdown', 
      resultsId: 'resultsList',
      resultsCountId: 'resultsCount',
      activeFiltersId: 'activeFilters',
      sortId: 'sortSelect',
      filters: {
        category: 'categoryFilter',
        developer: 'developerFilter', 
        options: 'optionsFilter',
        year: 'yearFilter'
      }
    };

    const searchInstance = new SlopSearch(searchConfig);
    
    // Configuration for Options-First strategy
    searchInstance.configure({
      suggestionsDelay: 150,
      searchDelay: 800,
      minCharsForSearch: 3,
      enableSearchOnEnter: true,
      enableProgressiveDebounce: true,
      enableClickOutsideSearch: true,
      prioritizeOptionsInSuggestions: true // Prioritize games with options in suggestions
    });
    
    // Set the callback for filter changes
    searchInstance.onFilterChange = handleFilterChange;
    
    return searchInstance;
  } catch (error) {
    console.error('Failed to initialize search component:', error);
    return null;
  }
}

function setupScrollTracking() {
  let scrollTimer;
  window.addEventListener('scroll', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      if (!AppState.isLoading && !AppState.preventNextScroll) {
        AppState.lastScrollPosition = window.pageYOffset || document.documentElement.scrollTop;
      }
    }, 100);
  });
  
  document.addEventListener('click', (e) => {
    if (e.target.closest('.launch-options-btn')) {
      storeScrollPosition();
    }
  });
}

function populateFilterDropdown(elementId, data, defaultText) {
  const selectElement = document.getElementById(elementId);
  if (!selectElement) {
    console.warn(`Filter element ${elementId} not found`);
    return;
  }
  
  const currentValue = selectElement.value;
  selectElement.innerHTML = '';
  
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = defaultText;
  selectElement.appendChild(defaultOption);
  
  if (Array.isArray(data) && data.length > 0) {
    data.forEach(item => {
      const option = document.createElement('option');
      
      if (typeof item === 'string') {
        option.value = item;
        option.textContent = item;
      } else if (item && typeof item === 'object') {
        option.value = item.value || item.name || item;
        const count = item.count ? ` (${item.count})` : '';
        option.textContent = `${item.value || item.name || item}${count}`;
      }
      
      selectElement.appendChild(option);
    });
    
    if (currentValue && [...selectElement.options].some(opt => opt.value === currentValue)) {
      selectElement.value = currentValue;
    }
  }
}

function populateYearFilter(releaseYears) {
  const yearFilter = document.getElementById('yearFilter');
  if (!yearFilter) return;
  
  const currentValue = yearFilter.value;
  yearFilter.innerHTML = '';
  
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'All Years';
  yearFilter.appendChild(defaultOption);
  
  if (Array.isArray(releaseYears) && releaseYears.length > 0) {
    const years = releaseYears
      .map(year => parseInt(year, 10))
      .filter(year => !isNaN(year) && year > 1990 && year <= new Date().getFullYear() + 1)
      .sort((a, b) => b - a);
    
    const uniqueYears = [...new Set(years)];
    
    uniqueYears.forEach(year => {
      const option = document.createElement('option');
      option.value = year.toString();
      option.textContent = year.toString();
      yearFilter.appendChild(option);
    });
    
    if (currentValue && [...yearFilter.options].some(opt => opt.value === currentValue)) {
      yearFilter.value = currentValue;
    }
  }
}

function populateOptionsFilter() {
  const optionsFilter = document.getElementById('optionsFilter');
  if (!optionsFilter) return;
  
  const currentValue = optionsFilter.value;
  optionsFilter.innerHTML = '';
  
  const optionsData = [
    { value: '', label: 'Any Options' },
    { value: 'has-options', label: 'Has Launch Options' },
    { value: 'no-options', label: 'No Launch Options' },
    { value: 'many-options', label: '5+ Launch Options' },
    { value: 'few-options', label: '1-4 Launch Options' },
    { value: 'performance', label: 'Performance Options' },
    { value: 'graphics', label: 'Graphics Options' }
  ];
  
  optionsData.forEach(item => {
    const option = document.createElement('option');
    option.value = item.value;
    option.textContent = item.label;
    optionsFilter.appendChild(option);
  });
  
  if (currentValue && [...optionsFilter.options].some(opt => opt.value === currentValue)) {
    optionsFilter.value = currentValue;
  }
}

/**
 * App initialization with Options-First strategy
 */
async function initializeApp() {
  try {
    console.log('🚀 Initializing Vanilla Slops with Options-First strategy');
    
    // Parse URL params first (with new defaults)
    parseURLParams();
    
    // Initialize components in sequence
    AppState.searchInstance = initializeSearchComponent();
    setupThemeToggle();
    setupScrollTracking();
    
    // Initialize filters (including Options-First toggle)
    await initializeFilters();
    
    // Apply URL params to search component
    if (AppState.searchInstance && Object.keys(AppState.filters).some(key => AppState.filters[key])) {
      if (AppState.filters.search && AppState.searchInstance.searchInput) {
        AppState.searchInstance.searchInput.value = AppState.filters.search;
        AppState.searchInstance.currentQuery = AppState.filters.search;
      }
      
      Object.entries(AppState.filters).forEach(([key, value]) => {
        if (value && AppState.searchInstance.filterElements[key]) {
          AppState.searchInstance.filterElements[key].value = value;
          AppState.searchInstance.currentFilters[key] = value;
        }
      });
      
      if (AppState.filters.sort) {
        AppState.searchInstance.currentSort = AppState.filters.sort;
      }
      if (AppState.filters.order) {
        AppState.searchInstance.currentOrder = AppState.filters.order;
      }
      
      AppState.searchInstance.renderActiveFilters();
    }
    
    // Preload popular content
    preloadPopularContent().catch(err => 
      console.warn('Failed to preload popular content:', err)
    );
    
    // Load initial page with Options-First strategy
    await loadPage(AppState.currentPage, true, 'initial-load');
    
    document.body.classList.add('app-ready');
    
    console.log('✅ Vanilla Slops initialized with Options-First strategy');
    console.log('🎯 Current strategy:', {
      showAll: AppState.filters.showAll,
      hasOptions: AppState.filters.hasOptions
    });
    
  } catch (error) {
    console.error('Failed to initialize app:', error);
    showErrorState('Failed to initialize application. Please refresh the page.');
  }
}

function setupEventListeners() {
  window.addEventListener('popstate', () => {
    parseURLParams();
    loadPage(AppState.currentPage, true, 'navigation');
  });
}

function ensureRequiredDOMElements() {
  let appContainer = document.getElementById('app');
  if (!appContainer) {
    appContainer = document.createElement('div');
    appContainer.id = 'app';
    document.body.appendChild(appContainer);
  }

  let tableContainer = document.getElementById('table-container');
  if (!tableContainer) {
    tableContainer = document.createElement('div');
    tableContainer.id = 'table-container';
    appContainer.appendChild(tableContainer);
  }

  let resultsCount = document.getElementById('resultsCount');
  if (!resultsCount) {
    resultsCount = document.createElement('div');
    resultsCount.id = 'resultsCount';
    resultsCount.className = 'results-count';
    appContainer.insertBefore(resultsCount, tableContainer);
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  ensureRequiredDOMElements();
  setupEventListeners();
  initializeApp();
});

export { handleFilterChange };