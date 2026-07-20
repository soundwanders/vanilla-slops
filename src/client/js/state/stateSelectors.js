/**
 * State Selectors for Vanilla Slops
 * These functions eliminate repeated state access patterns
 */

/**
 * @module FilterSelectors
 * @description Functions for handling filter-related state operations
 */

/**
 * Retrieves sanitized filters with default values
 * @param {Object} state - Application state
 * @returns {Object} Sanitized filter object with defaults
 */
export const getCleanFilters = (state) => {
  const filters = state.filters || {};
  return {
    search: filters.search || '',
    category: filters.category || '',
    developer: filters.developer || '',
    engine: filters.engine || '',
    options: filters.options || '',
    year: filters.year || '',
    sort: filters.sort || 'title',
    order: filters.order || 'asc'
  };
};

/**
 * Constructs API query parameters from state
 * @param {Object} state - Application state
 * @param {Object} [additionalParams={}] - Additional parameters to merge
 * @returns {Object} API query parameters
 */
export const getAPIQueryParams = (state, additionalParams = {}) => {
  const filters = getCleanFilters(state);
  
  return {
    page: state.currentPage || 1,
    limit: 20, // PAGE_SIZE constant
    ...filters,
    ...additionalParams
  };
};

/**
 * Extracts base filters from URL parameters
 * @param {URLSearchParams} urlParams - URL search parameters
 * @returns {Object} Base filter object
 */
export const getBaseFiltersFromURL = (urlParams) => {
  return {
    search: urlParams.get('search') || '',
    category: urlParams.get('category') || '',
    developer: urlParams.get('developer') || '',
    engine: urlParams.get('engine') || '',
    options: urlParams.get('options') || '',
    year: urlParams.get('year') || '',
    sort: urlParams.get('sort') || 'title',
    order: urlParams.get('order') || 'asc'
  };
};

/**
 * Prepares API filters object for specific API calls
 * @param {Object} state - Application state
 * @returns {Object} API filters object
 */
export const getAPIFilters = (state) => {
  const filters = getCleanFilters(state);
  return {
    search: filters.search,
    category: filters.category,
    developer: filters.developer,
    options: filters.options,
    year: filters.year,
    sort: filters.sort,
    order: filters.order
  };
};

/**
 * @module UIStateSelectors
 * @description Functions for deriving UI state
 */

/**
 * Reads game statistics from state with safe defaults
 * @param {Object} state - Application state
 * @returns {Object} Game statistics
 */
export const getGameStats = (state) => {
  return state.gameStats || {
    withOptions: 0,
    withoutOptions: 0,
    total: 0,
    percentageWithOptions: 0
  };
};

/**
 * Whether any user-driven filter, search or non-default sort is active
 * @param {Object} state - Application state
 * @returns {boolean} True when filters deviate from defaults
 */
export const hasActiveFilters = (state) => {
  const filters = getCleanFilters(state);
  return !!(
    filters.search ||
    filters.category ||
    filters.developer ||
    filters.engine ||
    filters.options ||
    filters.year ||
    filters.sort !== 'title' ||
    filters.order !== 'asc'
  );
};

/**
 * Formats statistics for UI display
 * @param {Object} state - Application state
 * @returns {Object} Formatted statistics for UI
 */
export const getFormattedStats = (state) => {
  const stats = getGameStats(state);
  return {
    primary: `${stats.total} games`,
    secondary: `${stats.withOptions} with launch options`,
    description: `Showing ${stats.total} games, ${stats.withOptions} with known launch options.`
  };
};

/**
 * @module URLNavigationSelectors
 * @description Functions for handling URL and navigation state
 */

/**
 * Constructs URL parameters for browser history
 * @param {Object} state - Application state
 * @returns {URLSearchParams} URL parameters
 */
export const getURLParams = (state) => {
  const params = new URLSearchParams();
  const filters = getCleanFilters(state);
  
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '' && value.toString().trim()) {
      params.set(key, value);
    }
  });

  if ((state.currentPage || 1) > 1) {
    params.set('page', state.currentPage);
  }

  return params;
};

/**
 * Generates complete URL for current state
 * @param {Object} state - Application state
 * @returns {string} Complete URL with query parameters
 */
export const getCurrentURL = (state) => {
  const params = getURLParams(state);
  return `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
};

/**
 * @module LoadingUIStateSelectors
 * @description Functions for handling loading and UI readiness
 */

/**
 * Checks if application is in loading state
 * @param {Object} state - Application state
 * @returns {boolean} True if application is loading
 */
export const isLoading = (state) => {
  return state.isLoading === true;
};

/**
 * Checks if application is ready for user interaction
 * @param {Object} state - Application state
 * @returns {boolean} True if application is ready
 */
export const isAppReady = (state) => {
  return !isLoading(state) && state.filtersInitialized === true;
};

/**
 * Retrieves scroll behavior information
 * @param {Object} state - Application state
 * @returns {Object} Scroll behavior details
 */
export const getScrollInfo = (state) => {
  return {
    lastPosition: state.lastScrollPosition || 0,
    shouldPreventScroll: state.preventNextScroll === true,
    shouldRestore: state.preventNextScroll === true && state.lastScrollPosition > 0
  };
};

/**
 * @module ComponentSelectors
 * @description Functions for handling component-specific state
 */

/**
 * Checks if search component exists and has active filters
 * @param {Object} state - Application state
 * @returns {boolean} True if search component has values
 */
export const hasSearchInstanceWithValues = (state) => {
  return !!(state.searchInstance && hasActiveFilters(state));
};

/**
 * Retrieves search component synchronization data
 * @param {Object} state - Application state
 * @returns {Object} Search component sync data
 */
export const getSearchSyncData = (state) => {
  const filters = getCleanFilters(state);
  return {
    searchValue: filters.search,
    currentFilters: filters,
    currentSort: filters.sort,
    currentOrder: filters.order
  };
};