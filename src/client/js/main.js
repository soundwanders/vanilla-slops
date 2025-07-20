import { fetchGames, preloadPopularContent, fetchGameStatistics} from './api.js';
import { renderTable } from './ui/table.js';
import { setupThemeToggle } from './ui/theme.js';
import { renderPagination } from './ui/pagination.js';
import SlopSearch from './ui/search.js';

const PAGE_SIZE = 20;

/**
 * Centralized application state management
 */
const AppState = {
  currentPage: 1,
  isLoading: false,  
  filters: {
    hasOptions: true, 
    showAll: false 
  },
  totalPages: 0,
  searchInstance: null,
  filtersInitialized: false,
  lastScrollPosition: 0, 
  preventNextScroll: false 
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
    const response = await fetch('/api/games/facets');
    if (!response.ok) {
      throw new Error(`Failed to fetch facets: ${response.status}`);
    }
    
    const facets = await response.json();
    
    // Populate each filter dropdown
    populateFilterDropdown('developerFilter', facets.developers, 'All Developers');
    populateFilterDropdown('categoryFilter', facets.genres, 'All Categories');
    populateYearFilter(facets.releaseYears);
    populateOptionsFilter();
    
    // Remove loading state
    filterSelects.forEach(select => {
      select.disabled = false;
      select.style.opacity = '';
    });
    
    AppState.filtersInitialized = true;

    addShowAllGamesFilter();''
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

async function addShowAllGamesFilter() {
  console.log('🔧 Adding Show All Games filter...');
  
  const filtersContainer = document.querySelector('.filters-container fieldset, .filters-container');
  if (!filtersContainer) {
    console.error('❌ Filters container not found');
    return;
  }
  
  const existingFilter = filtersContainer.querySelector('.show-all-filter');
  if (existingFilter) {
    existingFilter.remove();
  }
  
  const filterGroup = document.createElement('div');
  filterGroup.className = 'filter-group show-all-filter';
  
  // FETCH REAL STATISTICS using api.js function
  const currentFilters = {
    search: AppState.filters?.search || '',
    developer: AppState.filters?.developer || '',
    category: AppState.filters?.category || '',
    year: AppState.filters?.year || ''
  };
  
  try {
    console.log('📊 Fetching real statistics for filter...');
    const stats = await fetchGameStatistics(currentFilters);
    
    // Update AppState with real statistics
    AppState.gameStats = {
      withOptions: stats.withOptions,
      withoutOptions: stats.withoutOptions,
      total: stats.total,
      percentageWithOptions: stats.percentageWithOptions
    };
    
    console.log('📈 Using real statistics:', stats);
  } catch (error) {
    console.error('Failed to fetch statistics, using fallback:', error);
    // Fallback statistics if API fails
    AppState.gameStats = { withOptions: 146, withoutOptions: 129, total: 275, percentageWithOptions: 53.1 };
  }
  
  const stats = AppState.gameStats;
  const isShowingAll = AppState.filters?.showAll || false;
  
  // Create the filter HTML with real numbers
  filterGroup.innerHTML = `
    <label class="filter-label" for="showAllGamesFilter">Show All Games</label>
    <input 
      type="checkbox" 
      id="showAllGamesFilter" 
      class="show-all-checkbox"
      ${isShowingAll ? 'checked' : ''}
      aria-describedby="showAllGamesHelp"
    >
    <label for="showAllGamesFilter" class="show-all-checkbox-container ${isShowingAll ? 'checked' : ''}">
      <span class="custom-checkbox" aria-hidden="true"></span>
      <span class="checkbox-label-text">Include games without launch options</span>
      <span class="checkbox-stats" id="showAllStats">
        ${isShowingAll ? `+${stats.withoutOptions}` : `${stats.withoutOptions} hidden`}
      </span>
    </label>
    <div id="showAllGamesHelp" class="sr-only">
      ${isShowingAll ? `Currently showing all ${stats.total} games` : `Currently showing ${stats.withOptions} games with launch options`}
    </div>
  `;
  
  filtersContainer.appendChild(filterGroup);
  
  const checkbox = filterGroup.querySelector('#showAllGamesFilter');
  const container = filterGroup.querySelector('.show-all-checkbox-container');
  
  if (checkbox && container) {
    checkbox.addEventListener('click', function(e) {
      console.log('🖱️ CHECKBOX CLICKED!', {
        checked: e.target.checked,
        timestamp: new Date().toISOString()
      });
    });
    
    checkbox.addEventListener('change', handleShowAllFilterChange);
    
    container.addEventListener('click', (e) => {
      if (e.target === checkbox) return;
      
      console.log('📱 CONTAINER CLICKED!');
      checkbox.checked = !checkbox.checked;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    });
    
    console.log('✅ Show All Games filter added with real statistics');
    
  } else {
    console.error('❌ Failed to set up Show All Games filter event listeners');
  }
}

// Refresh filter statistics periodically
/** * Refreshes the filter statistics based on current AppState filters
 *  * This function is called periodically to keep the UI in sync with the latest data
 * * @returns {Promise<void>} 
 * */
async function refreshFilterStatistics() {
  try {
    const currentFilters = {
      search: AppState.filters?.search || '',
      developer: AppState.filters?.developer || '',
      category: AppState.filters?.category || '',
      year: AppState.filters?.year || ''
    };
    
    console.log('🔄 Refreshing filter statistics...');
    const stats = await fetchGameStatistics(currentFilters);
    AppState.gameStats = stats;
    
    // Update the filter display
    updateShowAllFilterStats(stats);
    
    console.log('📊 Refreshed filter statistics:', stats);
  } catch (error) {
    console.error('Failed to refresh statistics:', error);
  }
}

/**
 * Sync the Show All filter checkbox with the current AppState
 * Ensures the UI always reflects the actual filter state
 */
function syncShowAllCheckboxWithState() {
  const checkbox = document.getElementById('showAllGamesFilter');
  const container = document.querySelector('.show-all-checkbox-container');
  
  if (!checkbox) {
    // Checkbox hasn't been created yet, skip sync
    return;
  }
  
  const currentAppState = AppState.filters?.showAll === true;
  const currentCheckboxState = checkbox.checked;
  
  console.log('🔄 Syncing checkbox with AppState:', {
    appStateShowAll: currentAppState,
    checkboxChecked: currentCheckboxState,
    needsSync: currentAppState !== currentCheckboxState
  });
  
  // Only update if there's a mismatch
  if (currentCheckboxState !== currentAppState) {
    console.log(`🔧 Syncing checkbox: ${currentCheckboxState} → ${currentAppState}`);
    
    checkbox.checked = currentAppState;
    updateShowAllFilterUI(currentAppState, container);
    
    console.log('✅ Checkbox synced with AppState');
  } else {
    console.log('✅ Checkbox already in sync');
  }
}

/**
 * Handle changes to the Show All Games filter
 */
function handleShowAllFilterChange(event) {
  const isChecked = event.target.checked;
  const container = document.querySelector('.show-all-checkbox-container');
  
  console.log(`🎯 Show All Games filter changed: ${isChecked ? 'SHOW ALL' : 'OPTIONS-FIRST'}`);
  console.log('📋 Event details:', {
    checked: isChecked,
    target: event.target.id,
    container: container ? 'found' : 'not found'
  });
  
  // Update visual state FIRST
  updateShowAllFilterUI(isChecked, container);
  
  // Update AppState
  AppState.filters = AppState.filters || {};
  AppState.filters.showAll = isChecked;
  
  if (isChecked) {
    // Show all games - remove hasOptions filter
    AppState.filters.hasOptions = undefined;
  } else {
    // Options-First mode - only show games with options
    AppState.filters.hasOptions = true;
  }
  
  AppState.currentPage = 1; // Reset to first page
  
  // Create new filters object
  const newFilters = {
    search: AppState.filters?.search || '',
    category: AppState.filters?.category || '',
    developer: AppState.filters?.developer || '',
    options: AppState.filters?.options || '',
    year: AppState.filters?.year || '',
    sort: AppState.filters?.sort || 'total_options_count',
    order: AppState.filters?.order || 'desc',
    showAll: isChecked,
    hasOptions: isChecked ? undefined : true
  };
  
  console.log('🔄 New filter state:', newFilters);
  
  // Trigger filter change through the existing system
  handleFilterChange(newFilters, 'show-all-filter-change');
}

/** Handle Show All Games filter change */
function updateShowAllFilterUI(isChecked, container) {
  const stats = AppState.gameStats || { withOptions: 146, withoutOptions: 129, total: 275 };
  
  console.log(`📊 Updating UI: ${isChecked ? 'CHECKED' : 'UNCHECKED'}`, {
    container: container ? 'found' : 'not found',
    stats: stats
  });
  
  // Find elements if container wasn't passed
  if (!container) {
    container = document.querySelector('.show-all-checkbox-container');
  }
  
  const statsElement = document.querySelector('#showAllStats');
  const helpElement = document.getElementById('showAllGamesHelp');
  const checkbox = document.getElementById('showAllGamesFilter');
  
  // Update checkbox state (in case it's out of sync)
  if (checkbox && checkbox.checked !== isChecked) {
    checkbox.checked = isChecked;
    console.log('🔄 Synced checkbox state:', isChecked);
  }
  
  // Update container styling
  if (container) {
    if (isChecked) {
      container.classList.add('checked');
    } else {
      container.classList.remove('checked');
    }
    console.log('✅ Updated container classes');
  }
  
  // Update stats text
  if (statsElement) {
    const newText = isChecked ? `+${stats.withoutOptions}` : `${stats.withoutOptions} hidden`;
    statsElement.textContent = newText;
    console.log('📊 Updated stats text:', newText);
  }
  
  // Update accessibility description
  if (helpElement) {
    const newHelp = isChecked 
      ? 'Currently showing all games including those without launch options'
      : 'Currently showing only games with launch options';
    helpElement.textContent = newHelp;
    console.log('♿ Updated help text');
  }
  
  console.log(`✅ UI update complete: ${isChecked ? 'showing all' : 'options only'}`);
}

/**
 * Update the filter when statistics change (called from main app)
 */
function updateShowAllFilterStats(newStats) {
  if (!newStats) return;
  
  // Update AppState with new statistics
  AppState.gameStats = { ...AppState.gameStats, ...newStats };
  
  const checkbox = document.getElementById('showAllGamesFilter');
  const container = document.querySelector('.show-all-checkbox-container');
  
  if (checkbox && container) {
    updateShowAllFilterUI(checkbox.checked, container);
    console.log('📊 Show All filter stats updated:', newStats);
  }
}

/**
 * Populate a filter dropdown with data from the API
 */
function populateFilterDropdown(elementId, data, defaultText) {
  const selectElement = document.getElementById(elementId);
  if (!selectElement) {
    console.warn(`Filter element ${elementId} not found`);
    return;
  }
  
  // Store current value
  const currentValue = selectElement.value;
  
  // Clear existing options
  selectElement.innerHTML = '';
  
  // Add default option
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = defaultText;
  selectElement.appendChild(defaultOption);
  
  // Add data options
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
    
    // Restore previous value if it still exists
    if (currentValue && [...selectElement.options].some(opt => opt.value === currentValue)) {
      selectElement.value = currentValue;
    }
  }
}

/**
 * Populate year filter with extracted years
 */
function populateYearFilter(releaseYears) {
  const yearFilter = document.getElementById('yearFilter');
  if (!yearFilter) return;
  
  const currentValue = yearFilter.value;
  yearFilter.innerHTML = '';
  
  // Add default option
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'All Years';
  yearFilter.appendChild(defaultOption);
  
  if (Array.isArray(releaseYears) && releaseYears.length > 0) {
    // Extract and sort years
    const years = releaseYears
      .map(year => parseInt(year, 10))
      .filter(year => !isNaN(year) && year > 1990 && year <= new Date().getFullYear() + 1)
      .sort((a, b) => b - a);
    
    // Remove duplicates
    const uniqueYears = [...new Set(years)];
    
    uniqueYears.forEach(year => {
      const option = document.createElement('option');
      option.value = year.toString();
      option.textContent = year.toString();
      yearFilter.appendChild(option);
    });
    
    // Restore value
    if (currentValue && [...yearFilter.options].some(opt => opt.value === currentValue)) {
      yearFilter.value = currentValue;
    }
  }
}

/**
 * Populate options filter with predefined options
 */
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
  
  // Restore value
  if (currentValue && [...optionsFilter.options].some(opt => opt.value === currentValue)) {
    optionsFilter.value = currentValue;
  }
}

/**
 * Store current scroll position before page operations
 */
function storeScrollPosition() {
  AppState.lastScrollPosition = window.pageYOffset || document.documentElement.scrollTop;
}

/**
 * Restore scroll position with debouncing
 */
function restoreScrollPosition() {
  if (AppState.preventNextScroll) {
    // Restore the previous scroll position instead of scrolling to top
    setTimeout(() => {
      window.scrollTo(0, AppState.lastScrollPosition);
      AppState.preventNextScroll = false;
    }, 50);
  }
}

/**
 * Load page with games data - called by search component
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
    const queryParams = {
      page,
      limit: PAGE_SIZE,
      search: AppState.filters.search || '',
      category: AppState.filters.category || '',
      developer: AppState.filters.developer || '',
      options: AppState.filters.options || '',
      year: AppState.filters.year || '',
      sort: AppState.filters.sort || 'title',
      order: AppState.filters.order || 'asc',
      hasOptions: AppState.filters.hasOptions,
      showAll: AppState.filters.showAll
    };

    console.log('🔍 Loading with filters:', {
      hasOptions: queryParams.hasOptions,
      showAll: queryParams.showAll,
      mode: queryParams.showAll ? 'SHOW ALL' : 'OPTIONS-FIRST'
    });
    console.log('🔍 Loading with filters:', {
      hasOptions: queryParams.hasOptions,
      showAll: queryParams.showAll,
      mode: queryParams.showAll ? 'SHOW ALL' : 'OPTIONS-FIRST'
    });

    const response = await fetchGames(queryParams);
    
    // Update application state
    AppState.currentPage = page;
    AppState.totalPages = response.totalPages || 0;

    // Update UI with smooth transitions
    updateResultsCount(response.total || 0);
    clearResults();
    renderTable(response.games || [], false);
    renderPagination(AppState.currentPage, AppState.totalPages, loadPage);

    updateURL();

    // Sync the Show All checkbox with the current state
    syncShowAllCheckboxWithState();
    
    await refreshFilterStatistics();

    // Feedback logic
    if (response.games?.length > 0) {
      if (reason !== 'launch-options-interaction') {
        showSuccessFeedback(`Loaded ${response.games.length} games`);
      }
    }

    // Handle scroll restoration
    if (AppState.preventNextScroll) {
      restoreScrollPosition();
    }
  } catch (error) {
    console.error('Error loading page:', error);
    showErrorState(error.message);
    AppState.preventNextScroll = false; // Reset flag on error
  } finally {
    AppState.isLoading = false;
    hideLoadingState();
  }
}

/**
 * Show subtle success feedback
 */
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

/**
 * Loading state with UX
 */
function showLoadingState(clearContent = false) {
  const tableContainer = document.getElementById('table-container');
  if (tableContainer && clearContent) {
    // Only show loading spinner for actual searches, not interactions
    if (!AppState.preventNextScroll) {
      tableContainer.innerHTML = `
        <div class="loading">
          <div class="spinner"></div>
          <span>Loading games...</span>
        </div>
      `;
    }
  }
  
  // Disable form elements during loading (but not search input - handled by search component)
  const formElements = document.querySelectorAll('.filter-select, .sort-select');
  formElements.forEach(el => {
    el.disabled = true;
    el.style.opacity = '0.6';
  });
}

/**
 * Hide loading state and re-enable UI
 */
function hideLoadingState() {
  const loadingElements = document.querySelectorAll('.loading');
  loadingElements.forEach(el => el.remove());
  
  // Re-enable form elements
  const formElements = document.querySelectorAll('.filter-select, .sort-select');
  formElements.forEach(el => {
    el.disabled = false;
    el.style.opacity = '';
  });
}

/**
 * Error state
 */
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

function updateResultsCount(total) {
  const resultsCount = document.getElementById('resultsCount');
  if (resultsCount) {
    resultsCount.textContent = `${total} result${total !== 1 ? 's' : ''} found`;
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

function updateURL() {
  const params = new URLSearchParams();

  Object.entries(AppState.filters).forEach(([key, value]) => {
    if (value && value.toString().trim()) {
      params.set(key, value);
    }
  });

  if (AppState.currentPage > 1) {
    params.set('page', AppState.currentPage);
  }

  const newURL = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
  window.history.replaceState(null, '', newURL);
}

function parseURLParams() {
  const params = new URLSearchParams(window.location.search);

  AppState.currentPage = parseInt(params.get('page')) || 1;
  
  AppState.filters = {
    search: params.get('search') || '',
    category: params.get('category') || '',
    developer: params.get('developer') || '', 
    options: params.get('options') || '',
    year: params.get('year') || '',
    sort: params.get('sort') || 'title',
    order: params.get('order') || 'asc',
    showAll: params.get('showAll') === 'true',  // Only true if explicitly set
    hasOptions: params.get('showAll') === 'true' ? undefined : true  // Options-First unless showAll
  };
}

/**
 * Handle filter changes from search component - SINGLE SOURCE OF TRUTH
 * This is called by the search component when filters change
 */
function handleFilterChange(newFilters, reason = 'user-filter') {
  // Determine if this is likely a user interaction with launch options
  const isLaunchOptionsInteraction = document.querySelector('.launch-options-row[style*="table-row"]') !== null;
  
  if (isLaunchOptionsInteraction) {
    // User is viewing launch options, preserve their scroll position
    reason = 'launch-options-interaction';
  }
  
  // Update app state
  AppState.filters = { ...AppState.filters, ...newFilters };
  AppState.currentPage = 1; // Reset to first page on filter change
  
  // Load new results with context
  loadPage(1, true, reason);
}

/**
 * Initialize search component
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
    
    searchInstance.configure({
      suggestionsDelay: 150,        // Keep suggestions fast and responsive
      searchDelay: 800,             // Much slower main search (was 300ms)
      minCharsForSearch: 3,         // Only search after 3 characters
      enableSearchOnEnter: true,    // Allow Enter key for immediate search
      enableProgressiveDebounce: true, // Longer delays for rapid typing
      enableClickOutsideSearch: true   // Search when clicking outside (now with safe zones)
    });
    
    // Set the callback for filter changes - THIS IS THE ONLY SEARCH LISTENER
    searchInstance.onFilterChange = handleFilterChange;
    
    return searchInstance;
  } catch (error) {
    console.error('Failed to initialize search component:', error);
    return null;
  }
}

/**
 * Scroll position preservation / tracking
 */
function setupScrollTracking() {
  // Track scroll position changes
  let scrollTimer;
  window.addEventListener('scroll', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      if (!AppState.isLoading && !AppState.preventNextScroll) {
        AppState.lastScrollPosition = window.pageYOffset || document.documentElement.scrollTop;
      }
    }, 100);
  });
  
  // Track when users click on launch options buttons
  document.addEventListener('click', (e) => {
    if (e.target.closest('.launch-options-btn')) {
      // User is about to interact with launch options, store position
      storeScrollPosition();
    }
  });
}

/**
 * App initialization
 */
async function initializeApp() {
  try {
    // Parse URL params first
    parseURLParams();
    
    // Initialize components in sequence
    AppState.searchInstance = initializeSearchComponent();
    setupThemeToggle();
    setupScrollTracking(); // Set up scroll position tracking

    // Initialize filters before loading data
    await initializeFilters();
    
    // Apply URL params to search component if it exists and has values
    if (AppState.searchInstance && Object.keys(AppState.filters).some(key => AppState.filters[key])) {
      // Set the search input value from URL
      if (AppState.filters.search && AppState.searchInstance.searchInput) {
        AppState.searchInstance.searchInput.value = AppState.filters.search;
        AppState.searchInstance.currentQuery = AppState.filters.search;
      }
      
      // Set filter values from URL
      Object.entries(AppState.filters).forEach(([key, value]) => {
        if (value && AppState.searchInstance.filterElements[key]) {
          AppState.searchInstance.filterElements[key].value = value;
          AppState.searchInstance.currentFilters[key] = value;
        }
      });
      
      // Set sort values from URL
      if (AppState.filters.sort) {
        AppState.searchInstance.currentSort = AppState.filters.sort;
      }
      if (AppState.filters.order) {
        AppState.searchInstance.currentOrder = AppState.filters.order;
      }
      
      // Update active filters display
      AppState.searchInstance.renderActiveFilters();
    }
    
    // Preload popular content
    preloadPopularContent().catch(err => 
      console.warn('Failed to preload popular content:', err)
    );
    
    await loadPage(AppState.currentPage, true, 'initial-load');
    
    // Add visual feedback that app is ready
    document.body.classList.add('app-ready');
    
  } catch (error) {
    console.error('Failed to initialize app:', error);
    showErrorState('Failed to initialize application. Please refresh the page.');
  }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Browser navigation
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

  // Ensure results count element exists
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

// Export the handleFilterChange function for potential external use
export { handleFilterChange };