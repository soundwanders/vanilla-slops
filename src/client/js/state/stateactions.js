// Add these actions to your StateManager class
// These handle all the specific patterns found in your codebase

const stateActions = {
  // Loading state management
  SET_LOADING: (state, payload) => ({
    ...state,
    isLoading: payload
  }),

  // Pagination management
  SET_CURRENT_PAGE: (state, payload) => ({
    ...state,
    currentPage: payload
  }),

  SET_TOTAL_PAGES: (state, payload) => ({
    ...state,
    totalPages: payload
  }),

  // Filter management - your most complex use case
  SET_FILTERS: (state, payload) => ({
    ...state,
    filters: { ...payload }
  }),

  MERGE_FILTERS: (state, payload) => ({
    ...state,
    filters: { ...state.filters, ...payload }
  }),

  UPDATE_FILTER: (state, payload) => ({
    ...state,
    filters: {
      ...state.filters,
      [payload.key]: payload.value
    }
  }),

  // Reset filters while preserving structure
  RESET_FILTERS: (state, payload = {}) => ({
    ...state,
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
      order: 'asc',
      ...payload // Allow partial overrides
    }
  }),

  // Component reference management
  SET_SEARCH_INSTANCE: (state, payload) => ({
    ...state,
    searchInstance: payload
  }),

  // Initialization flags
  SET_FILTERS_INITIALIZED: (state, payload) => ({
    ...state,
    filtersInitialized: payload
  }),

  // Statistics management
  SET_GAME_STATS: (state, payload) => ({
    ...state,
    gameStats: { ...payload }
  }),

  MERGE_STATS: (state, payload) => ({
    ...state,
    gameStats: { ...state.gameStats, ...payload }
  }),

  // UI state tracking
  SET_SCROLL_POSITION: (state, payload) => ({
    ...state,
    lastScrollPosition: payload
  }),

  SET_PREVENT_SCROLL: (state, payload) => ({
    ...state,
    preventNextScroll: payload
  }),

  // Compound actions for common use cases
  RESET_TO_PAGE_ONE: (state, payload) => ({
    ...state,
    currentPage: 1
  }),

  // Handle the complex show-all filter logic
  TOGGLE_SHOW_ALL: (state, payload) => {
    const isShowingAll = payload;
    return {
      ...state,
      filters: {
        ...state.filters,
        showAll: isShowingAll,
        hasOptions: isShowingAll ? undefined : true
      },
      currentPage: 1 // Reset pagination on filter change
    };
  },

  // Initialize app state (useful for startup)
  INITIALIZE_APP: (state, payload) => ({
    ...state,
    ...payload,
    isLoading: false
  }),

  // Batch update for performance (multiple changes at once)
  BATCH_UPDATE: (state, payload) => ({
    ...state,
    ...payload
  })
};

// Helper function to add these to your StateManager
function addVanillaSlopActions(stateManager) {
  Object.entries(stateActions).forEach(([actionName, actionHandler]) => {
    stateManager.addAction(actionName, actionHandler);
  });
  
  console.log('✅ Added all Vanilla Slops actions to StateManager');
}

// Export for use in your main.js
export { stateActions, addVanillaSlopActions };