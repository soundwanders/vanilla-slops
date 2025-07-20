/**
 * @fileoverview API client for Steam Launch Options backend
 * Provides intelligent caching, retry logic, and comprehensive error handling
 * Supports all backend endpoints with proper parameter validation
 */

const API_URL = process.env.NODE_ENV === 'production' 
  ? '/api'  // Use relative URL in production (same domain)
  : 'http://localhost:8000/api';
  
/**
 * Intelligent cache implementation with TTL and size management
 * Prevents memory leaks while maintaining performance benefits
 * 
 * @class SlopCache
 * @param {number} [maxSize=100] - Maximum number of cached entries
 * @param {number} [ttl=300000] - Time to live in milliseconds (5 minutes)
 */
class SlopCache {
  constructor(maxSize = 100, ttl = 5 * 60 * 1000) { // 5 minutes TTL
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttl = ttl;
  }

  set(key, value) {
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
 * Fetch wrapper with exponential backoff retry logic
 * Provides consistent error handling and request formatting
 * 
 * @async
 * @function fetchWrapper
 * @param {string} url - Request URL
 * @param {Object} [options={}] - Fetch options
 * @param {Object} [options.headers] - Request headers
 * @param {string} [options.method='GET'] - HTTP method
 * @param {string} [options.body] - Request body
 * @returns {Promise<Response>} Fetch response object
 * @throws {Error} When all retry attempts fail
 */
async function fetchWrapper(url, options = {}) {
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
        const errorText = await response.text();
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error || errorMessage;
        } catch {
          // If response isn't JSON, use the text
          errorMessage = errorText || errorMessage;
        }
        
        throw new Error(errorMessage);
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
    // Handle boolean values correctly
    if (value !== undefined && value !== null && value !== '') {
      // Special handling for boolean parameters
      if (typeof value === 'boolean') {
        urlParams.set(key, value.toString());
      } else {
        urlParams.set(key, value.toString());
      }
    }
  });
  
  return urlParams.toString();
}

/**
 * Main function to fetch games with comprehensive filtering and pagination
 * Supports search, category filters, sorting, and caching
 * 
 * @async
 * @function fetchGames
 * @param {Object} params - Query parameters
 * @param {number} [params.page=1] - Page number for pagination
 * @param {number} [params.limit=20] - Number of items per page
 * @param {string} [params.search=''] - Search query for games
 * @param {string} [params.category=''] - Game category filter
 * @param {string} [params.developer=''] - Developer name filter
 * @param {string} [params.options=''] - Launch options filter type
 * @param {string} [params.year=''] - Release year filter
 * @param {string} [params.sort='title'] - Sort field
 * @param {string} [params.order='asc'] - Sort order
 * @param {boolean} [params.useCache=true] - Whether to use caching
 * @returns {Promise<Object>} Games data with pagination metadata
 * @throws {Error} When API request fails or returns invalid data
 * 
 * @example
 * const result = await fetchGames({
 *   search: 'valve',
 *   category: 'fps',
 *   page: 1,
 *   limit: 20
 * });
 */
export async function fetchGames({
  page = 1,
  limit = 20,
  search = '',
  category = '',
  developer = '',
  options = '',
  year = '',
  sort = 'title',
  order = 'asc',
  useCache = true,
  hasOptions,
  showAll
} = {}) {
  
  const queryParams = buildQueryParams({
    page,
    limit,
    search,
    category,
    developer,
    options,
    year,
    sort,
    order,
    hasOptions,
    showAll
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
    const response = await fetchWrapper(url);
    const data = await response.json();
    
    console.log('API Response:', data);
    
    // Validate response structure
    const result = {
      games: Array.isArray(data.games) ? data.games : [],
      total: typeof data.total === 'number' ? data.total : 0,
      totalPages: typeof data.totalPages === 'number' ? data.totalPages : 0,
      currentPage: typeof data.currentPage === 'number' ? data.currentPage : page,
      hasNextPage: typeof data.hasNextPage === 'boolean' ? data.hasNextPage : false,
      hasPrevPage: typeof data.hasPrevPage === 'boolean' ? data.hasPrevPage : false,
      facets: data.facets || {}
    };
    
    // Cache the response
    if (useCache) {
      cache.set(cacheKey, result);
    }
    
    return result;
  } catch (error) {
    console.error('Failed to fetch games:', error);
    throw new Error(`Failed to fetch games: ${error.message}`);
  }
}

/**
 * Retrieves intelligent search suggestions for autocomplete functionality
 * Implements caching to reduce API calls and improve response times
 * 
 * @async
 * @function getSearchSuggestions
 * @param {string} query - Search query (minimum 2 characters)
 * @param {number} [limit=10] - Maximum number of suggestions
 * @returns {Promise<Array>} Array of search suggestion objects
 * @throws {Error} When API request fails (returns empty array as fallback)
 * 
 * @example
 * const suggestions = await getSearchSuggestions('half', 5);
 * // Returns: [
 * //   { type: 'title', value: 'Half-Life', category: 'Games' },
 * //   { type: 'developer', value: 'Valve Corporation', category: 'Developers' }
 * // ]
 */
export async function getSearchSuggestions(query, limit = 10) {
  if (!query || query.length < 2) return [];
  
  const cacheKey = `suggestions:${query}:${limit}`;
  
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  try {
    const queryParams = buildQueryParams({ q: query, limit });
    const response = await fetchWrapper(`${API_URL}/games/suggestions?${queryParams}`);
    const suggestions = await response.json();
    
    // Validate suggestions format
    const validSuggestions = Array.isArray(suggestions) ? suggestions : [];
    
    cache.set(cacheKey, validSuggestions);
    return validSuggestions;
  } catch (error) {
    console.error('Failed to fetch suggestions:', error);
    return [];
  }
}

/**
 * Fetches available filter options (facets) for dynamic UI generation
 * Used to populate filter dropdowns with current available options
 * 
 * @async
 * @function getFilterFacets
 * @param {string} [searchQuery=''] - Optional search context for filtering facets
 * @returns {Promise<Object>} Object containing categorized filter options
 * @property {Array} developers - Available developers with counts
 * @property {Array} engines - Available engines with counts
 * @property {Array} publishers - Available publishers with counts
 * @property {Array} genres - Available genres
 * @property {Array} platforms - Available platforms
 * @property {Array} optionsRanges - Launch options count ranges
 * @property {Array} releaseYears - Available release years
 * @throws {Error} When API request fails (returns empty structure as fallback)
 */
export async function getFilterFacets(searchQuery = '') {
  const cacheKey = `facets:${searchQuery}`;
  
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  try {
    const queryParams = searchQuery ? `?search=${encodeURIComponent(searchQuery)}` : '';
    const response = await fetchWrapper(`${API_URL}/games/facets${queryParams}`);
    const facets = await response.json();
    
    // Ensure consistent facets structure
    const result = {
      developers: Array.isArray(facets.developers) ? facets.developers : [],
      engines: Array.isArray(facets.engines) ? facets.engines : [],
      publishers: Array.isArray(facets.publishers) ? facets.publishers : [],
      genres: Array.isArray(facets.genres) ? facets.genres : [],
      platforms: Array.isArray(facets.platforms) ? facets.platforms : [],
      optionsRanges: Array.isArray(facets.optionsRanges) ? facets.optionsRanges : [],
      releaseYears: Array.isArray(facets.releaseYears) ? facets.releaseYears : []
    };
    
    cache.set(cacheKey, result);
    return result;
  } catch (error) {
    console.error('Failed to fetch facets:', error);
    return {
      developers: [],
      engines: [],
      publishers: [],
      genres: [],
      platforms: [],
      optionsRanges: [],
      releaseYears: []
    };
  }
}

/**
 * Fetch game details
 */
export async function fetchGameDetails(gameId, useCache = true) {
  const cacheKey = `game:${gameId}`;
  
  if (useCache && cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }
  
  try {
    const response = await fetchWrapper(`${API_URL}/games/${gameId}`);
    const data = await response.json();
    
    console.log('Game Details Response:', data);
    
    if (useCache) {
      cache.set(cacheKey, data);
    }
    
    return data;
  } catch (error) {
    console.error(`Failed to fetch game details for ${gameId}:`, error);
    throw new Error(`Failed to fetch details for game ${gameId}: ${error.message}`);
  }
}

/**
 * Fetch launch options for a specific game
 */
export async function fetchLaunchOptions(gameId, useCache = true) {
  const cacheKey = `launch_options:${gameId}`;
  
  if (useCache && cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }
  
  try {
    const response = await fetchWrapper(`${API_URL}/games/${gameId}/launch-options`);
    const data = await response.json();
    
    console.log('Launch Options Response:', data);
    
    // Ensure we return an array
    const launchOptions = Array.isArray(data) ? data : (data.launchOptions || []);
    
    if (useCache) {
      cache.set(cacheKey, launchOptions);
    }
    
    return launchOptions;
  } catch (error) {
    console.error(`Failed to fetch launch options for ${gameId}:`, error);
    throw new Error(`Failed to fetch launch options for game ${gameId}: ${error.message}`);
  }
}

/**
 * Get popular searches (if backend implements this)
 */
export async function getPopularSearches(limit = 5) {
  const cacheKey = `popular:${limit}`;
  
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  try {
    // This endpoint might not exist yet, so handle gracefully
    const response = await fetchWrapper(`${API_URL}/search/popular?limit=${limit}`);
    const popular = await response.json();
    
    const validPopular = Array.isArray(popular) ? popular : [];
    cache.set(cacheKey, validPopular);
    return validPopular;
  } catch (error) {
    console.warn('Popular searches endpoint not available:', error);
    return [];
  }
}

/**
 * Batch fetch multiple games (if needed)
 */
export async function fetchGamesInBatch(gameIds) {
  if (!Array.isArray(gameIds) || gameIds.length === 0) {
    return [];
  }

  const cacheKey = `batch:${gameIds.sort().join(',')}`;
  
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  try {
    // For now, fetch games individually since batch endpoint might not exist
    const gamePromises = gameIds.map(id => fetchGameDetails(id));
    const games = await Promise.allSettled(gamePromises);
    
    const validGames = games
      .filter(result => result.status === 'fulfilled')
      .map(result => result.value);
    
    cache.set(cacheKey, validGames);
    return validGames;
  } catch (error) {
    console.error('Failed to batch fetch games:', error);
    throw new Error('Failed to fetch games in batch');
  }
}

/**
 * Advanced search
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
  
  // For now, map to regular fetchGames
  return fetchGames({
    page,
    limit,
    search: query,
    sort: sort.field,
    order: sort.order,
    ...filters
  });
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
 * Preloads frequently accessed content
 * Caches first page of games and filter facets in background
 * 
 * @async
 * @function preloadPopularContent
 * @returns {Promise<void>} Resolves when preloading is complete
 * @throws {Error} Logs warnings but doesn't throw to prevent app initialization failure
 */
export async function preloadPopularContent() {
  try {
    // Preload first page with default sorting
    await fetchGames({ page: 1, useCache: true });
    
    // Preload filter facets
    await getFilterFacets();
    
    console.log('Popular content preloaded');
  } catch (error) {
    console.warn('Failed to preload content:', error);
  }
}

/**
 * Performs API health check to verify backend connectivity
 * Used for monitoring and graceful degradation
 * 
 * @async
 * @function checkAPIHealth
 * @returns {Promise<boolean>} True if API is responsive, false otherwise
 */
export async function checkAPIHealth() {
  try {
    const response = await fetch(`${API_URL}/games?limit=1`);
    return response.ok;
  } catch (error) {
    console.error('API health check failed:', error);
    return false;
  }
}

// Export cache instance for external management
export { cache };