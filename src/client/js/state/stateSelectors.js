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
    order: filters.order || 'asc',
    hasOptions: filters.hasOptions,
    showAll: filters.showAll
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
    order: filters.order,
    showAll: filters.showAll,
    hasOptions: filters.hasOptions
  };
};

/**
 * @module UIStateSelectors
 * @description Functions for deriving UI state
 */

/**
 * Determines current filtering mode
 * @param {Object} state - Application state
 * @returns {string} Filter mode ('SHOW_ALL' or 'OPTIONS_FIRST')
 */
export const getFilterMode = (state) => {
  const filters = state.filters || {};
  return filters.showAll ? 'SHOW_ALL' : 'OPTIONS_FIRST';
};

/**
 * Checks if show-all checkbox should be checked
 * @param {Object} state - Application state
 * @returns {boolean} True if show-all checkbox should be checked
 */
export const shouldShowAllCheckboxBeChecked = (state) => {
  return (state.filters?.showAll === true);
};

/**
 * Provides checkbox state information for debugging
 * @param {Object} state - Application state
 * @returns {Object} Checkbox state details
 */
export const getCheckboxStateInfo = (state) => {
  const shouldBeChecked = shouldShowAllCheckboxBeChecked(state);
  return {
    shouldBeChecked,
    mode: getFilterMode(state),
    description: shouldBeChecked ? 'show all games' : 'only games with options'
  };
};

/**
 * Checks if any filters are currently active
 * @param {Object} state - Application state
 * @returns {boolean} True if any filters are active
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
 * @module PaginationSelectors
 * @description Functions for handling pagination state
 */

/**
 * Retrieves pagination information for UI
 * @param {Object} state - Application state
 * @returns {Object} Pagination details
 */
export const getPaginationInfo = (state) => {
  return {
    currentPage: state.currentPage || 1,
    totalPages: state.totalPages || 0,
    hasNextPage: (state.currentPage || 1) < (state.totalPages || 0),
    hasPrevPage: (state.currentPage || 1) > 1
  };
};

/**
 * Determines if pagination controls should be displayed
 * @param {Object} state - Application state
 * @returns {boolean} True if pagination controls should be shown
 */
export const shouldShowPagination = (state) => {
  return (state.totalPages || 0) > 1;
};

/**
 * @module StatisticsSelectors
 * @description Functions for handling game statistics
 */

/**
 * Retrieves game statistics with fallback values
 * @param {Object} state - Application state
 * @returns {Object} Game statistics object
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
 * Formats statistics for UI display based on filter mode
 * @param {Object} state - Application state
 * @returns {Object} Formatted statistics for UI
 */
export const getFormattedStats = (state) => {
  const stats = getGameStats(state);
  const mode = getFilterMode(state);
  
  if (mode === 'SHOW_ALL') {
    return {
      primary: `${stats.total} total games`,
      secondary: `${stats.withOptions} with options, ${stats.withoutOptions} without`,
      description: `Showing all ${stats.total} games including ${stats.withoutOptions} without launch options.`
    };
  } else {
    return {
      primary: `${stats.withOptions} games with options`,
      secondary: `${stats.withoutOptions} games hidden`,
      description: `Showing only ${stats.withOptions} games with launch options. ${stats.withoutOptions} games hidden.`
    };
  }
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
  
  if (filters.showAll === true) {
    params.set('showAll', 'true');
  } else if (filters.hasOptions === true) {
    params.set('hasOptions', 'true');
  }

  Object.entries(filters).forEach(([key, value]) => {
    if (key === 'showAll' || key === 'hasOptions') return;
    
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