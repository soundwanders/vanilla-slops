// Enhanced API client with smart caching and search features
const API_URL = 'http://localhost:8000/api';

/**
 * Cache with TTL and size limits
 */
class SlopCache {
  constructor(maxSize = 100, ttl = 5 * 60 * 1000) { // 5 minutes TTL
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttl = ttl;
  }

  set(key, value) {
    // Remove oldest entries if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
  }

  get(key) {
    const entry = this.cache.get(key);
    
    if (!entry) return null;
    
    // Check if expired
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.value;
  }

  has(key) {
    return this.get(key) !== null;
  }

  delete(key) {
    this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }

  // Clear entries matching a pattern
  clearPattern(pattern) {
    const regex = new RegExp(pattern);
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
      }
    }
  }
}

const cache = new SlopCache();

/**
 * Enhanced fetch with retry logic and error handling
 */
async function enhancedFetch(url, options = {}) {
  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response;
    } catch (error) {
      attempt++;
      
      if (attempt >= maxRetries) {
        console.error(`Request failed after ${maxRetries} attempts:`, error);
        throw error;
      }
      
      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }
}

/**
 * Build query parameters with proper encoding
 */
function buildQueryParams(params) {
  const urlParams = new URLSearchParams();
  
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      urlParams.set(key, value.toString());
    }
  });
  
  return urlParams.toString();
}

/**
 * Enhanced fetchGames with advanced filtering and search
 * @param {Object} params - Query parameters
 * @param {number} [params.page=1] - Page number
 * @param {string} [params.search] - Search query
 * @param {string} [params.genre] - Genre filter
 * @param {string} [params.engine] - Engine filter
 * @param {string} [params.platform] - Platform filter
 * @param {string} [params.sort='title'] - Sort field
 * @param {string} [params.order='asc'] - Sort order
 * @param {number} [params.minOptionsCount] - Minimum launch options count
 * @param {number} [params.maxOptionsCount] - Maximum launch options count
 * @param {string} [params.releaseYear] - Release year filter
 * @param {boolean} [params.hasLaunchOptions] - Filter by launch options availability
 * @param {boolean} [params.useCache=true] - Whether to use caching
 */
export async function fetchGames({
  page = 1,
  search = '',
  genre = '',
  engine = '',
  platform = '',
  sort = 'title',
  order = 'asc',
  minOptionsCount,
  maxOptionsCount,
  releaseYear,
  hasLaunchOptions,
  useCache = true
} = {}) {
  
  const queryParams = buildQueryParams({
    page,
    search,
    genre,
    engine,
    platform,
    sort,
    order,
    minOptionsCount,
    maxOptionsCount,
    releaseYear,
    hasLaunchOptions
  });

  const cacheKey = `games:${queryParams}`;
  
  // Check cache first
  if (useCache && cache.has(cacheKey)) {
    console.log('Cache hit:', cacheKey);
    return cache.get(cacheKey);
  }

  const url = `${API_URL}/games${queryParams ? `?${queryParams}` : ''}`;
  console.log('API Request:', url);

  try {
    const response = await enhancedFetch(url);
    const data = await response.json();
    
    console.log('API Response:', data);
    
    // Cache the response
    if (useCache) {
      cache.set(cacheKey, data);
    }
    
    return data;
  } catch (error) {
    console.error('Failed to fetch games:', error);
    throw new Error('Failed to fetch games. Please try again.');
  }
}

/**
 * Get search suggestions with debouncing
 */
export async function getSearchSuggestions(query, limit = 10) {
  if (!query || query.length < 2) return [];
  
  const cacheKey = `suggestions:${query}:${limit}`;
  
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  try {
    const response = await enhancedFetch(`${API_URL}/search/suggestions?q=${encodeURIComponent(query)}&limit=${limit}`);
    const suggestions = await response.json();
    
    cache.set(cacheKey, suggestions);
    return suggestions;
  } catch (error) {
    console.error('Failed to fetch suggestions:', error);
    return [];
  }
}

/**
 * Get popular searches
 */
export async function getPopularSearches(limit = 5) {
  const cacheKey = `popular:${limit}`;
  
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  try {
    const response = await enhancedFetch(`${API_URL}/search/popular?limit=${limit}`);
    const popular = await response.json();
    
    cache.set(cacheKey, popular);
    return popular;
  } catch (error) {
    console.error('Failed to fetch popular searches:', error);
    return [];
  }
}

/**
 * Get filter facets for dynamic UI
 */
export async function getFilterFacets(searchQuery = '') {
  const cacheKey = `facets:${searchQuery}`;
  
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  try {
    const queryParams = searchQuery ? `?search=${encodeURIComponent(searchQuery)}` : '';
    const response = await enhancedFetch(`${API_URL}/games/facets${queryParams}`);
    const facets = await response.json();
    
    cache.set(cacheKey, facets);
    return facets;
  } catch (error) {
    console.error('Failed to fetch facets:', error);
    return {
      genres: [],
      engines: [],
      platforms: [],
      optionsRanges: [],
      releaseYears: []
    };
  }
}

/**
 * Enhanced game details fetch
 */
export async function fetchGameDetails(gameId, useCache = true) {
  const cacheKey = `game:${gameId}`;
  
  if (useCache && cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }
  
  try {
    const response = await enhancedFetch(`${API_URL}/games/${gameId}`);
    const data = await response.json();
    
    console.log('Game Details Response:', data);
    
    if (useCache) {
      cache.set(cacheKey, data);
    }
    
    return data;
  } catch (error) {
    console.error(`Failed to fetch game details for ${gameId}:`, error);
    throw new Error(`Failed to fetch details for game ${gameId}`);
  }
}

/**
 * Enhanced launch options fetch
 */
export async function fetchLaunchOptions(gameId, useCache = true) {
  const cacheKey = `launch_options:${gameId}`;
  
  if (useCache && cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }
  
  try {
    const response = await enhancedFetch(`${API_URL}/games/${gameId}/launch-options`);
    const data = await response.json();
    
    console.log('Launch Options Response:', data);
    
    if (useCache) {
      cache.set(cacheKey, data);
    }
    
    return data;
  } catch (error) {
    console.error(`Failed to fetch launch options for ${gameId}:`, error);
    throw new Error(`Failed to fetch launch options for game ${gameId}`);
  }
}

/**
 * Batch fetch multiple games
 */
export async function fetchGamesInBatch(gameIds) {
  const cacheKey = `batch:${gameIds.sort().join(',')}`;
  
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  try {
    const response = await enhancedFetch(`${API_URL}/games/batch`, {
      method: 'POST',
      body: JSON.stringify({ gameIds })
    });
    const data = await response.json();
    
    cache.set(cacheKey, data);
    return data;
  } catch (error) {
    console.error('Failed to batch fetch games:', error);
    throw new Error('Failed to fetch games in batch');
  }
}

/**
 * Search with advanced options
 */
export async function advancedSearch({
  query = '',
  filters = {},
  sort = { field: 'title', order: 'asc' },
  page = 1,
  limit = 20,
  fuzzy = false,
  exactMatch = false
} = {}) {
  
  const searchParams = {
    q: query,
    page,
    limit,
    sort: sort.field,
    order: sort.order,
    fuzzy: fuzzy ? 'true' : 'false',
    exact: exactMatch ? 'true' : 'false',
    ...filters
  };

  const queryString = buildQueryParams(searchParams);
  const cacheKey = `advanced_search:${queryString}`;
  
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  try {
    const response = await enhancedFetch(`${API_URL}/search/advanced?${queryString}`);
    const data = await response.json();
    
    cache.set(cacheKey, data);
    return data;
  } catch (error) {
    console.error('Advanced search failed:', error);
    throw new Error('Advanced search failed');
  }
}

/**
 * Cache management functions
 */
export function clearCache(pattern) {
  if (pattern) {
    cache.clearPattern(pattern);
  } else {
    cache.clear();
  }
}

export function invalidateSearchCache() {
  cache.clearPattern('^(games|suggestions|facets|popular):');
}

export function invalidateGameCache(gameId) {
  if (gameId) {
    cache.delete(`game:${gameId}`);
    cache.delete(`launch_options:${gameId}`);
  } else {
    cache.clearPattern('^(game|launch_options):');
  }
}

/**
 * Preload popular content
 */
export async function preloadPopularContent() {
  try {
    // Preload first page with default sorting
    await fetchGames({ page: 1, useCache: true });
    
    // Preload popular searches
    await getPopularSearches();
    
    // Preload filter facets
    await getFilterFacets();
    
    console.log('Popular content preloaded');
  } catch (error) {
    console.error('Failed to preload content:', error);
  }
}

// Export cache instance for external management
export { cache };