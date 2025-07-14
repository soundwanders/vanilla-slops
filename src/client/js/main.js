import { fetchGames, preloadPopularContent } from './api.js';
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
  filters: {},
  totalPages: 0,
  searchInstance: null,
  filtersInitialized: false,
  lastSearchQuery: '',
  pendingSearchQuery: '' // Actively track user typing
};

/**
 * Initialize and populate filter dropdowns with real data
 */
async function initializeFilters() {
  if (AppState.filtersInitialized) return;
  
  try {
    console.log('🔄 Initializing filter dropdowns...');
    
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
    console.log('📊 Received facets:', facets);
    
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
    console.log('✅ All filters populated successfully');
    
  } catch (error) {
    console.error('❌ Failed to initialize filters:', error);
    
    // Remove loading state and provide fallback
    const filterSelects = document.querySelectorAll('.filter-select');
    filterSelects.forEach(select => {
      select.disabled = false;
      select.style.opacity = '';
    });
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
    
    console.log(`✅ Populated ${elementId} with ${data.length} options`);
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

async function loadPage(page = 1, replace = true) {
  if (AppState.isLoading) return;
  
  AppState.isLoading = true;
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
      order: AppState.filters.order || 'asc'
    };

    console.log('Loading page with params:', queryParams);

    const response = await fetchGames(queryParams);
    
    // Update application state
    AppState.currentPage = page;
    AppState.totalPages = response.totalPages || 0;
    AppState.lastSearchQuery = queryParams.search; // Track executed search

    // Update UI with smooth transitions
    updateResultsCount(response.total || 0);
    clearResults();
    renderTable(response.games || [], false);
    renderPagination(AppState.currentPage, AppState.totalPages, loadPage);

    updateURL();

    // Add success feedback
    if (response.games?.length > 0) {
      showSuccessFeedback(`Loaded ${response.games.length} games`);
    }

  } catch (error) {
    console.error('Error loading page:', error);
    showErrorState(error.message);
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
  const resultsList = document.getElementById('resultsList');
  if (resultsList && clearContent) {
    resultsList.innerHTML = `
      <div class="loading">
        <div class="spinner"></div>
        <span>Loading games...</span>
      </div>
    `;
  }
  
  // Disable form elements during loading
  const formElements = document.querySelectorAll('.filter-select, .search-input, .sort-select');
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
  const formElements = document.querySelectorAll('.filter-select, .search-input, .sort-select');
  formElements.forEach(el => {
    el.disabled = false;
    el.style.opacity = '';
  });
}

/**
 * Error state
 */
function showErrorState(message) {
  const resultsList = document.getElementById('resultsList');
  if (resultsList) {
    resultsList.innerHTML = `
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

// Rest of the existing functions remain the same...
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
    order: params.get('order') || 'asc'
  };
}

/**
 * Filter change handler with "smart search" execution
 */
function handleFilterChange(newFilters) {
  console.log('Filter change:', newFilters);
  
  const oldFilters = { ...AppState.filters };
  AppState.filters = { ...AppState.filters, ...newFilters };
  AppState.currentPage = 1;

  // Check if this is just a search query change vs other filters
  const searchChanged = newFilters.search !== undefined && newFilters.search !== oldFilters.search;
  const otherFiltersChanged = Object.keys(newFilters).some(key => 
    key !== 'search' && newFilters[key] !== oldFilters[key]
  );

  // Immediately execute search for:
  // 1. Non-search filter changes (dropdown selections, etc.)
  // 2. Search suggestions selections (handled by search component)
  // 3. Empty search (clear search)
  if (otherFiltersChanged || 
      (searchChanged && newFilters.search === '') ||
      (searchChanged && newFilters.fromSuggestion)) {
    
    loadPage(1, true);
  } 
  // For search text changes, just update the pending state
  else if (searchChanged) {
    AppState.pendingSearchQuery = newFilters.search;
    updateSearchIndicator();
  }
}

/**
 * Execute pending search - called by Enter key or search button
 */
function executePendingSearch() {
  if (AppState.pendingSearchQuery !== AppState.lastSearchQuery) {
    AppState.filters.search = AppState.pendingSearchQuery;
    loadPage(1, true);
  }
}

function initializeSearchComponent() {
  const container = document.querySelector('.search-container');
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
    
    // Callback distinguishes suggestion clicks from typing
    searchInstance.onFilterChange = (filters, metadata = {}) => {
      if (metadata.fromSuggestion) {
        // Immediately execute search for suggestion clicks
        handleFilterChange({ ...filters, fromSuggestion: true });
      } else {
        // For typing, just update suggestions
        handleFilterChange(filters);
      }
    };
    
    return searchInstance;
  } catch (error) {
    console.error('Failed to initialize search component:', error);
    return null;
  }
}

/**
 * App initialization
 */
async function initializeApp() {
  try {
    console.log('🚀 Initializing Vanilla Slops app...');
    
    parseURLParams();
    
    // Initialize components in sequence
    AppState.searchInstance = initializeSearchComponent();
    setupThemeToggle();
    
    // Initialize filters before loading data
    await initializeFilters();
    
    // Preload popular content
    preloadPopularContent().catch(err => 
      console.warn('Failed to preload popular content:', err)
    );
    
    // Load initial page
    await loadPage(AppState.currentPage);
    
    console.log('✅ App initialized successfully');
    
    // Add visual feedback that app is ready
    document.body.classList.add('app-ready');
    
  } catch (error) {
    console.error('❌ Failed to initialize app:', error);
    showErrorState('Failed to initialize application. Please refresh the page.');
  }
}

/**
 * Update search indicator to show pending vs executed search
 */
function updateSearchIndicator() {
  const searchInput = document.getElementById('searchInput');
  const searchButton = document.getElementById('searchButton');
  
  if (!searchInput) return;
  
  const hasPendingSearch = AppState.pendingSearchQuery !== AppState.lastSearchQuery;
  
  // Add/remove visual indicator for pending search
  if (hasPendingSearch && AppState.pendingSearchQuery.trim()) {
    searchInput.classList.add('has-pending-search');
    if (searchButton) {
      searchButton.classList.add('search-ready');
      searchButton.textContent = '🔍 Search';
    }
  } else {
    searchInput.classList.remove('has-pending-search');
    if (searchButton) {
      searchButton.classList.remove('search-ready');
      searchButton.textContent = '🔍';
    }
  }
}

function setupEventListeners() {
  // Browser navigation
  window.addEventListener('popstate', () => {
    parseURLParams();
    loadPage(AppState.currentPage);
  });

  // Manual filter changes (non-search)
  const filterElements = ['categoryFilter', 'developerFilter', 'optionsFilter', 'yearFilter'];
  filterElements.forEach(filterId => {
    const element = document.getElementById(filterId);
    if (element) {
      element.addEventListener('change', (e) => {
        const filterType = filterId.replace('Filter', '');
        handleFilterChange({ [filterType]: e.target.value });
      });
    }
  });

  // Search input handling
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    // Handle typing (for suggestions only, not search execution)
    let debounceTimeout;
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.trim();
      AppState.pendingSearchQuery = query;
      
      // Clear timeout for suggestion updates
      clearTimeout(debounceTimeout);
      
      // Update suggestions frequently (for good UX)
      debounceTimeout = setTimeout(() => {
        if (AppState.searchInstance) {
          AppState.searchInstance.updateSuggestions(query);
        }
      }, 200);
      
      // Update visual indicator
      updateSearchIndicator();
    });

    // Handle Enter key for search execution
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        executePendingSearch();
      }
    });
  }

  // Add search button for explicit search execution
  addSearchButton();
}

/**
 * Submit button next to searchbar
 */
function addSearchButton() {
  const searchContainer = document.querySelector('.search-field');
  if (!searchContainer || document.getElementById('searchButton')) return;
  
  const searchButton = document.createElement('button');
  searchButton.id = 'searchButton';
  searchButton.type = 'button';
  searchButton.className = 'search-button';
  searchButton.textContent = '🔍';
  searchButton.title = 'Execute search (Enter)';
  
  searchButton.addEventListener('click', () => {
    executePendingSearch();
  });
  
  searchContainer.appendChild(searchButton);
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
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  ensureRequiredDOMElements();
  setupEventListeners();
  initializeApp();
});

// Export for debugging
window.AppState = AppState;
window.loadPage = loadPage;
window.executePendingSearch = executePendingSearch;