/**
 * State Selectors for Vanilla Slops
 * These functions eliminate repeated state access patterns and provide
 * a single source of truth for derived state computations.
 */

// ============================================================================
// FILTER SELECTORS - Your biggest pain point
// ============================================================================

/**
 * Get sanitized filters with defaults - eliminates redundant `|| ''` patterns
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
 * Build API query parameters 
 */
export const getAPIQueryParams = (state, additionalParams = {}) => {
  const filters = getCleanFilters(state);
  
  return {
    page: state.currentPage || 1,
    limit: 20, // PAGE_SIZE constant
    ...filters,
    ...additionalParams // Allow overrides
  };
};

/**
 * Build base filters from URL params
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
 * Get API filters object for specific calls
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

// ============================================================================
// UI STATE SELECTORS - Complex derivations
// ============================================================================

/**
 * Determine current filtering mode
 */
export const getFilterMode = (state) => {
  const filters = state.filters || {};
  return filters.showAll ? 'SHOW_ALL' : 'OPTIONS_FIRST';
};

/**
 * Determine if show-all checkbox should be checked
 */
export const shouldShowAllCheckboxBeChecked = (state) => {
  return (state.filters?.showAll === true);
};

/**
 * Get checkbox state description for debugging
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
 * Check if any filters are active (for UI indicators)
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

// ============================================================================
// PAGINATION SELECTORS
// ============================================================================

/**
 * Get pagination info for UI
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
 * Check if should show pagination controls
 */
export const shouldShowPagination = (state) => {
  return (state.totalPages || 0) > 1;
};

// ============================================================================
// STATISTICS SELECTORS
// ============================================================================

/**
 * Get game statistics with fallbacks
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
 * Get formatted statistics for UI display
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

// ============================================================================
// URL/NAVIGATION SELECTORS
// ============================================================================

/**
 * Build URL parameters for browser history
 */
export const getURLParams = (state) => {
  const params = new URLSearchParams();
  const filters = getCleanFilters(state);
  
  // Handle show all logic
  if (filters.showAll === true) {
    params.set('showAll', 'true');
  } else if (filters.hasOptions === true) {
    params.set('hasOptions', 'true');
  }

  // Add filter params
  Object.entries(filters).forEach(([key, value]) => {
    if (key === 'showAll' || key === 'hasOptions') return;
    
    if (value !== undefined && value !== null && value !== '' && value.toString().trim()) {
      params.set(key, value);
    }
  });

  // Add page if not first
  if ((state.currentPage || 1) > 1) {
    params.set('page', state.currentPage);
  }

  return params;
};

/**
 * Get complete URL for current state
 */
export const getCurrentURL = (state) => {
  const params = getURLParams(state);
  return `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
};

// ============================================================================
// LOADING/UI STATE SELECTORS
// ============================================================================

/**
 * Check if app is in loading state
 */
export const isLoading = (state) => {
  return state.isLoading === true;
};

/**
 * Check if app is ready for user interaction
 */
export const isAppReady = (state) => {
  return !isLoading(state) && state.filtersInitialized === true;
};

/**
 * Get scroll behavior info
 */
export const getScrollInfo = (state) => {
  return {
    lastPosition: state.lastScrollPosition || 0,
    shouldPreventScroll: state.preventNextScroll === true,
    shouldRestore: state.preventNextScroll === true && state.lastScrollPosition > 0
  };
};

// ============================================================================
// COMPONENT SELECTORS
// ============================================================================

/**
 * Check if search component is available and has values
 */
export const hasSearchInstanceWithValues = (state) => {
  return !!(state.searchInstance && hasActiveFilters(state));
};

/**
 * Get search component sync data
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
