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
 * Fetches facets from the API and populates the filter dropdowns
 * It also handles loading states and error handling
 * * @returns {Promise<void>}
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
    populateFilterDropdown('engineFilter', facets.engines, 'All Engines'); 
    populateYearFilter(facets.releaseYears);
    populateOptionsFilter();
    
    // Remove loading state
    filterSelects.forEach(select => {
      select.disabled = false;
      select.style.opacity = '';
    });
    
    AppState.filtersInitialized = true;

    addShowAllGamesFilter();
  } catch (error) {
    console.error('Failed to initialize filters:', error);
    
    // Remove loading state and provide fallback
    const filterSelects = document.querySelectorAll('.filter-select');
    filterSelects.forEach(select => {
      select.disabled = false;
      select.style.opacity = '';
    });
    
    // Add fallback engine options if API fails
    populateEngineFilterWithDefaults();
  }
}

/**
 * Populate engine filter with default options if API fails
 * Provides useful default options before API data is loaded
 */
function populateEngineFilterWithDefaults() {
  const engineFilter = document.getElementById('engineFilter');
  if (!engineFilter) return;
  
  const currentValue = engineFilter.value;
  engineFilter.innerHTML = '';
  
  // Add default option
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'All Engines';
  engineFilter.appendChild(defaultOption);
  
  const commonEngines = [
    'Unity',
    'Unreal Engine',
    'Source Engine',
    'Creation Engine',
    'CryEngine',
    'Frostbite',
    'id Tech',
    'GameMaker',
    'Godot',
    'REDengine',
    'Custom Engine'
  ];
  
  commonEngines.forEach(engine => {
    const option = document.createElement('option');
    option.value = engine.toLowerCase().replace(/\s+/g, '-');
    option.textContent = engine;
    engineFilter.appendChild(option);
  });
  
  // Restore previous value if it exists
  if (currentValue && [...engineFilter.options].some(opt => opt.value === currentValue)) {
    engineFilter.value = currentValue;
  }
  
  console.log('Engine filter populated with default options');
}

/** Adds a "Show All Games" filter to the filters container
 * This filter allows users to toggle between showing all games
 * and only those with launch options
 * * @returns {Promise<void>}
 */

async function addShowAllGamesFilter() {
  console.log('🔧 Adding Show All Games filter...');
  
  const filtersContainer = document.querySelector('.filters-container fieldset, .filters-container');
  if (!filtersContainer) {
    console.error('❌ Filters container not found');
    return;
  }
  
  // Remove existing filter
  const existingFilter = filtersContainer.querySelector('.show-all-filter');
  if (existingFilter) {
    existingFilter.remove();
  }
  
  // Get statistics
  try {
    console.log('📊 Fetching real statistics for filter...');
    const stats = await fetchGameStatistics();
    AppState.gameStats = {
      withOptions: stats.withOptions,
      withoutOptions: stats.withoutOptions,
      total: stats.total,
      percentageWithOptions: stats.percentageWithOptions
    };
    console.log('📈 Using real statistics:', stats);
  } catch (error) {
    console.error('Failed to fetch statistics, using fallback:', error);
    AppState.gameStats = { withOptions: 146, withoutOptions: 129, total: 275 };
  }
  
  const stats = AppState.gameStats;
  const isShowingAll = AppState.filters?.showAll || false;
  
  // Create filter group with correct HTML structure for CSS
  const filterGroup = document.createElement('div');
  filterGroup.className = 'filter-group show-all-filter';
  
  // Create the HTML structure that matches our CSS selectors
  filterGroup.innerHTML = `
    <label class="filter-label" for="showAllGamesFilter">Show All Games</label>
    <input 
      type="checkbox" 
      id="showAllGamesFilter" 
      ${isShowingAll ? 'checked' : ''}
      aria-describedby="showAllGamesHelp"
    />
    <label for="showAllGamesFilter" class="show-all-checkbox-container">
      <span class="checkbox-label-text">Show All</span>
      <span class="checkbox-stats" id="showAllStats">
        ${isShowingAll ? `+${stats.withoutOptions}` : `${stats.withoutOptions} hidden`}
      </span>
    </label>
    <div id="showAllGamesHelp" class="sr-only">
      ${isShowingAll ? `Currently showing all ${stats.total} games` : `Currently showing ${stats.withOptions} games with launch options`}
    </div>
  `;
  
  filtersContainer.appendChild(filterGroup);
  
  // Add single event listener to the hidden checkbox
  const checkbox = filterGroup.querySelector('#showAllGamesFilter');
  if (checkbox) {
    checkbox.addEventListener('change', function(e) {
      console.log('🖱️ CHECKBOX CHANGED!', {
        checked: e.target.checked,
        timestamp: new Date().toISOString()
      });
      
      handleShowAllFilterChange(e);
    });
    
    console.log('✅ Show All Games filter added successfully');
    console.log('🔍 Checkbox state:', { 
      id: checkbox.id, 
      checked: checkbox.checked,
      hidden: checkbox.offsetParent === null 
    });
  } else {
    console.error('❌ Failed to find checkbox element');
  }
}

// Refresh filter statistics periodically
/** * Refreshes the filter statistics based on current AppState filters
 *  * This function is called periodically to keep the UI in sync with the latest data
 * * @returns {Promise<void>} 
 * */
async function refreshFilterStatistics() {
  try {
    // Use current AppState filters for statistics
    const currentFilters = {
      search: AppState.filters?.search || '',
      developer: AppState.filters?.developer || '',
      category: AppState.filters?.category || '',
      engine: AppState.filters?.engine || '', 
      year: AppState.filters?.year || ''
    };
    
    console.log('🔄 Refreshing filter statistics with current filters:', currentFilters);
    const stats = await fetchGameStatistics(currentFilters);
    
    AppState.gameStats = { ...AppState.gameStats, ...stats };
    
    updateShowAllFilterStats(stats);
    
    console.log('📊 Refreshed filter statistics:', stats);
    console.log('🔍 AppState.filters after stats refresh:', AppState.filters);
  } catch (error) {
    console.error('Failed to refresh statistics:', error);
  }
}

/**
 * Handle changes to the Show All Games filter
 * This function updates the AppState and UI based on the checkbox state
 * * @param {Event} event - The change event from the checkbox
 * * @returns {void}
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
  
  AppState.filters = AppState.filters || {};
  
  if (isChecked) {
    // Show All mode: show all games including those without options
    AppState.filters.showAll = true;
    AppState.filters.hasOptions = undefined;
    console.log('🌍 Switching to SHOW ALL mode');
  } else {
    // Options-First mode: show only games with options
    AppState.filters.showAll = false;
    AppState.filters.hasOptions = true;
    console.log('🎯 Switching to OPTIONS-FIRST mode');
  }
  
  AppState.currentPage = 1;
  
  console.log('🔄 New AppState.filters:', AppState.filters);
  
  updateURL();
  
  // Create filters object for API call
  const apiFilters = {
    search: AppState.filters?.search || '',
    category: AppState.filters?.category || '',
    developer: AppState.filters?.developer || '',
    options: AppState.filters?.options || '',
    year: AppState.filters?.year || '',
    sort: AppState.filters?.sort || 'title',
    order: AppState.filters?.order || 'asc',
    showAll: AppState.filters.showAll,
    hasOptions: AppState.filters.hasOptions
  };
  
  console.log('📡 API filters:', apiFilters);
  
  // Trigger filter change through the existing system
  handleFilterChange(apiFilters, 'show-all-filter-change');
}

/** Handle Show All Games filter change
 * This function updates the UI and AppState based on the checkbox state
 * * @param {boolean} isChecked 
 * * @param {HTMLElement|null} container 
 * * @returns {void}
 */
function updateShowAllFilterUI(isChecked, container = null) {
  const stats = AppState.gameStats || { withOptions: 146, withoutOptions: 129, total: 275 };
  
  console.log(`📊 Updating UI: ${isChecked ? 'CHECKED' : 'UNCHECKED'}`, {
    stats: stats
  });
  
  // Find elements if not provided
  const statsElement = document.querySelector('#showAllStats');
  const helpElement = document.getElementById('showAllGamesHelp');
  const checkbox = document.getElementById('showAllGamesFilter');
  
  // Update checkbox state
  if (checkbox && checkbox.checked !== isChecked) {
    checkbox.checked = isChecked;
    console.log('🔄 Synced checkbox state:', isChecked);
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
      ? `Currently showing all ${stats.total} games including those without launch options`
      : `Currently showing ${stats.withOptions} games with launch options`;
    helpElement.textContent = newHelp;
    console.log('♿ Updated help text');
  }
  
  console.log(`✅ UI update complete: ${isChecked ? 'showing all' : 'options only'}`);
}

/**
 * Sync checkbox with AppState
 */
function syncShowAllCheckboxWithState() {
  const checkbox = document.getElementById('showAllGamesFilter');
  if (!checkbox) {
    return; // Checkbox hasn't been created yet
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
    // The CSS will automatically handle the visual state change
    
    console.log('✅ Checkbox synced with AppState');
  } else {
    console.log('✅ Checkbox already in sync');
  }
}

/**
 * Update the filter when statistics change (called from main app)
 * This function updates the AppState and UI based on new statistics
 * * @param {Object} newStats - The new statistics object
 * * * @returns {void}
 */
function updateShowAllFilterStats(newStats) {
  if (!newStats) return;
  
  // Update AppState
  AppState.gameStats = { ...AppState.gameStats, ...newStats };
  
  const checkbox = document.getElementById('showAllGamesFilter');
  if (checkbox) {
    updateShowAllFilterUI(checkbox.checked);
    console.log('📊 Show All filter stats updated:', newStats);
  }
}

/**
 * Populate a filter dropdown with data from the API
 * This function handles both string and object data formats
 * * @param {string} elementId - The ID of the select element to populate
 * * @param {Array} data - The data to populate the dropdown with
 * * @param {string} defaultText - The default text for the dropdown
 * * * @returns {void}
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
 * This function creates a dropdown with various options
 * * @returns {void}
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
 * This function handles loading games based on filters, pagination, and user interactions
 * * @param {number} page - The page number to load (default is 1)
 * * @param {boolean} replace - Whether to replace the current page state (default is true)
 * * * @param {string} reason - The reason for loading the page (default is 'search')
 * * * @returns {Promise<void>} - Resolves when the page is loaded
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
      engine: AppState.filters.engine || '', // NEW ENGINE PARAM
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
      engine: queryParams.engine, // LOG ENGINE FILTER
      mode: queryParams.showAll ? 'SHOW ALL' : 'OPTIONS-FIRST'
    });

    const response = await fetchGames(queryParams);

    AppState.currentPage = page;
    AppState.totalPages = response.totalPages || 0;

    // Update UI
    updateResultsCount(response.total || 0);
    clearResults();
    renderTable(response.games || [], false);
    renderPagination(AppState.currentPage, AppState.totalPages, loadPage);
    
    const checkbox = document.getElementById('showAllGamesFilter');
    if (checkbox && checkbox.checked !== (AppState.filters?.showAll === true)) {
      console.log('🔄 Syncing checkbox with AppState (mismatch detected):', {
        checkboxState: checkbox.checked,
        appStateShowAll: AppState.filters?.showAll,
        willUpdate: true
      });
      // Only update the checkbox to match AppState, don't reset AppState
      checkbox.checked = AppState.filters?.showAll === true;
      updateShowAllFilterUI(checkbox.checked);
    }
    
    // Refresh statistics with current filters (don't reset filters)
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
    AppState.preventNextScroll = false;
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

  if (AppState.filters.showAll === true) {
    params.set('showAll', 'true');
  } else if (AppState.filters.hasOptions === true) {
    params.set('hasOptions', 'true');
  }

  Object.entries(AppState.filters).forEach(([key, value]) => {
    // Skip the parameters we've already handled
    if (key === 'showAll' || key === 'hasOptions') {
      return;
    }
    
    if (value !== undefined && value !== null && value !== '' && value.toString().trim()) {
      params.set(key, value);
    }
  });

  // Add page parameter if not first page
  if (AppState.currentPage > 1) {
    params.set('page', AppState.currentPage);
  }

  const newURL = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
  window.history.replaceState(null, '', newURL);
  
  console.log('🔗 URL updated:', newURL);
}

/** * Parse URL parameters and initialize AppState.filters
 * This function reads the URL parameters and sets the AppState.filters accordingly
 * It handles Show All vs Options-First logic based on the parameters
 * * @returns {void}
 */
/**
 * Parse URL parameters and initialize AppState.filters
 * Updated to handle engine parameter
 */
function parseURLParams() {
  const params = new URLSearchParams(window.location.search);

  AppState.currentPage = parseInt(params.get('page')) || 1;
  
  const showAllParam = params.get('showAll');
  const hasOptionsParam = params.get('hasOptions');
  
  console.log('🔍 Parsing URL params:', {
    showAll: showAllParam,
    hasOptions: hasOptionsParam,
    url: window.location.search
  });
  
  if (showAllParam === 'true') {
    // Show All mode
    AppState.filters = {
      search: params.get('search') || '',
      category: params.get('category') || '',
      developer: params.get('developer') || '', 
      engine: params.get('engine') || '', 
      options: params.get('options') || '',
      year: params.get('year') || '',
      sort: params.get('sort') || 'title',
      order: params.get('order') || 'asc',
      showAll: true,
      hasOptions: undefined
    };
    console.log('🌍 URL indicates SHOW ALL mode');
  } else if (hasOptionsParam === 'true') {
    // Explicit Options-First mode
    AppState.filters = {
      search: params.get('search') || '',
      category: params.get('category') || '',
      developer: params.get('developer') || '', 
      engine: params.get('engine') || '', 
      options: params.get('options') || '',
      year: params.get('year') || '',
      sort: params.get('sort') || 'title',
      order: params.get('order') || 'asc',
      showAll: false,
      hasOptions: true
    };
    console.log('🎯 URL indicates explicit OPTIONS-FIRST mode');
  } else {
    AppState.filters = {
      search: params.get('search') || '',
      category: params.get('category') || '',
      developer: params.get('developer') || '', 
      engine: params.get('engine') || '',
      options: params.get('options') || '',
      year: params.get('year') || '',
      sort: params.get('sort') || 'title',
      order: params.get('order') || 'asc',
      showAll: false,
      hasOptions: true
    };
    console.log('⚡ URL indicates default OPTIONS-FIRST mode');
  }
  
  console.log('📋 Parsed AppState.filters:', AppState.filters);
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
        engine: 'engineFilter', 
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
      enableClickOutsideSearch: true   // Search when clicking outside
    });
    
    // Set the callback for filter changes
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
      storeScrollPosition();
    }
  });
}
async function initializeApp() {
  try {
    // Parse URL params first
    parseURLParams();
    
    // Initialize components in sequence
    AppState.searchInstance = initializeSearchComponent();
    setupThemeToggle();
    setupScrollTracking(); // Sets up scroll position tracking

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