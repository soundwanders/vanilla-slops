import { fetchGames, preloadPopularContent, fetchGameStatistics} from './api.js';
import { renderTable } from './ui/table.js';
import { setupThemeToggle } from './ui/theme.js';
import { renderPagination } from './ui/pagination.js';
import { StateManager } from './state/StateManager.js';
import { addVanillaSlopActions } from './state/stateActions.js';
import SlopSearch from './ui/search.js';
import { 
  getAPIQueryParams, 
  isLoading, 
  getScrollInfo,
  getAPIFilters, 
  getFilterMode,
  getBaseFiltersFromURL,
  getCurrentURL,
  getCheckboxStateInfo,
  hasActiveFilters,
  getCleanFilters,
  getGameStats,
  getSearchSyncData 
} from './state/stateSelectors.js';

const PAGE_SIZE = 20;

/** State manager */
const stateManager = new StateManager({
  currentPage: 1,
  isLoading: false,
  filters: {
    hasOptions: true,
    showAll: false,
    search: '',
    category: '',
    developer: '',
    engine: '',
    options: '',
    year: '',
    sort: 'title',
    order: 'asc'
  },
  totalPages: 0,
  searchInstance: null,
  filtersInitialized: false,
  lastScrollPosition: 0,
  preventNextScroll: false,
  gameStats: {
    withOptions: 0,
    withoutOptions: 0,
    total: 0
  }
});

addVanillaSlopActions(stateManager);
console.log('StateManager initialized:', stateManager.getState());

/**
 * Initialize and populate filter dropdowns with real data
 * Fetches facets from the API and populates the filter dropdowns
 * It also handles loading states and error handling
 * * @returns {Promise<void>}
 */
async function initializeFilters() {
  if (stateManager.getState().filtersInitialized) return;
  
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

    stateManager.dispatch('SET_FILTERS_INITIALIZED', true);

    addShowAllGamesFilter();
    console.log('Filters and custom dropdowns initialized');
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

/**
 * Adds a "Show All Games" filter to the filters fieldset
 * This filter allows users to toggle between showing all games
 * and only those with launch options
 * 
 * @returns {Promise<void>}
 */
/**
 * Default state: unchecked (hide games without options)
 * Checked state: show all games including those without options
 * 
 * @returns {Promise<void>}
 */
async function addShowAllGamesFilter() {
  console.log('Adding Show All Games filter...');
  
  // Find the fieldset where filters belong
  const fieldset = document.querySelector('.filters-container fieldset');
  if (!fieldset) {
    console.error('❌ Fieldset not found in filters container');
    return;
  }
  
  // Check if there's an existing placeholder or filter to replace
  let existingFilter = document.getElementById('showAllFilterGroup') || 
                      fieldset.querySelector('.show-all-filter');
  
  // Get statistics
  try {
    console.log('Fetching real statistics for filter...');
    const stats = await fetchGameStatistics();
    stateManager.dispatch('MERGE_STATS', {
      withOptions: stats.withOptions,
      withoutOptions: stats.withoutOptions,
      total: stats.total,
      percentageWithOptions: stats.percentageWithOptions
    });
    console.log('📈 Using real statistics:', stats);
  } catch (error) {
    console.error('Failed to fetch statistics, using fallback:', error);
    stateManager.dispatch('MERGE_STATS', { withOptions: 94, withoutOptions: 1033, total: 1127 });
  }
  
  const stats = getGameStats(stateManager.getState());
  
  // Ensure correct initial state detection
  const currentState = stateManager.getState();
  const isShowingAll = currentState.filters?.showAll === true;

  console.log('🔍 Initial state check:', {
    'filters.showAll': currentState.filters?.showAll,
    'isShowingAll': isShowingAll,
    'checkbox will be': isShowingAll ? 'CHECKED' : 'UNCHECKED',
    'expected behavior': isShowingAll ? 'showing all games' : 'only games with options'
  });
  
  // Create or update the filter group
  let filterGroup;
  
  if (existingFilter) {
    filterGroup = existingFilter;
    filterGroup.style.display = 'block';
    console.log('📝 Using existing filter placeholder');
  } else {
    filterGroup = document.createElement('div');
    filterGroup.className = 'filter-group show-all-filter';
    filterGroup.id = 'showAllFilterGroup';
    console.log('🆕 Creating new filter group');
  }
  
  // Create HTML with EXPLICIT checkbox state logging
  const checkboxChecked = isShowingAll ? 'checked' : '';
  const labelText = isShowingAll ? 'All games' : '';
  const statsText = isShowingAll ? `+${stats.withoutOptions}` : `${stats.withoutOptions}`;
  
  console.log('🎛️ Setting up checkbox:', {
    checkboxChecked,
    labelText,
    statsText,
    rawHTML: `checkbox ${checkboxChecked || 'unchecked'}`
  });
  
  filterGroup.innerHTML = `
    <label class="filter-label" for="showAllGamesFilter">Show All Games</label>
    <input 
      type="checkbox" 
      id="showAllGamesFilter" 
      class="sr-only"
      ${checkboxChecked}
      aria-describedby="showAllGamesHelp"
    />
    <label for="showAllGamesFilter" class="show-all-checkbox-container" role="button" tabindex="0" aria-pressed="${isShowingAll}">
      <span class="checkbox-label-text">${labelText}</span>
      <span class="checkbox-stats" id="showAllStats">${statsText}</span>
    </label>
    <div id="showAllGamesHelp" class="sr-only">
      ${isShowingAll 
        ? `Showing all ${stats.total} games including ${stats.withoutOptions} without launch options`
        : `Showing only ${stats.withOptions} games with launch options. ${stats.withoutOptions} games hidden.`
      }
    </div>
  `;
  
  // Position as LAST filter in the fieldset
  if (!existingFilter) {
    fieldset.appendChild(filterGroup);
    console.log('📍 Added filter as last item in fieldset');
  }
  
  // Clean event setup
  const checkbox = filterGroup.querySelector('#showAllGamesFilter');
  if (checkbox) {
    // Verify the checkbox state after DOM insertion
    console.log('Checkbox created:', {
      id: checkbox.id,
      checked: checkbox.checked,
      expectedChecked: isShowingAll,
      stateMatches: checkbox.checked === isShowingAll
    });
    
    // Remove old listeners
    const newCheckbox = checkbox.cloneNode(true);
    checkbox.parentNode.replaceChild(newCheckbox, checkbox);
    
    // FORCE the correct state after DOM operations
    newCheckbox.checked = isShowingAll;
    console.log('Forced checkbox state:', {
      setTo: isShowingAll,
      actualState: newCheckbox.checked
    });
    
    // Add event listener
    newCheckbox.addEventListener('change', function(e) {
      handleShowAllFilterChange(e);
    });
    
    console.log('Show All Games filter setup complete');
  } else {
    console.error('❌ Failed to find checkbox element');
  }
}

/**
 * Sync checkbox
 */
function syncShowAllCheckboxWithState() {
  const checkbox = document.getElementById('showAllGamesFilter');
  if (!checkbox) {
    console.log('Sync skipped: checkbox not found');
    return;
  }
  
  const currentState = stateManager.getState();
  const shouldBeChecked = currentState.filters?.showAll === true;
  const currentlyChecked = checkbox.checked;

  console.log('🔄 Syncing checkbox:', {
    'filters.showAll': currentState.filters?.showAll,
    'shouldBeChecked': shouldBeChecked,
    'currentlyChecked': currentlyChecked,
    'needsSync': currentlyChecked !== shouldBeChecked
  });

  if (currentlyChecked !== shouldBeChecked) {
    console.log(`Fixing checkbox state: ${currentlyChecked} → ${shouldBeChecked}`);
    checkbox.checked = shouldBeChecked;
    updateShowAllFilterUI(shouldBeChecked);
    console.log('Checkbox state corrected');
  } else {
    console.log('Checkbox state already correct');
  }
}

/** Handle Show All Games filter change
 * This function updates the UI and state manager based on the checkbox state
 * @param {boolean} isChecked - Whether the checkbox is checked
 * @param {HTMLElement|null} container - The container element
 * @returns {void}
 */
function updateShowAllFilterUI(isChecked, container = null) {
  const stats = getGameStats(stateManager.getState());
  
  console.log(`Updating UI: ${isChecked ? 'HIDING games without options' : 'SHOWING all games'}`, {
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
  
  // Update stats text with clear messaging
  if (statsElement) {
    const newText = isChecked 
      ? `${stats.withoutOptions}` 
      : `${stats.withoutOptions}`;
    statsElement.textContent = newText;
    console.log('Updated stats text:', newText);
  }
  
  // Update accessibility description
  if (helpElement) {
    const newHelp = isChecked 
      ? `Hiding ${stats.withoutOptions} games without launch options. Showing ${stats.withOptions} games with options.`
      : `Showing all ${stats.total} games including ${stats.withoutOptions} without launch options.`;
    helpElement.textContent = newHelp;
    console.log('♿ Updated help text');
  }
  
  console.log(`UI update complete: ${isChecked ? 'options only' : 'showing all'}`);
}

// Refresh filter statistics periodically
/**
 * Refreshes the filter statistics based on current StateManager filters
 * This function is called periodically to keep the UI in sync with the latest data
 * @returns {Promise<void>}
 */
async function refreshFilterStatistics() {
  try {
    // Use current StateManager filters for statistics
    const filters = getCleanFilters(stateManager.getState());
    const currentFilters = {
      search: filters.search,
      developer: filters.developer,
      category: filters.category,
      engine: filters.engine,
      year: filters.year
    };
    
    console.log('🔄 Refreshing filter statistics with current filters:', currentFilters);
    const stats = await fetchGameStatistics(currentFilters);

    stateManager.dispatch('MERGE_STATS', stats);
    
    updateShowAllFilterStats(stats);
    
    console.log('Refreshed filter statistics:', stats);
    console.log('🔍 Current filters after stats refresh:', stateManager.getState().filters);
  } catch (error) {
    console.error('Failed to refresh statistics:', error);
  }
}

/**
 * Handle changes to the Show All Games filter
 * * @param {Event} event - The change event from the checkbox
 * * @returns {void}
 */
function handleShowAllFilterChange(event) {
  const isChecked = event.target.checked;
  const container = document.querySelector('.show-all-checkbox-container');
  
  // Clean mode determination using selector
  const newMode = isChecked ? 'SHOW_ALL' : 'OPTIONS_FIRST';
  console.log(`Show All Games filter changed: ${newMode}`);
  console.log('📋 Event details:', {
    checked: isChecked,
    target: event.target.id,
    container: container ? 'found' : 'not found'
  });
  
  // Update visual state FIRST
  updateShowAllFilterUI(isChecked, container);
  
  // Use the specialized action for show-all toggle (includes page reset)
  stateManager.dispatch('TOGGLE_SHOW_ALL', isChecked);
  
  // Get current mode for logging using selector
  const currentMode = getFilterMode(stateManager.getState());
  console.log(`Switched to ${currentMode} mode`);
  console.log('🔄 New filters:', stateManager.getState().filters);
  
  updateURL();
  
  // ONE LINE: Get API filters using selector (eliminates all the duplication)
  const apiFilters = getAPIFilters(stateManager.getState());
  
  console.log('API filters:', apiFilters);
  
  // Trigger filter change through the existing system
  handleFilterChange(apiFilters, 'show-all-filter-change');
}

function updateURL() {
  // Get complete URL using selector
  const newURL = getCurrentURL(stateManager.getState());
  window.history.replaceState(null, '', newURL);
  
  console.log('🔗 URL updated:', newURL);
  
  // Clean state description using selectors
  const checkboxInfo = getCheckboxStateInfo(stateManager.getState());
  console.log('URL reflects:', {
    checkboxState: checkboxInfo.shouldBeChecked ? 'CHECKED (show all)' : 'UNCHECKED (options only)',
    mode: checkboxInfo.mode
  });
}

/**
 * Update the filter when statistics change (called from main app)
 * * @param {Object} newStats - The new statistics object
 * * * @returns {void}
 */
function updateShowAllFilterStats(newStats) {
  if (!newStats) return;
  
  // Update state manager with new stats
  stateManager.dispatch('MERGE_STATS', newStats);

  const checkbox = document.getElementById('showAllGamesFilter');
  if (checkbox) {
    updateShowAllFilterUI(checkbox.checked);
    console.log('Show All filter stats updated:', newStats);
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
  stateManager.dispatch('SET_SCROLL_POSITION', window.pageYOffset || document.documentElement.scrollTop);
}

/**
 * Restore scroll position with debouncing
  Also restores previous scroll position instead of scrolling to top
 */
function restoreScrollPosition() {
  const scrollInfo = getScrollInfo(stateManager.getState());
  if (scrollInfo.shouldRestore) {
    // Restore the previous scroll position instead of scrolling to top
    setTimeout(() => {
      window.scrollTo(0, scrollInfo.lastPosition);
      stateManager.dispatch('SET_PREVENT_SCROLL', false);
    }, 50);
  }
}

/**
 * Load page with games data - called by search component
 * 
 * This function handles loading games based on filters, pagination, and user interactions.
 * Uses StateManager for all state updates to ensure predictable state changes and 
 * proper change detection throughout the application.
 * 
 * State Actions Dispatched:
 * - SET_LOADING: Controls loading state to prevent concurrent requests
 * - SET_CURRENT_PAGE: Updates current page number
 * - SET_TOTAL_PAGES: Updates total pages from API response
 * - SET_PREVENT_SCROLL: Controls scroll restoration behavior
 * - BATCH_UPDATE: Efficiently updates multiple state properties
 * 
 * @async
 * @function loadPage
 * @param {number} [page=1] - The page number to load
 * @param {boolean} [replace=true] - Whether to replace the current page state in browser history
 * @param {string} [reason='search'] - The reason for loading the page. Used for:
 *   - 'search': Standard search/filter operation
 *   - 'initial-load': App startup
 *   - 'navigation': Browser back/forward
 *   - 'launch-options-interaction': User viewing launch options (preserves scroll)
 *   - 'user-interaction': General user interaction
 * @returns {Promise<void>} Resolves when the page is loaded and UI is updated
 * @throws {Error} Logs error and shows error state if API request fails
 * 
 */
async function loadPage(page = 1, replace = true, reason = 'search') {
  // Clean loading check using selector
  if (isLoading(stateManager.getState())) return;
  
  stateManager.dispatch('SET_LOADING', true);
  
  // Store scroll position before loading if user is interacting with content
  if (reason === 'launch-options-interaction' || reason === 'user-interaction') {
    storeScrollPosition();
    stateManager.dispatch('SET_PREVENT_SCROLL', true);
  }
  
  showLoadingState(replace);

  try {
    // All query params with proper defaults and structure
    const queryParams = getAPIQueryParams(stateManager.getState(), { 
      page, 
      limit: PAGE_SIZE 
    });

    console.log('🔍 Loading with filters:', {
      hasOptions: queryParams.hasOptions,
      showAll: queryParams.showAll,
      engine: queryParams.engine,
      mode: queryParams.showAll ? 'SHOW ALL' : 'OPTIONS-FIRST'
    });

    const response = await fetchGames(queryParams);

    // Clear state updates using actions
    stateManager.dispatch('SET_CURRENT_PAGE', page);
    stateManager.dispatch('SET_TOTAL_PAGES', response.totalPages || 0);

    // Update UI
    updateResultsCount(response.total || 0);
    clearResults();
    renderTable(response.games || [], false);
    
    // Get fresh state for pagination rendering
    const currentState = stateManager.getState();
    renderPagination(currentState.currentPage, currentState.totalPages, loadPage);
    
    if (reason === 'initial-load' || reason === 'navigation') {
      syncShowAllCheckboxWithState();
    }
    
    // Refresh statistics with current filters (don't reset filters)
    await refreshFilterStatistics();

    // Feedback logic
    if (response.games?.length > 0) {
      if (reason !== 'launch-options-interaction') {
        showSuccessFeedback(`Loaded ${response.games.length} games`);
      }
    }

    // Handle scroll restoration using selector
    const scrollInfo = getScrollInfo(stateManager.getState());
    if (scrollInfo.shouldRestore) {
      restoreScrollPosition();
    }
  } catch (error) {
    console.error('Error loading page:', error);
    showErrorState(error.message);
    stateManager.dispatch('SET_PREVENT_SCROLL', false);
  } finally {
    stateManager.dispatch('SET_LOADING', false);
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
    const scrollInfo = getScrollInfo(stateManager.getState());
    if (!scrollInfo.shouldPreventScroll) {
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

/**
 * Parse URL parameters and initialize statemanager filters
 * Updated to handle inverted toggle logic:
 * - Checkbox checked = hide games without options (showAll: false, hasOptions: true)
 * - Checkbox unchecked = show all games (showAll: true, hasOptions: undefined)
 */
function parseURLParams() {
  const params = new URLSearchParams(window.location.search);

  try {
    // Parse and validate page number
    const pageParam = params.get('page');
    const currentPage = pageParam ? Math.max(1, parseInt(pageParam)) : 1;
    stateManager.dispatch('SET_CURRENT_PAGE', currentPage);
    
    const showAllParam = params.get('showAll');
    const hasOptionsParam = params.get('hasOptions');
    
    console.log('Parsing URL params:', {
      showAll: showAllParam,
      hasOptions: hasOptionsParam,
      page: currentPage,
      url: window.location.search
    });
    
    // Get validated base filters
    const baseFilters = getBaseFiltersFromURL(params);
    
    // Determine mode and set filters
    if (showAllParam === 'true') {
      stateManager.dispatch('SET_FILTERS', {
        ...baseFilters,
        showAll: true,
        hasOptions: undefined
      });
      console.log('🔓 URL indicates SHOW ALL mode');
    } else {
      stateManager.dispatch('SET_FILTERS', {
        ...baseFilters,
        showAll: false,
        hasOptions: true
      });
      console.log('🍓 Default OPTIONS-FIRST mode');
    }
    
    // State logging
    const state = stateManager.getState();
    const mode = getFilterMode(state);
    const hasFilters = hasActiveFilters(state);
    
    console.log('📋 URL parsing complete:', {
      mode,
      currentPage: state.currentPage,
      hasActiveFilters: hasFilters,
      filterCount: hasFilters ? Object.keys(getCleanFilters(state)).filter(key => 
        getCleanFilters(state)[key] && key !== 'sort' && key !== 'order'
      ).length : 0
    });
    
  } catch (error) {
    console.error('❌ Error parsing URL params:', error);
    
    // Fallback to safe defaults
    stateManager.dispatch('RESET_FILTERS');
    stateManager.dispatch('SET_CURRENT_PAGE', 1);
    
    console.log('🔄 Reset to safe defaults due to URL parsing error');
  }
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
  
  // Update state using actions
  stateManager.dispatch('MERGE_FILTERS', newFilters);
  stateManager.dispatch('RESET_TO_PAGE_ONE');
  
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
      const state = stateManager.getState();
      if (!state.isLoading && !state.preventNextScroll) {
        stateManager.dispatch('SET_SCROLL_POSITION', window.pageYOffset || document.documentElement.scrollTop);
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
    const searchInstance = initializeSearchComponent();
    stateManager.dispatch('SET_SEARCH_INSTANCE', searchInstance);

    setupThemeToggle();
    setupScrollTracking(); // Sets up scroll position tracking

    // Initialize filters before loading data
    await initializeFilters();
    
    const state = stateManager.getState();
    if (state.searchInstance && hasActiveFilters(state)) {
      const syncData = getSearchSyncData(state);
      
      // Set the search input value from state
      if (syncData.searchValue && state.searchInstance.searchInput) {
        state.searchInstance.searchInput.value = syncData.searchValue;
        state.searchInstance.currentQuery = syncData.searchValue;
      }
      
      // Set filter values from state 
      Object.entries(syncData.currentFilters).forEach(([key, value]) => {
        if (value && state.searchInstance.filterElements[key]) {
          state.searchInstance.filterElements[key].value = value;
          state.searchInstance.currentFilters[key] = value;
        }
      });
      
      // Set sort values from state
      state.searchInstance.currentSort = syncData.currentSort;
      state.searchInstance.currentOrder = syncData.currentOrder;
      
      // Update active filters display
      state.searchInstance.renderActiveFilters();
    }
    
    // Preload popular content
    preloadPopularContent().catch(err => 
      console.warn('Failed to preload popular content:', err)
    );
    
    // Initial page load
    await loadPage(stateManager.getState().currentPage, true, 'initial-load');
    
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
    loadPage(stateManager.getState().currentPage, true, 'navigation');
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