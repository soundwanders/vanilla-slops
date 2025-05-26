import supabase from '../config/supabaseClient.js';

/**
 * @typedef {Object} SearchFilters
 * @property {string} [searchQuery=''] - Search term to match against title, developer, and publisher
 * @property {string} [genre=''] - Filter by specific genre
 * @property {string} [engine=''] - Filter by game engine
 * @property {string} [platform=''] - Filter by platform
 * @property {string} [sort='title'] - Field to sort by (title, release_date, developer, publisher, total_options_count, created_at)
 * @property {string} [order='asc'] - Sort order ('asc' or 'desc')
 * @property {number} [page=1] - Page number for pagination (1-based)
 * @property {number} [limit=20] - Number of results per page
 * @property {number} [minOptionsCount] - Minimum number of launch options
 * @property {number} [maxOptionsCount] - Maximum number of launch options
 * @property {string} [releaseYear] - Filter by release year (YYYY format)
 * @property {boolean} [hasLaunchOptions] - Filter games with/without launch options
 */

/**
 * @typedef {Object} FacetValue
 * @property {string} value - The facet value
 * @property {number} count - Number of games with this value
 */

/**
 * @typedef {Object} OptionsRange
 * @property {string} label - Display label for the range
 * @property {number} min - Minimum value in range
 * @property {number} max - Maximum value in range
 * @property {number} count - Number of games in this range
 */

/**
 * @typedef {Object} GamesFacets
 * @property {FacetValue[]} genres - Available genres with counts
 * @property {FacetValue[]} engines - Available engines with counts
 * @property {FacetValue[]} platforms - Available platforms with counts
 * @property {OptionsRange[]} optionsRanges - Launch options count ranges
 * @property {string[]} releaseYears - Available release years
 */

/**
 * @typedef {Object} GamesResult
 * @property {Object[]} games - Array of game objects
 * @property {number} total - Total number of games matching the query
 * @property {number} totalPages - Total number of pages
 * @property {number} currentPage - Current page number
 * @property {GamesFacets} facets - Available filter options
 * @property {boolean} hasNextPage - Whether there's a next page
 * @property {boolean} hasPrevPage - Whether there's a previous page
 */

/**
 * @typedef {Object} SearchSuggestion
 * @property {string} type - Type of suggestion ('title', 'developer', 'publisher')
 * @property {string} value - The suggested value
 * @property {string} category - Display category for grouping suggestions
 */

/**
 * @typedef {Object} PopularSearch
 * @property {string} type - Type of search ('developer', 'engine')
 * @property {string} value - The search value
 */

/**
 * @typedef {Object} LaunchOption
 * @property {number} id - Launch option ID
 * @property {string} command - Launch command
 * @property {string} description - Description of the launch option
 * @property {number} upvotes - Number of upvotes
 * @property {number} downvotes - Number of downvotes
 * @property {Object} sources - Source information with reliability score
 */

/**
 * @typedef {Object} GameWithLaunchOptions
 * @property {number} app_id - Steam app ID
 * @property {string} title - Game title
 * @property {string} developer - Game developer
 * @property {string} publisher - Game publisher
 * @property {string} genre - Game genre
 * @property {string} engine - Game engine
 * @property {string} platform - Game platform
 * @property {string} release_date - Release date
 * @property {number} total_options_count - Total number of launch options
 * @property {LaunchOption[]} launchOptions - Array of launch options for this game
 */

export async function fetchGames({
  searchQuery = '',
  genre = '',
  engine = '',
  platform = '',
  sort = 'title',
  order = 'asc',
  page = 1,
  limit = 20,
  minOptionsCount,
  maxOptionsCount,
  releaseYear,
  hasLaunchOptions
} = {}) {
  const offset = (page - 1) * limit;
  
  // Build the main query
  let query = supabase
    .from('games')
    .select('*', { count: 'exact' });

  // Apply search filters
  query = applySearchFilters(query, {
    searchQuery,
    genre,
    engine,
    platform,
    minOptionsCount,
    maxOptionsCount,
    releaseYear,
    hasLaunchOptions
  });

  // Apply sorting
  query = applySorting(query, sort, order);
  
  // Apply pagination
  query = query.range(offset, offset + limit - 1);

  const { data, count, error } = await query;
  
  if (error) {
    console.error('Supabase query error:', error);
    throw new Error('Failed to fetch games from database');
  }

  // Get facets for better filtering UI
  const facets = await getFacets(searchQuery);
  
  return {
    games: data || [],
    total: count || 0,
    totalPages: Math.ceil((count || 0) / limit),
    currentPage: page,
    facets,
    hasNextPage: page < Math.ceil((count || 0) / limit),
    hasPrevPage: page > 1
  };
}

/**
 * Apply search and filter conditions to the Supabase query
 * @private
 * @param {import('@supabase/supabase-js').PostgrestQueryBuilder} query - Supabase query builder instance
 * @param {SearchFilters} filters - Filter parameters to apply
 * @returns {import('@supabase/supabase-js').PostgrestQueryBuilder} Modified query with filters applied
 */
function applySearchFilters(query, filters) {
  const {
    searchQuery,
    genre,
    engine,
    platform,
    minOptionsCount,
    maxOptionsCount,
    releaseYear,
    hasLaunchOptions
  } = filters;

  // Enhanced multi-field search
  if (searchQuery) {
    const searchTerms = searchQuery.trim().split(/\s+/);
    
    if (searchTerms.length === 1) {
      // Single term - search across multiple fields
      const term = searchTerms[0];
      query = query.or(`title.ilike.%${term}%,developer.ilike.%${term}%,publisher.ilike.%${term}%`);
    } else {
      // Multiple terms - each term must match at least one field
      searchTerms.forEach(term => {
        query = query.or(`title.ilike.%${term}%,developer.ilike.%${term}%,publisher.ilike.%${term}%`);
      });
    }
  }

  // Exact match filters
  if (genre) query = query.eq('genre', genre);
  if (engine) query = query.eq('engine', engine);
  if (platform) query = query.eq('platform', platform);

  // Range filters
  if (minOptionsCount !== undefined) {
    query = query.gte('total_options_count', minOptionsCount);
  }
  if (maxOptionsCount !== undefined) {
    query = query.lte('total_options_count', maxOptionsCount);
  }

  // Release year filter
  if (releaseYear) {
    query = query.like('release_date', `${releaseYear}%`);
  }

  // Has launch options filter
  if (hasLaunchOptions !== undefined) {
    if (hasLaunchOptions) {
      query = query.gt('total_options_count', 0);
    } else {
      query = query.eq('total_options_count', 0);
    }
  }

  return query;
}

/**
 * Apply sorting to the query with validation for allowed sort fields
 * @private
 * @param {import('@supabase/supabase-js').PostgrestQueryBuilder} query - Supabase query builder instance
 * @param {string} sort - Field name to sort by
 * @param {string} order - Sort order ('asc' or 'desc')
 * @returns {import('@supabase/supabase-js').PostgrestQueryBuilder} Query with sorting applied
 */
function applySorting(query, sort, order) {
  const ascending = order === 'asc';
  const validSortFields = ['title', 'release_date', 'developer', 'publisher', 'total_options_count', 'created_at'];
  
  if (validSortFields.includes(sort)) {
    query = query.order(sort, { ascending });
  } else {
    // Default sort
    query = query.order('title', { ascending: true });
  }

  return query;
}

/**
 * Get facets (available filter options) for building dynamic filter UI
 * @private
 * @param {string} [searchQuery=''] - Optional search query to filter facets
 * @returns {Promise<GamesFacets>} Promise that resolves to facets object
 */
async function getFacets(searchQuery = '') {
  const facetPromises = [
    getFacetValues('genre', searchQuery),
    getFacetValues('engine', searchQuery),
    getFacetValues('platform', searchQuery),
    getOptionsCountRanges(),
    getReleaseYears(searchQuery)
  ];

  const [genres, engines, platforms, optionsRanges, releaseYears] = await Promise.all(facetPromises);

  return {
    genres,
    engines,
    platforms,
    optionsRanges,
    releaseYears
  };
}

/**
 * Get unique values for a specific field with occurrence counts
 * @private
 * @param {string} field - Database field name to get facet values for
 * @param {string} [searchQuery=''] - Optional search query to filter results
 * @returns {Promise<FacetValue[]>} Promise that resolves to array of facet values with counts
 */
async function getFacetValues(field, searchQuery = '') {
  let query = supabase
    .from('games')
    .select(field, { count: 'exact' });

  // Apply search filter if provided
  if (searchQuery) {
    const searchTerms = searchQuery.trim().split(/\s+/);
    searchTerms.forEach(term => {
      query = query.or(`title.ilike.%${term}%,developer.ilike.%${term}%,publisher.ilike.%${term}%`);
    });
  }

  const { data, error } = await query
    .not(field, 'is', null)
    .not(field, 'eq', '');

  if (error) {
    console.error(`Error fetching ${field} facets:`, error);
    return [];
  }

  // Count occurrences
  const counts = {};
  data?.forEach(item => {
    const value = item[field];
    if (value) {
      counts[value] = (counts[value] || 0) + 1;
    }
  });

  return Object.entries(counts)
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20); // Limit to top 20
}

/**
 * Get launch options count ranges for filtering
 * @private
 * @returns {Promise<OptionsRange[]>} Promise that resolves to array of option count ranges
 */
async function getOptionsCountRanges() {
  const { data, error } = await supabase
    .from('games')
    .select('total_options_count')
    .not('total_options_count', 'is', null);

  if (error) return [];

  const counts = data.map(item => item.total_options_count || 0);
  const max = Math.max(...counts);
  const ranges = [
    { label: 'No options', min: 0, max: 0, count: counts.filter(c => c === 0).length },
    { label: '1-5 options', min: 1, max: 5, count: counts.filter(c => c >= 1 && c <= 5).length },
    { label: '6-10 options', min: 6, max: 10, count: counts.filter(c => c >= 6 && c <= 10).length },
    { label: '11+ options', min: 11, max: max, count: counts.filter(c => c >= 11).length }
  ].filter(range => range.count > 0);

  return ranges;
}

/**
 * Get available release years for date filtering
 * @private
 * @param {string} [searchQuery=''] - Optional search query to filter results
 * @returns {Promise<string[]>} Promise that resolves to array of release years (newest first)
 */
async function getReleaseYears(searchQuery = '') {
  let query = supabase
    .from('games')
    .select('release_date');

  if (searchQuery) {
    const searchTerms = searchQuery.trim().split(/\s+/);
    searchTerms.forEach(term => {
      query = query.or(`title.ilike.%${term}%,developer.ilike.%${term}%,publisher.ilike.%${term}%`);
    });
  }

  const { data, error } = await query
    .not('release_date', 'is', null)
    .not('release_date', 'eq', '');

  if (error) return [];

  const years = new Set();
  data?.forEach(item => {
    const dateStr = item.release_date;
    if (dateStr) {
      // Extract year from various date formats
      const yearMatch = dateStr.match(/\b(19|20)\d{2}\b/);
      if (yearMatch) {
        years.add(yearMatch[0]);
      }
    }
  });

  return Array.from(years)
    .sort((a, b) => b.localeCompare(a)) // Newest first
    .slice(0, 10); // Limit to recent years
}

/**
 * Enhanced search with suggestions and autocomplete functionality
 * @param {string} query - Search query string (minimum 2 characters)
 * @param {number} [limit=10] - Maximum number of suggestions to return
 * @returns {Promise<SearchSuggestion[]>} Promise that resolves to array of search suggestions
 * @throws {Error} When database query fails
 * 
 * @example
 * const suggestions = await getSearchSuggestions('half', 5);
 * // Returns suggestions for games, developers, and publishers matching 'half'
 */
export async function getSearchSuggestions(query, limit = 10) {
  if (!query || query.length < 2) return [];

  const { data, error } = await supabase
    .from('games')
    .select('title, developer, publisher')
    .or(`title.ilike.%${query}%,developer.ilike.%${query}%,publisher.ilike.%${query}%`)
    .limit(limit);

  if (error) {
    console.error('Error fetching suggestions:', error);
    return [];
  }

  const suggestions = new Set();
  
  data?.forEach(game => {
    // Add matching titles
    if (game.title && game.title.toLowerCase().includes(query.toLowerCase())) {
      suggestions.add({ type: 'title', value: game.title, category: 'Games' });
    }
    // Add matching developers
    if (game.developer && game.developer.toLowerCase().includes(query.toLowerCase())) {
      suggestions.add({ type: 'developer', value: game.developer, category: 'Developers' });
    }
    // Add matching publishers
    if (game.publisher && game.publisher.toLowerCase().includes(query.toLowerCase())) {
      suggestions.add({ type: 'publisher', value: game.publisher, category: 'Publishers' });
    }
  });

  return Array.from(suggestions).slice(0, limit);
}

/**
 * Get popular search terms based on most common developers and engines
 * @param {number} [limit=5] - Maximum number of popular searches to return
 * @returns {Promise<PopularSearch[]>} Promise that resolves to array of popular search terms
 * 
 * @example
 * const popular = await getPopularSearches(3);
 * // Returns top 3 most common developers and engines
 */
export async function getPopularSearches(limit = 5) {
  const { data, error } = await supabase
    .from('games')
    .select('developer, engine')
    .not('developer', 'is', null)
    .not('engine', 'is', null);

  if (error) return [];

  const developers = {};
  const engines = {};

  data?.forEach(game => {
    if (game.developer) developers[game.developer] = (developers[game.developer] || 0) + 1;
    if (game.engine) engines[game.engine] = (engines[game.engine] || 0) + 1;
  });

  const topDevelopers = Object.entries(developers)
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.ceil(limit / 2))
    .map(([name]) => ({ type: 'developer', value: name }));

  const topEngines = Object.entries(engines)
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.ceil(limit / 2))
    .map(([name]) => ({ type: 'engine', value: name }));

  return [...topDevelopers, ...topEngines];
}

/**
 * Fetch a single game with its associated launch options
 * @param {string|number} gameId - Steam app ID of the game
 * @returns {Promise<GameWithLaunchOptions>} Promise that resolves to game object with launch options
 * @throws {Error} When game is not found or database query fails
 * 
 * @example
 * const gameWithOptions = await fetchGameWithLaunchOptions(440);
 * // Returns Team Fortress 2 with all its launch options
 */
export async function fetchGameWithLaunchOptions(gameId) {
  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('*')
    .eq('app_id', gameId)
    .single();
  
  if (gameError) {
    console.error('Game fetch error:', gameError);
    throw new Error(`Failed to fetch game with ID ${gameId}`);
  }
  
  if (!game) {
    throw new Error(`Game with ID ${gameId} not found`);
  }
  
  const launchOptions = await fetchLaunchOptionsForGame(gameId);
  
  return {
    ...game,
    launchOptions
  };
}

/**
 * Fetch launch options for a specific game, ordered by popularity (upvotes)
 * @param {string|number} gameId - Steam app ID of the game
 * @returns {Promise<LaunchOption[]>} Promise that resolves to array of launch options
 * @throws {Error} When database query fails
 * 
 * @example
 * const options = await fetchLaunchOptionsForGame(440);
 * // Returns all launch options for Team Fortress 2, sorted by upvotes
 */
export async function fetchLaunchOptionsForGame(gameId) {
  const { data: gameOptions, error: joinError } = await supabase
    .from('game_launch_options')
    .select('launch_option_id')
    .eq('game_app_id', gameId);
    
  if (joinError) {
    console.error('Join table fetch error:', joinError);
    throw new Error(`Failed to fetch launch options for game ${gameId}`);
  }
  
  if (!gameOptions || gameOptions.length === 0) {
    return [];
  }
  
  const optionIds = gameOptions.map(option => option.launch_option_id);
  
  const { data: options, error: optionsError } = await supabase
    .from('launch_options')
    .select(`
      *,
      sources (
        id,
        name,
        description,
        reliability_score
      )
    `)
    .in('id', optionIds)
    .order('upvotes', { ascending: false }); // Order by popularity
  
  if (optionsError) {
    console.error('Launch options fetch error:', optionsError);
    throw new Error('Failed to fetch launch options details');
  }
  
  return options || [];
}