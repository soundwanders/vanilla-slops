import { fetchGames, preloadPopularContent } from './api.js';
import { renderTable } from './ui/table.js';
import { renderPagination } from './ui/pagination.js';
import { setupThemeToggle } from './ui/theme.js';
import SlopSearch from './ui/search.js';

/**
 * @fileoverview Main application controller for Vanilla Slops front-end
 * Manages application state and handles user interactions
 * Implements search integration and URL state management
 */

const PAGE_SIZE = 20;

/**
 * Centralized application state management
 * Prevents state fragmentation across components
 * 
 * @namespace AppState
 * @property {number} currentPage - Current pagination page
 * @property {boolean} isLoading - Loading state flag
 * @property {boolean} hasMorePages - Whether more pages are available
 * @property {Object} filters - Current active filters
 * @property {number} totalPages - Total number of pages available
 * @property {SlopSearch|null} searchInstance - Reference to search component
 */
const AppState = {
  currentPage: 1,
  isLoading: false,
  hasMorePages: true,
  filters: {},
  totalPages: 0,
  searchInstance: null
};

/**
 * Loads a page of games with  error handling and state management
 * Supports both pagination and infinite scroll patterns
 * 
 * @async
 * @function loadPage
 * @param {number} [page=1] - Page number to load
 * @param {boolean} [append=false] - Whether to append results or replace
 * @returns {Promise<void>} Resolves when page is loaded and rendered
 * @throws {Error} When API request fails or invalid parameters
 * 
 * @example
 * // Load first page (replace current results)
 * await loadPage(1, false);
 * 
 * // Load next page (append to current results)
 * await loadPage(2, true);
 */
async function loadPage(page = 1, append = false) {
  if (AppState.isLoading || (!append && !AppState.hasMorePages && page > 1)) {
    return;
  }
  
  AppState.isLoading = true;
  showLoadingState(!append);

  try {
    // Build query parameters with proper mapping
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
    console.log('API Response:', response);
    
    // Update application state
    AppState.currentPage = page;
    AppState.totalPages = response.totalPages || 0;
    AppState.hasMorePages = response.hasNextPage || false;

    // Update UI
    updateResultsCount(response.total || 0);
    
    if (!append) {
      clearResults();
    }

    renderTable(response.games || [], append);
    
    if (!append) {
      renderPagination(AppState.currentPage, AppState.totalPages, loadPage);
    }

    setupScrollObserver();
    updateURL();

  } catch (error) {
    console.error('Error loading page:', error);
    showErrorState(error.message);
  } finally {
    AppState.isLoading = false;
    hideLoadingState();
  }
}

/**
 * Update results count display
 */
function updateResultsCount(total) {
  const resultsCount = document.getElementById('resultsCount');
  if (resultsCount) {
    resultsCount.textContent = `${total} result${total !== 1 ? 's' : ''} found`;
  }
}

/**
 * Show loading state
 */
function showLoadingState(clearContent = false) {
  const resultsList = document.getElementById('resultsList');
  if (resultsList) {
    if (clearContent) {
      resultsList.innerHTML = '<div class="loading">Loading games...</div>';
    } else {
      // Add loading indicator for infinite scroll
      const loadingDiv = document.createElement('div');
      loadingDiv.className = 'loading';
      loadingDiv.textContent = 'Loading more games...';
      resultsList.appendChild(loadingDiv);
    }
  }
}

/**
 * Hide loading state
 */
function hideLoadingState() {
  const loadingElements = document.querySelectorAll('.loading');
  loadingElements.forEach(el => el.remove());
}

/**
 * Show error state
 */
function showErrorState(message) {
  const resultsList = document.getElementById('resultsList');
  if (resultsList) {
    resultsList.innerHTML = `
      <div class="error">
        <p>❌ ${message}</p>
        <button onclick="location.reload()" class="retry-btn">Try Again</button>
      </div>
    `;
  }
}

/**
 * Clear results display
 */
function clearResults() {
  // Clear table container if it exists
  const tableContainer = document.getElementById('table-container');
  if (tableContainer) {
    tableContainer.innerHTML = '';
  }
  
  // Clear existing pagination
  const existingPagination = document.querySelector('.pagination');
  if (existingPagination) {
    existingPagination.remove();
  }
}

/**
 * Update URL with current state
 */
function updateURL() {
  const params = new URLSearchParams();

  // Add non-empty filters to URL
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

/**
 * Parses URL parameters and restores application state
 * Enables deep linking and browser back/forward functionality
 * 
 * @function parseURLParams
 * @returns {void} Updates AppState.filters and AppState.currentPage
 * 
 * @example
 * // URL: /games?search=valve&category=fps&page=2
 * parseURLParams();
 * // AppState.filters = { search: 'valve', category: 'fps' }
 * // AppState.currentPage = 2
 */
function parseURLParams() {
  const params = new URLSearchParams(window.location.search);

  AppState.currentPage = parseInt(params.get('page')) || 1;
  
  // Parse all possible filter parameters
  AppState.filters = {
    search: params.get('search') || '',
    category: params.get('category') || '',
    developer: params.get('developer') || '', 
    options: params.get('options') || '',
    year: params.get('year') || '',
    sort: params.get('sort') || 'title',
    order: params.get('order') || 'asc'
  };

  console.log('Parsed URL params:', AppState.filters);
}

/**
 * Sets up Intersection Observer for infinite scroll functionality
 * Automatically loads next page when user scrolls near bottom
 * Handles cleanup of previous observers to prevent memory leaks
 * 
 * @function setupScrollObserver
 * @returns {void} Attaches observer to scroll sentinel element
 */
function setupScrollObserver() {
  // Remove existing observer
  const existingSentinel = document.getElementById('scroll-sentinel');
  if (existingSentinel && existingSentinel._observer) {
    existingSentinel._observer.disconnect();
  }

  const sentinel = document.getElementById('scroll-sentinel');
  if (!sentinel || !AppState.hasMorePages) return;

  const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !AppState.isLoading && AppState.hasMorePages) {
      observer.disconnect();
      loadPage(AppState.currentPage + 1, true);
    }
  }, { 
    rootMargin: '100px',
    threshold: 0.1 
  });

  observer.observe(sentinel);
  sentinel._observer = observer; // Store reference for cleanup
}

/**
 * Handles filter changes from search component and manual controls
 * Resets pagination and triggers new search with updated filters
 * 
 * @function handleFilterChange
 * @param {Object} newFilters - New filter values to apply
 * @param {string} [newFilters.search] - Search query
 * @param {string} [newFilters.category] - Game category
 * @param {string} [newFilters.developer] - Developer name
 * @param {string} [newFilters.options] - Launch options filter
 * @param {string} [newFilters.year] - Release year
 * @param {string} [newFilters.sort] - Sort field
 * @param {string} [newFilters.order] - Sort order
 * @returns {void} Updates application state and triggers page reload
 */
function handleFilterChange(newFilters) {
  console.log('Filter change:', newFilters);
  
  // Merge new filters with existing ones
  AppState.filters = { ...AppState.filters, ...newFilters };
  
  // Reset to first page
  AppState.currentPage = 1;
  AppState.hasMorePages = true;
  
  // Load new results
  loadPage(1, false);
}

/**
 * Initializes search component with proper configuration
 * Maps DOM elements and sets up event handlers for search functionality
 * 
 * @function initializeSearchComponent
 * @returns {SlopSearch|null} Configured search component instance or null if initialization fails
 * @throws {Error} When required DOM elements are missing
 */
function initializeSearchComponent() {
  const container = document.querySelector('.search-container');
  if (!container) {
    console.error('Search container not found in DOM');
    return null;
  }

  try {
    // Configure search component with correct element IDs
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
    
    // Set up filter change handler
    searchInstance.onFilterChange = handleFilterChange;
    
    return searchInstance;
  } catch (error) {
    console.error('Failed to initialize search component:', error);
    return null;
  }
}

/**
 * Main application initialization function
 * Coordinates component setup, state restoration, and initial data loading
 * 
 * @async
 * @function initializeApp
 * @returns {Promise<void>} Resolves when application is fully initialized
 * @throws {Error} When critical initialization steps fail
 */
async function initializeApp() {
  try {
    console.log('Initializing Steam Launch Options app...');
    
    // Parse URL parameters to restore state
    parseURLParams();
    
    // Initialize search component
    AppState.searchInstance = initializeSearchComponent();
    
    // Setup theme toggle
    setupThemeToggle();
    
    // Preload popular content for better UX
    preloadPopularContent().catch(err => 
      console.warn('Failed to preload popular content:', err)
    );
    
    // Load initial page
    await loadPage(AppState.currentPage);
    
    console.log('App initialized successfully');
    
  } catch (error) {
    console.error('Failed to initialize app:', error);
    showErrorState('Failed to initialize application. Please refresh the page.');
  }
}

/**
 * Sets up global event listeners for browser navigation and manual controls
 * Handles back/forward navigation, sort changes, and filter interactions
 * 
 * @function setupEventListeners
 * @returns {void} Attaches event listeners to DOM elements
 */
function setupEventListeners() {
  // Handle browser back/forward
  window.addEventListener('popstate', () => {
    parseURLParams();
    loadPage(AppState.currentPage);
  });

  // Handle manual sort changes
  const sortSelect = document.getElementById('sortSelect');
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      const [sortField, sortOrder] = e.target.value.split('-');
      handleFilterChange({
        sort: sortField || 'title',
        order: sortOrder || 'asc'
      });
    });
  }

  // Handle manual filter changes for elements not managed by SlopSearch
  const filterElements = [
    'categoryFilter',
    'developerFilter', 
    'optionsFilter',
    'yearFilter'
  ];

  filterElements.forEach(filterId => {
    const element = document.getElementById(filterId);
    if (element) {
      element.addEventListener('change', (e) => {
        const filterType = filterId.replace('Filter', '');
        handleFilterChange({
          [filterType]: e.target.value
        });
      });
    }
  });

  // Handle search input with debouncing
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    let debounceTimeout;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(() => {
        handleFilterChange({ search: e.target.value.trim() });
      }, 300);
    });
  }
}

/**
 * Ensures required DOM elements exist for proper application functionality
 * Creates missing elements dynamically if not found in HTML
 * 
 * @function ensureRequiredDOMElements
 * @returns {void} Creates missing DOM structure
 */
function ensureRequiredDOMElements() {
  // Ensure app container exists
  let appContainer = document.getElementById('app');
  if (!appContainer) {
    appContainer = document.createElement('div');
    appContainer.id = 'app';
    document.body.appendChild(appContainer);
  }

  // Ensure table container exists
  let tableContainer = document.getElementById('table-container');
  if (!tableContainer) {
    tableContainer = document.createElement('div');
    tableContainer.id = 'table-container';
    appContainer.appendChild(tableContainer);
  }

  // Ensure scroll sentinel exists
  let scrollSentinel = document.getElementById('scroll-sentinel');
  if (!scrollSentinel) {
    scrollSentinel = document.createElement('div');
    scrollSentinel.id = 'scroll-sentinel';
    scrollSentinel.style.height = '1px';
    document.body.appendChild(scrollSentinel);
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