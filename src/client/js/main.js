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
 * Includes fallback options and better error handling
 */
async function initializeFilters() {
  if (AppState.filtersInitialized) return;
  
  try {
    console.log('🔧 Initializing filters...');
    
    // Show loading state on filters
    const filterSelects = document.querySelectorAll('.filter-select');
    filterSelects.forEach(select => {
      select.disabled = true;
      select.style.opacity = '0.6';
    });
    
    // Fetch facets from the API with error handling
    let facets = {};
    try {
      const response = await fetch('/api/games/facets?includeStats=true');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      facets = await response.json();
      console.log('✅ Facets loaded successfully:', Object.keys(facets));
    } catch (fetchError) {
      console.error('❌ Failed to fetch facets:', fetchError);
      // Continue with empty facets - we'll create fallbacks
      facets = {
        developers: [],
        engines: [],
        publishers: [],
        genres: [],
        releaseYears: [],
        statistics: { withOptions: 0, withoutOptions: 0, total: 0, percentageWithOptions: 0 }
      };
    }
    
    // Store statistics for UI feedback
    if (facets.statistics) {
      AppState.gameStats = facets.statistics;
      console.log('📊 Game statistics loaded:', AppState.gameStats);
    }
    
    // Populate each filter dropdown with fallback support
    await populateFilterDropdown('developerFilter', facets.developers, 'All Developers');
    await populateFilterDropdown('categoryFilter', facets.genres, 'All Categories');
    await populateYearFilter(facets.releaseYears);
    await populateOptionsFilter();
    
    // Initialize Options-First toggle
    initializeOptionsFirstToggle();
    
    // Remove loading state
    filterSelects.forEach(select => {
      select.disabled = false;
      select.style.opacity = '';
    });
    
    AppState.filtersInitialized = true;
    console.log('✅ Filter initialization completed');
    
  } catch (error) {
    console.error('💥 Filter initialization failed:', error);
    
    // Remove loading state and provide fallback
    const filterSelects = document.querySelectorAll('.filter-select');
    filterSelects.forEach(select => {
      select.disabled = false;
      select.style.opacity = '';
    });
    
    // Initialize with minimal fallback data
    await initializeFallbackFilters();
  }
}

/**
 * Populate filter dropdown with fallback support for empty data
 */
async function populateFilterDropdown(elementId, data, defaultText) {
  console.log(`📋 Populating ${elementId} with ${data?.length || 0} options...`);
  
  const selectElement = document.getElementById(elementId);
  if (!selectElement) {
    console.warn(`Filter element ${elementId} not found`);
    return;
  }
  
  const currentValue = selectElement.value;
  
  // Clear existing options except the first (default)
  while (selectElement.children.length > 1) {
    selectElement.removeChild(selectElement.lastChild);
  }
  
  // Update default option text
  if (selectElement.firstElementChild) {
    selectElement.firstElementChild.textContent = defaultText;
  }
  
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
    
    console.log(`✅ ${elementId} populated with ${data.length} options`);
  } else {
    console.warn(`⚠️ No data available for ${elementId}, using fallbacks if available`);
    
    // Add fallback options for categories
    if (elementId === 'categoryFilter') {
      const fallbackCategories = [
        'Action', 'RPG', 'Strategy', 'FPS', 'Racing', 'Sports', 
        'Simulation', 'Puzzle', 'Horror', 'Survival', 'Indie'
      ];
      
      fallbackCategories.forEach(category => {
        const option = document.createElement('option');
        option.value = category.toLowerCase();
        option.textContent = category;
        selectElement.appendChild(option);
      });
      console.log('🎮 Category filter populated with fallback options');
    }
  }
  
  // Restore previous selection
  if (currentValue && [...selectElement.options].some(opt => opt.value === currentValue)) {
    selectElement.value = currentValue;
  }
}

/**
 * Populate year filter with both dropdown and input field
 * Supports flexible year entry when dropdown data is limited
 */
async function populateYearFilter(releaseYears) {
  console.log('📅 Setting up year filter...');
  
  const yearFilterGroup = document.querySelector('#yearFilter')?.closest('.filter-group');
  if (!yearFilterGroup) {
    console.warn('Year filter group not found');
    return;
  }
  
  // Replace the existing year filter with a more flexible one
  yearFilterGroup.innerHTML = `
    <label class="filter-label" for="yearFilter">Release Year</label>
    <div class="year-filter-container">
      <select class="filter-select year-select" id="yearFilterSelect" name="year-select">
        <option value="">All Years</option>
      </select>
      <span class="year-divider">or</span>
      <input 
        type="number" 
        class="filter-input year-input" 
        id="yearFilterInput" 
        name="year-input"
        placeholder="Enter year..."
        min="1980"
        max="${new Date().getFullYear() + 1}"
        title="Enter a specific year (1980-${new Date().getFullYear() + 1})"
      >
    </div>
  `;
  
  // Add CSS for the year filter layout
  addYearFilterStyles();
  
  const yearSelect = document.getElementById('yearFilterSelect');
  const yearInput = document.getElementById('yearFilterInput');
  
  // Populate dropdown with available years
  if (Array.isArray(releaseYears) && releaseYears.length > 0) {
    releaseYears.forEach(year => {
      const option = document.createElement('option');
      option.value = year.toString();
      option.textContent = year.toString();
      yearSelect.appendChild(option);
    });
    console.log(`✅ Year dropdown populated with ${releaseYears.length} years`);
  } else {
    // Fallback: create common years
    const currentYear = new Date().getFullYear();
    const commonYears = [];
    for (let year = currentYear; year >= 2000; year -= 1) {
      commonYears.push(year);
    }
    // Add some older landmark years
    commonYears.push(1999, 1998, 1997, 1996, 1995, 1990, 1985, 1980);
    
    commonYears.forEach(year => {
      const option = document.createElement('option');
      option.value = year.toString();
      option.textContent = year.toString();
      yearSelect.appendChild(option);
    });
    console.log('📅 Year dropdown populated with fallback years');
  }
  
  // Set up event handlers for both select and input
  const updateYearFilter = () => {
    const selectValue = yearSelect.value;
    const inputValue = yearInput.value;
    
    // Use input value if provided, otherwise use select value
    const yearValue = inputValue || selectValue;
    
    // Update the other control to stay in sync
    if (inputValue && selectValue !== inputValue) {
      // Find matching option or clear select
      const matchingOption = Array.from(yearSelect.options).find(opt => opt.value === inputValue);
      yearSelect.value = matchingOption ? inputValue : '';
    } else if (selectValue && yearInput.value !== selectValue) {
      yearInput.value = selectValue;
    }
    
    // Store the year value
    AppState.filters.year = yearValue;
    
    // Trigger filter change
    if (AppState.searchInstance && AppState.searchInstance.onFilterChange) {
      AppState.searchInstance.onFilterChange({ year: yearValue }, 'year-filter-change');
    }
  };
  
  yearSelect.addEventListener('change', updateYearFilter);
  yearInput.addEventListener('input', debounce(updateYearFilter, 500));
  yearInput.addEventListener('blur', updateYearFilter);
  
  // Handle Enter key in input
  yearInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      updateYearFilter();
    }
  });
}

/**
 * Populate options filter with comprehensive launch option filters
 */
async function populateOptionsFilter() {
  console.log('🚀 Setting up options filter...');
  
  const optionsFilter = document.getElementById('optionsFilter');
  if (!optionsFilter) {
    console.warn('Options filter not found');
    return;
  }
  
  const currentValue = optionsFilter.value;
  optionsFilter.innerHTML = '';
  
  const optionsData = [
    { value: '', label: 'Any Launch Options', description: 'Show all games regardless of launch options' },
    { value: 'has-options', label: 'Has Launch Options', description: 'Games with community-verified launch options' },
    { value: 'no-options', label: 'No Launch Options', description: 'Games without any launch options' },
    { value: 'many-options', label: '5+ Launch Options', description: 'Games with many launch options' },
    { value: 'few-options', label: '1-4 Launch Options', description: 'Games with few launch options' },
    { value: 'performance', label: 'Performance Options', description: 'Options that improve game performance' },
    { value: 'graphics', label: 'Graphics Options', description: 'Options that modify graphics settings' }
  ];
  
  optionsData.forEach(item => {
    const option = document.createElement('option');
    option.value = item.value;
    option.textContent = item.label;
    option.title = item.description;
    optionsFilter.appendChild(option);
  });
  
  // Restore previous selection
  if (currentValue && [...optionsFilter.options].some(opt => opt.value === currentValue)) {
    optionsFilter.value = currentValue;
  }
  
  console.log('✅ Options filter populated');
}

/**
 * Initialize fallback filters when API fails
 */
async function initializeFallbackFilters() {
  console.log('🔧 Initializing fallback filters...');
  
  try {
    await populateFilterDropdown('developerFilter', [
      'Valve Corporation', 'id Software', 'Bethesda Game Studios', 'CD Projekt RED',
      'Rockstar Games', 'Ubisoft', 'Electronic Arts', 'Activision'
    ], 'All Developers');
    
    await populateFilterDropdown('categoryFilter', [
      'Action', 'RPG', 'Strategy', 'FPS', 'Racing', 'Sports', 
      'Simulation', 'Puzzle', 'Horror', 'Survival'
    ], 'All Categories');
    
    await populateYearFilter([]); // Will use fallback years
    await populateOptionsFilter();
    
    console.log('✅ Fallback filters initialized');
  } catch (error) {
    console.error('💥 Even fallback filter initialization failed:', error);
  }
}

/**
 * Add CSS styles for the year filter
 */
function addYearFilterStyles() {
  if (document.querySelector('style[data-year-filter-styles]')) return;
  
  const style = document.createElement('style');
  style.setAttribute('data-year-filter-styles', 'true');
  style.textContent = `
    .year-filter-container {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    
    .year-select {
      flex: 1;
      min-width: 120px;
    }
    
    .year-divider {
      color: var(--color-text-muted, #666);
      font-size: 0.875rem;
      font-style: italic;
      white-space: nowrap;
    }
    
    .year-input {
      flex: 0 0 100px;
      padding: 0.5rem;
      border: 1px solid var(--color-border, #d1d5db);
      border-radius: 0.375rem;
      font-size: 0.875rem;
      background: var(--color-bg-input, white);
      color: var(--color-text, black);
    }
    
    .year-input:focus {
      outline: none;
      border-color: var(--color-primary, #3b82f6);
      box-shadow: 0 0 0 2px var(--color-primary-alpha, rgba(59, 130, 246, 0.1));
    }
    
    .year-input::placeholder {
      color: var(--color-text-placeholder, #9ca3af);
    }
    
    /* Dark theme support */
    [data-theme="dark"] .year-input {
      background: var(--color-bg-input-dark, #374151);
      border-color: var(--color-border-dark, #4b5563);
      color: var(--color-text-dark, white);
    }
    
    [data-theme="dark"] .year-divider {
      color: var(--color-text-muted-dark, #9ca3af);
    }
    
    /* Responsive design */
    @media (max-width: 640px) {
      .year-filter-container {
        flex-direction: column;
        align-items: stretch;
      }
      
      .year-divider {
        align-self: center;
      }
      
      .year-input {
        flex: 1;
      }
    }
  `;
  document.head.appendChild(style);
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
 * Filter change handling with Options-First support
 * Validates filters and handles conflicts between different filter types
 */
function handleFilterChange(newFilters, reason = 'user-filter') {
  console.log('🎯 Filter change with Options-First strategy:', {
    filters: newFilters,
    reason,
    currentState: AppState.filters
  });
  
  // Determine if this is likely a user interaction with launch options
  const isLaunchOptionsInteraction = document.querySelector('.launch-options-row[style*="table-row"]') !== null;
  
  if (isLaunchOptionsInteraction && reason !== 'options-strategy-change') {
    reason = 'launch-options-interaction';
  }
  
  // Validate filters before applying
  const validatedFilters = validateFilters(newFilters);
  
  // Handle special cases for options filter
  if (validatedFilters.options === 'no-options') {
    // Force showAll when filtering for games without options
    validatedFilters.showAll = true;
    validatedFilters.hasOptions = false;
    console.log('🔧 Auto-enabled showAll for no-options filter');
  }
  
  // Update app state
  AppState.filters = { ...AppState.filters, ...validatedFilters };
  AppState.currentPage = 1; // Reset to first page on filter change
  
  // Log the final state for debugging
  console.log('📊 Final filter state:', AppState.filters);
  
  // Load new results with context
  loadPage(1, true, reason);
}

/**
 * Validate and clean filter values
 */
function validateFilters(filters) {
  const validated = {};
  
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed) {
          validated[key] = trimmed;
        }
      } else if (typeof value === 'boolean') {
        validated[key] = value;
      } else if (typeof value === 'number' && !isNaN(value)) {
        validated[key] = value;
      }
    }
  });
  
  // Special validation for year
  if (validated.year) {
    const year = parseInt(validated.year, 10);
    if (isNaN(year) || year < 1980 || year > new Date().getFullYear() + 1) {
      console.warn(`⚠️ Invalid year: ${validated.year}, removing from filters`);
      delete validated.year;
    }
  }
  
  return validated;
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
      sort: AppState.filters.sort || 'total_options_count',
      order: AppState.filters.order || 'desc',
      
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
        year: 'yearFilterSelect' // Update to use the new year select
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
      prioritizeOptionsInSuggestions: true
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

// Helper functions
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

/**
 * Utility function for debouncing input events
 */
function debounce(func, delay) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  ensureRequiredDOMElements();
  setupEventListeners();
  initializeApp();
});

export { handleFilterChange };