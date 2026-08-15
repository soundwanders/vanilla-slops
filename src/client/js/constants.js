// Mobile layout
export const MOBILE_BREAKPOINT = 768;
export const TOUCH_TARGET_MIN_PX = 44;

// Search debounce tiers
export const SUGGESTION_DEBOUNCE_MS = 150;
export const SEARCH_DEBOUNCE_MS = 800;
export const MAX_SEARCH_DEBOUNCE_MS = 2000;

// Default result ordering — the curated front page. Lives here because the
// initial state, the URL serializer and the search component all have to agree
// on it; when they disagreed, the first filter change knocked the front page
// off "featured" and the default leaked into every URL.
export const DEFAULT_SORT = 'featured';
export const DEFAULT_ORDER = 'desc';

// API / pagination defaults
export const DEFAULT_PAGE_SIZE = 20;
export const SUGGESTION_LIMIT = 10;
export const MAX_RESULTS_PER_PAGE = 100;

// Client cache
export const CACHE_MAX_SIZE = 100;
export const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Fetch retry
export const FETCH_MAX_RETRIES = 3;
