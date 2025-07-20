/**
 * @fileoverview API client with Options-First strategy support
 */

const API_URL = process.env.NODE_ENV === 'production' 
  ? '/api'  // Use relative URL in production (same domain)
  : 'http://localhost:8000/api';
  
/**
 * Cache implementation with Options-First metadata
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
 * Build query parameters with proper encoding and Options-First support
 */
function buildQueryParams(params) {
  const urlParams = new URLSearchParams();
  
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      // Handle boolean parameters properly
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
 * function to fetch games with Options-First strategy support
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
 * @param {string} [params.sort='total_options_count'] - Sort field
 * @param {string} [params.order='desc'] - Sort order
 * @param {boolean} [params.hasOptions=true] - Filter games with launch options
 * @param {boolean} [params.showAll=false] - Show all games including those without options
 * @param {boolean} [params.useCache=true] - Whether to use caching
 * @returns {Promise<Object>} games data with Options-First metadata
 * @throws {Error} When API request fails or returns invalid data
 * 
 * @example
 * // Options-First: Only games with launch options
 * const optionsOnly = await fetchGames({
 *   search: 'valve',
 *   category: 'fps'
 * });
 * 
 * // Show All: Include games without launch options
 * const allGames = await fetchGames({
 *   search: 'valve',
 *   showAll: true
 * });
 * 
 * // Explicit: Only games without launch options
 * const noOptions = await fetchGames({
 *   hasOptions: false,
 *   showAll: true
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
  sort = 'total_options_count', // Sort by options count
  order = 'desc', // Most options first
  hasOptions = true, // Only show games with options
  showAll = false, // Progressive disclosure override
  useCache = true
} = {}) {
  
  // Create cache key that includes Options-First parameters
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
    hasOptions: showAll ? undefined : hasOptions, // Don't include hasOptions when showAll is true
    showAll: showAll || undefined // Only include if true
  });

  const cacheKey = `games-v2:${queryParams}`;
  
  // Check cache first
  if (useCache && cache.has(cacheKey)) {
    console.log('📦 Cache hit (Options-First):', cacheKey);
    return cache.get(cacheKey);
  }

  const url = `${API_URL}/games${queryParams ? `?${queryParams}` : ''}`;
  console.log('🎯 API Request (Options-First):', url);
  console.log('📊 Strategy:', { hasOptions, showAll, sort, order });

  try {
    const response = await fetchWrapper(url);
    const data = await response.json();
    
    console.log('✅ API Response (Options-First):', {
      games: data.games?.length || 0,
      total: data.total || 0,
      strategy: data.meta?.strategy || 'unknown',
      showingOptionsOnly: data.meta?.showingOptionsOnly,
      showingAll: data.meta?.showingAll
    });
    
    // validation for Options-First response
    const result = {
      games: Array.isArray(data.games) ? data.games : [],
      total: typeof data.total === 'number' ? data.total : 0,
      totalPages: typeof data.totalPages === 'number' ? data.totalPages : 0,
      currentPage: typeof data.currentPage === 'number' ? data.currentPage : page,
      hasNextPage: typeof data.hasNextPage === 'boolean' ? data.hasNextPage : false,
      hasPrevPage: typeof data.hasPrevPage === 'boolean' ? data.hasPrevPage : false,
      facets: data.facets || {},
      
      // Options-First strategy metadata
      stats: data.stats || { withOptions: 0, withoutOptions: 0, total: 0, percentageWithOptions: 0 },
      meta: data.meta || { showingOptionsOnly: false, showingAll: false, strategy: 'unknown' }
    };
    
    // Cache the response
    if (useCache) {
      cache.set(cacheKey, result);
    }
    
    return result;
  } catch (error) {
    console.error('❌ Failed to fetch games:', error);
    throw new Error(`Failed to fetch games: ${error.message}`);
  }
}

/**
 * search suggestions with options-first prioritization
 * 
 * @async
 * @function getSearchSuggestions
 * @param {string} query - Search query (minimum 2 characters)
 * @param {number} [limit=10] - Maximum number of suggestions
 * @param {boolean} [prioritizeOptions=true] - Prioritize games with launch options
 * @returns {Promise<Array>} Array of prioritized search suggestion objects
 * @throws {Error} When API request fails (returns empty array as fallback)
 */
export async function getSearchSuggestions(query, limit = 10, prioritizeOptions = true) {
  if (!query || query.length < 2) return [];
  
  const cacheKey = `suggestions-v2:${query}:${limit}:${prioritizeOptions}`;
  
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  try {
    const queryParams = buildQueryParams({ 
      q: query, 
      limit,
      prioritizeOptions 
    });
    
    const response = await fetchWrapper(`${API_URL}/games/suggestions?${queryParams}`);
    const suggestions = await response.json();
    
    console.log(`🔍 Suggestions (prioritizeOptions: ${prioritizeOptions}):`, suggestions.length);
    
    const validSuggestions = Array.isArray(suggestions) ? suggestions : [];
    
    cache.set(cacheKey, validSuggestions);
    return validSuggestions;
  } catch (error) {
    console.error('❌ Failed to fetch suggestions:', error);
    return [];
  }
}

/**
 * filter facets with Options-First statistics
 * 
 * @async
 * @function getFilterFacets
 * @param {string} [searchQuery=''] - Optional search context for filtering facets
 * @param {boolean} [includeStats=true] - Include options statistics
 * @returns {Promise<Object>} Object containing categorized filter options and statistics
 */
export async function getFilterFacets(searchQuery = '', includeStats = true) {
  const cacheKey = `facets-v2:${searchQuery}:${includeStats}`;
  
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  try {
    const queryParams = buildQueryParams({ 
      search: searchQuery,
      includeStats 
    });
    
    const response = await fetchWrapper(`${API_URL}/games/facets${queryParams ? `?${queryParams}` : ''}`);
    const facets = await response.json();
    
    console.log('📊 Facets loaded:', Object.keys(facets));
    if (facets.statistics) {
      console.log('📈 Statistics:', facets.statistics);
    }
    
    // Ensure consistent facets structure with new statistics
    const result = {
      developers: Array.isArray(facets.developers) ? facets.developers : [],
      engines: Array.isArray(facets.engines) ? facets.engines : [],
      publishers: Array.isArray(facets.publishers) ? facets.publishers : [],
      genres: Array.isArray(facets.genres) ? facets.genres : [],
      platforms: Array.isArray(facets.platforms) ? facets.platforms : [],
      optionsRanges: Array.isArray(facets.optionsRanges) ? facets.optionsRanges : [],
      releaseYears: Array.isArray(facets.releaseYears) ? facets.releaseYears : [],
      
      // Options-First statistics
      statistics: facets.statistics || { 
        withOptions: 0, 
        withoutOptions: 0, 
        total: 0, 
        percentageWithOptions: 0 
      }
    };
    
    cache.set(cacheKey, result);
    return result;
  } catch (error) {
    console.error('❌ Failed to fetch facets:', error);
    return {
      developers: [],
      engines: [],
      publishers: [],
      genres: [],
      platforms: [],
      optionsRanges: [],
      releaseYears: [],
      statistics: { withOptions: 0, withoutOptions: 0, total: 0, percentageWithOptions: 0 }
    };
  }
}

export async function testOptionsFirstStrategy() {
  try {
    const response = await fetchWrapper(`${API_URL}/games/health/strategy`);
    const health = await response.json();
    
    console.log('🏥 Options-First strategy health:', health);
    return health;
  } catch (error) {
    console.error('❌ Strategy health check failed:', error);
    return { status: 'unhealthy', error: error.message };
  }
}

// Keep existing functions with behavior
export async function fetchGameDetails(gameId, useCache = true) {
  const cacheKey = `game:${gameId}`;
  
  if (useCache && cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }
  
  try {
    const response = await fetchWrapper(`${API_URL}/games/${gameId}`);
    const data = await response.json();
    
    console.log('🎮 Game Details Response:', data);
    
    if (useCache) {
      cache.set(cacheKey, data);
    }
    
    return data;
  } catch (error) {
    console.error(`❌ Failed to fetch game details for ${gameId}:`, error);
    throw new Error(`Failed to fetch details for game ${gameId}: ${error.message}`);
  }
}

export async function fetchLaunchOptions(gameId, useCache = true) {
  const cacheKey = `launch_options:${gameId}`;
  
  if (useCache && cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }
  
  try {
    const response = await fetchWrapper(`${API_URL}/games/${gameId}/launch-options`);
    const data = await response.json();
    
    console.log('🚀 Launch Options Response:', data);
    
    const launchOptions = Array.isArray(data) ? data : (data.launchOptions || []);
    
    if (useCache) {
      cache.set(cacheKey, launchOptions);
    }
    
    return launchOptions;
  } catch (error) {
    console.error(`❌ Failed to fetch launch options for ${gameId}:`, error);
    throw new Error(`Failed to fetch launch options for game ${gameId}: ${error.message}`);
  }
}

export async function getPopularSearches(limit = 5) {
  const cacheKey = `popular:${limit}`;
  
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  try {
    const response = await fetchWrapper(`${API_URL}/search/popular?limit=${limit}`);
    const popular = await response.json();
    
    const validPopular = Array.isArray(popular) ? popular : [];
    cache.set(cacheKey, validPopular);
    return validPopular;
  } catch (error) {
    console.warn('❌ Popular searches endpoint not available:', error);
    return [];
  }
}

export async function fetchGamesInBatch(gameIds) {
  if (!Array.isArray(gameIds) || gameIds.length === 0) {
    return [];
  }

  const cacheKey = `batch:${gameIds.sort().join(',')}`;
  
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  try {
    const gamePromises = gameIds.map(id => fetchGameDetails(id));
    const games = await Promise.allSettled(gamePromises);
    
    const validGames = games
      .filter(result => result.status === 'fulfilled')
      .map(result => result.value);
    
    cache.set(cacheKey, validGames);
    return validGames;
  } catch (error) {
    console.error('❌ Failed to batch fetch games:', error);
    throw new Error('Failed to fetch games in batch');
  }
}

export async function advancedSearch({
  query = '',
  filters = {},
  sort = { field: 'total_options_count', order: 'desc' },
  page = 1,
  limit = 20,
  fuzzy = false,
  exactMatch = false,
  hasOptions = true, // Options-First default
  showAll = false // Progressive disclosure
} = {}) {
  
  return fetchGames({
    page,
    limit,
    search: query,
    sort: sort.field,
    order: sort.order,
    hasOptions,
    showAll,
    ...filters
  });
}

/**
 * cache management with Options-First considerations
 */
export function clearCache(pattern) {
  if (pattern) {
    cache.clearPattern(pattern);
  } else {
    cache.clear();
  }
  console.log('🧹 Cache cleared:', pattern || 'all');
}

export function invalidateSearchCache() {
  cache.clearPattern('^(games|suggestions|facets|popular|statistics)');
  console.log('🔄 Search cache invalidated');
}

export function invalidateGameCache(gameId) {
  if (gameId) {
    cache.delete(`game:${gameId}`);
    cache.delete(`launch_options:${gameId}`);
  } else {
    cache.clearPattern('^(game|launch_options):');
  }
  console.log('🎮 Game cache invalidated:', gameId || 'all');
}

/**
 * preloading with Options-First strategy
 */
export async function preloadPopularContent() {
  try {
    console.log('🚀 Preloading content with Options-First strategy...');
    
    // Preload first page with Options-First defaults
    await fetchGames({ 
      page: 1, 
      useCache: true,
      hasOptions: true,
      sort: 'total_options_count',
      order: 'desc'
    });
    
    // Preload filter facets with statistics
    await getFilterFacets('', true);
    
    // Preload game statistics
    await getGameStatistics();
    
    console.log('✅ Options-First content preloaded');
  } catch (error) {
    console.warn('⚠️ Failed to preload content:', error);
  }
}

export async function checkAPIHealth() {
  try {
    // Test both Options-First and traditional endpoints
    const [optionsFirstTest, healthTest] = await Promise.all([
      fetch(`${API_URL}/games?limit=1&hasOptions=true`).then(r => r.json()),
      fetch(`${API_URL}/games/test`).then(r => r.json())
    ]);
    
    console.log('🏥 API Health:', {
      optionsFirst: optionsFirstTest.meta?.strategy === 'options-first',
      traditional: healthTest.message?.includes('API is working')
    });
    
    return true;
  } catch (error) {
    console.error('❌ API health check failed:', error);
    return false;
  }
}

// Export cache instance for external management
export { cache };
