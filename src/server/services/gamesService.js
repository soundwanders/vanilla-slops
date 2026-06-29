import supabase from '../config/supabaseClient.js';

const FACETS_TTL_MS = 5 * 60 * 1000;
const _facetsCache = { data: null, expiresAt: 0 };

/**
 * @fileoverview Games service layer providing data access
 * Handles logic database operations for Steam games and their launch options
 * Implements search, filter, and pagination
 */

/**
 * @typedef {Object} GameFilter
 * @property {string} [search=''] - Search term for title, developer, publisher
 * @property {string} [searchQuery=''] - Alternative search parameter name
 * @property {string} [genre=''] - Game genre filter
 * @property {string} [engine=''] - Game engine filter
 * @property {string} [platform=''] - Platform filter
 * @property {string} [developer=''] - Developer name filter
 * @property {string} [category=''] - Game category filter
 * @property {string} [options=''] - Launch options filter type
 * @property {string} [year=''] - Release year filter
 * @property {string} [releaseYear=''] - Alternative year parameter name
 * @property {string} [sort='title'] - Sort field
 * @property {string} [order='asc'] - Sort order (asc/desc)
 * @property {number} [page=1] - Page number for pagination
 * @property {number} [limit=20] - Items per page
 * @property {number} [minOptionsCount] - Minimum launch options count
 * @property {number} [maxOptionsCount] - Maximum launch options count
 * @property {boolean} [hasLaunchOptions] - Filter by launch options presence
 */

/**
 * @typedef {Object} GameResult
 * @property {Array<Object>} games - Array of game objects
 * @property {number} total - Total number of matching games
 * @property {number} totalPages - Total number of pages
 * @property {number} currentPage - Current page number
 * @property {boolean} hasNextPage - Whether more pages exist
 * @property {boolean} hasPrevPage - Whether previous pages exist
 * @property {Object} facets - Available filter options with counts
 */

/**
 * @typedef {Object} SearchSuggestion
 * @property {string} type - Suggestion type ('title', 'developer', 'publisher')
 * @property {string} value - The suggested value
 * @property {string} category - Display category for UI grouping
 */

/**
 * Main function to fetch games with filtering and pagination
 * Supports multiple search parameters and maintains backward compatibility
 * 
 * @async
 * @function fetchGames
 * @param {GameFilter} filters - Filter and pagination parameters
 * @returns {Promise<GameResult>} Promise resolving to games with metadata
 * @throws {Error} When database query fails or invalid parameters provided
 * 
 * @example
 * const result = await fetchGames({
 *   search: 'half life',
 *   developer: 'valve',
 *   page: 1,
 *   limit: 20,
 *   sort: 'title',
 *   order: 'asc'
 * });
 */
export async function fetchGames({
  search = '',
  searchQuery = '',
  genre = '',
  engine = '',
  platform = '',
  developer = '',
  category = '',
  options = '',
  year = '',
  releaseYear = '',
  sort = 'title',
  order = 'asc',
  page = 1,
  limit = 20,
  minOptionsCount,
  maxOptionsCount,
  hasLaunchOptions
} = {}) {
  try {
    // Use search or searchQuery (support both frontend conventions)
    const searchTerm = search || searchQuery || '';
    const yearFilter = year || releaseYear || '';
    const genreFilter = genre || category || '';
    
    const offset = (page - 1) * limit;
    
    // Build the main query
    let query = supabase
      .from('games')
      .select('*', { count: 'exact' });

    // Apply search filters
    query = applySearchFilters(query, {
      searchTerm,
      genre: genreFilter,
      engine,
      platform,
      developer,
      options,
      yearFilter,
      minOptionsCount,
      maxOptionsCount,
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

    // Fetch facets for dynamic UI generation
    const facets = await getFacets(searchTerm);
    
    return {
      games: data || [],
      total: count || 0,
      totalPages: Math.ceil((count || 0) / limit),
      currentPage: page,
      facets,
      hasNextPage: page < Math.ceil((count || 0) / limit),
      hasPrevPage: page > 1
    };
  } catch (error) {
    console.error('Error in fetchGames:', error);
    throw error;
  }
}

/**
 * Applies search and filter conditions to Supabase query
 * Handles multi-term search, exact matches, range filters, and special options
 * 
 * @function applySearchFilters
 * @param {Object} query - Supabase query builder instance
 * @param {Object} filters - Filter parameters to apply
 * @param {string} [filters.searchTerm] - Search term for multiple fields
 * @param {string} [filters.genre] - Genre exact match
 * @param {string} [filters.engine] - Engine filter (partial match)
 * @param {string} [filters.platform] - Platform filter
 * @param {string} [filters.developer] - Developer filter (partial match)
 * @param {string} [filters.options] - Special launch options filter
 * @param {string} [filters.yearFilter] - Release year filter
 * @param {number} [filters.minOptionsCount] - Minimum options count
 * @param {number} [filters.maxOptionsCount] - Maximum options count
 * @param {boolean} [filters.hasLaunchOptions] - Launch options presence filter
 * @returns {Object} Modified Supabase query with filters applied
 */
function applySearchFilters(query, filters) {
  const {
    searchTerm,
    genre,
    engine,
    platform,
    developer,
    options,
    yearFilter,
    minOptionsCount,
    maxOptionsCount,
    hasLaunchOptions
  } = filters;

  // Multi-field search
  if (searchTerm && searchTerm.trim()) {
    const searchTerms = searchTerm.trim().split(/\s+/);
    
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

  // Exact match filters (only apply if the field exists in the database)
  if (developer) query = query.ilike('developer', `%${developer}%`);
  if (engine) query = query.ilike('engine', `%${engine}%`);
  
  // Handle special launch options filters
  if (options) {
    switch (options) {
      case 'has-options':
        query = query.gt('total_options_count', 0);
        break;
      case 'no-options':
        query = query.eq('total_options_count', 0);
        break;
      case 'performance':
      case 'graphics':
        // These would need specific implementation based on launch option categories
        query = query.gt('total_options_count', 0);
        break;
    }
  }

  // Range filters
  if (minOptionsCount !== undefined) {
    query = query.gte('total_options_count', minOptionsCount);
  }
  if (maxOptionsCount !== undefined) {
    query = query.lte('total_options_count', maxOptionsCount);
  }

  // Release year filter
  if (yearFilter) {
    console.log(`📅 Year filter: ${yearFilter}`);
    const year = yearFilter.trim();
    
    try {
      const yearInt = parseInt(year, 10);
      
      if (!isNaN(yearInt) && yearInt >= 1980 && yearInt <= new Date().getFullYear() + 1) {
        // Multiple fallback strategies for timestamp compatibility
        query = query.or(`extract(year from release_date)::text.eq.${yearInt},release_date.ilike.%${year}%`);
      } else {
        console.warn(`⚠️ Invalid year format: ${year}`);
      }
    } catch (error) {
      console.error(`❌ Year filter error: ${error.message}`);
      // Fallback to simple string matching
      query = query.ilike('release_date', `%${year}%`);
    }
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
 * Applies sorting to query with field validation and mapping
 * Maps frontend sort field names to database column names
 * 
 * @function applySorting
 * @param {Object} query - Supabase query builder instance
 * @param {string} sort - Sort field name from frontend
 * @param {string} order - Sort order ('asc' or 'desc')
 * @returns {Object} Query with sorting applied
 */
function applySorting(query, sort, order) {
  const ascending = order === 'asc';
  const validSortFields = ['title', 'release_date', 'developer', 'publisher', 'total_options_count', 'created_at'];
  
  // Map frontend sort values to backend fields
  let sortField = sort;
  switch (sort) {
    case 'name':
      sortField = 'title';
      break;
    case 'year':
      sortField = 'release_date';
      break;
    case 'options':
      sortField = 'total_options_count';
      break;
    case 'relevance':
      // For relevance, we use title, but could implement more complex scoring
      sortField = 'title';
      break;
  }
  
  if (validSortFields.includes(sortField)) {
    query = query.order(sortField, { ascending });
  } else {
    // Default sort
    query = query.order('title', { ascending: true });
  }

  return query;
}

/**
 * Provides intelligent search suggestions for autocomplete functionality
 * Searches across game titles, developers, and publishers with deduplication
 * 
 * @async
 * @function getSearchSuggestions
 * @param {string} query - Search query (minimum 2 characters)
 * @param {number} [limit=10] - Maximum number of suggestions to return
 * @returns {Promise<SearchSuggestion[]>} Array of categorized search suggestions
 * @throws {Error} When database query fails
 * 
 * @example
 * const suggestions = await getSearchSuggestions('half', 5);
 * // Returns: [
 * //   { type: 'title', value: 'Half-Life', category: 'Games' },
 * //   { type: 'developer', value: 'Valve Corporation', category: 'Developers' }
 * // ]
 */
export async function getSearchSuggestions(query, limit = 10) {
  try {
    if (!query || query.length < 2) return [];

    const { data, error } = await supabase
      .from('games')
      .select('title, developer, publisher')
      .or(`title.ilike.%${query}%,developer.ilike.%${query}%,publisher.ilike.%${query}%`)
      .limit(limit * 3); // Get more to filter duplicates

    if (error) {
      console.error('Error fetching suggestions:', error);
      return [];
    }

    const suggestions = new Map(); // Use Map to avoid duplicates
    const queryLower = query.toLowerCase();
    
    data?.forEach(game => {
      // Add matching titles
      if (game.title && game.title.toLowerCase().includes(queryLower)) {
        suggestions.set(`title_${game.title}`, { 
          type: 'title', 
          value: game.title, 
          category: 'Games' 
        });
      }
      // Add matching developers
      if (game.developer && game.developer.toLowerCase().includes(queryLower)) {
        suggestions.set(`developer_${game.developer}`, { 
          type: 'developer', 
          value: game.developer, 
          category: 'Developers' 
        });
      }
      // Add matching publishers
      if (game.publisher && game.publisher.toLowerCase().includes(queryLower)) {
        suggestions.set(`publisher_${game.publisher}`, { 
          type: 'publisher', 
          value: game.publisher, 
          category: 'Publishers' 
        });
      }
    });

    return Array.from(suggestions.values()).slice(0, limit);
  } catch (error) {
    console.error('Error in getSearchSuggestions:', error);
    return [];
  }
}

/**
 * Retrieves filter facets for dynamic UI generation
 * Provides available filter options with occurrence counts
 * 
 * @async
 * @function getFacets  
 * @param {string} [searchQuery=''] - Optional search context for filtering facets
 * @returns {Promise<Object>} Object containing arrays of available filter options
 * @property {Array} developers - Available developers with counts
 * @property {Array} engines - Available engines with counts  
 * @property {Array} publishers - Available publishers with counts
 * @property {Array} genres - Available genres (empty in current schema)
 * @property {Array} platforms - Available platforms (empty in current schema)
 * @property {Array} optionsRanges - Launch options count ranges
 * @property {Array} releaseYears - Available release years
 * @throws {Error} When database queries fail
 */
export async function getFacets(searchQuery = '') {
  const now = Date.now();

  // Serve cached facets for unfiltered requests (most common: initial load, filter dropdowns)
  if (!searchQuery && _facetsCache.data && now < _facetsCache.expiresAt) {
    return _facetsCache.data;
  }

  try {
    const facetPromises = [
      getFacetValues('developer', searchQuery),
      getFacetValues('engine', searchQuery),
      getFacetValues('publisher', searchQuery),
      getOptionsCountRanges(),
      getReleaseYears(searchQuery)
    ];

    const [developers, engines, publishers, optionsRanges, releaseYears] = await Promise.all(facetPromises);

    const result = {
      developers: developers || [],
      engines: engines || [],
      publishers: publishers || [],
      genres: [],
      platforms: [],
      optionsRanges: optionsRanges || [],
      releaseYears: releaseYears || []
    };

    if (!searchQuery) {
      _facetsCache.data = result;
      _facetsCache.expiresAt = now + FACETS_TTL_MS;
    }

    return result;
  } catch (error) {
    console.error('Error in getFacets:', error);
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
 * Get unique values for a specific field with occurrence counts
 */
async function getFacetValues(field, searchQuery = '') {
  try {
    let query = supabase
      .from('games')
      .select(field);

    // Apply search filter if provided
    if (searchQuery && searchQuery.trim()) {
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
      if (value && value.trim()) {
        counts[value] = (counts[value] || 0) + 1;
      }
    });

    return Object.entries(counts)
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20); // Limit to top 20
  } catch (error) {
    console.error(`Error in getFacetValues for ${field}:`, error);
    return [];
  }
}

/**
 * Get launch options count ranges for filtering
 */
async function getOptionsCountRanges() {
  try {
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
  } catch (error) {
    console.error('Error in getOptionsCountRanges:', error);
    return [];
  }
}

/**
 * Get available release years for date filtering
 */
async function getReleaseYears(searchQuery = '') {
  try {
    let query = supabase
      .from('games')
      .select('release_date');

    if (searchQuery && searchQuery.trim()) {
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
  } catch (error) {
    console.error('Error in getReleaseYears:', error);
    return [];
  }
}

/**
 * Get game statistics for progressive disclosure UI
 * Counts games with and without launch options, optionally filtered
 * 
 * @async
 * @function getGameStatistics
 * @param {Object} filters - Filter parameters to scope statistics
 * @param {string} [filters.search] - Search term
 * @param {string} [filters.searchQuery] - Alternative search parameter
 * @param {string} [filters.developer] - Developer filter
 * @param {string} [filters.category] - Category filter
 * @param {string} [filters.year] - Year filter
 * @param {string} [filters.engine] - Engine filter
 * @returns {Promise<Object>} Statistics object with counts and percentages
 * @property {number} withOptions - Count of games with launch options
 * @property {number} withoutOptions - Count of games without launch options
 * @property {number} total - Total games matching filters
 * @property {number} percentageWithOptions - Percentage of games with options
 * @throws {Error} When database queries fail
 */
export async function getGameStatistics(filters = {}) {
  try {
    console.log('📊 Calculating game statistics with filters:', filters);

    let query = supabase
      .from('games')
      .select('total_options_count', { count: 'exact' });

    // Apply same filters as main games query
    query = applySearchFilters(query, {
      searchTerm: filters.search || filters.searchQuery || '',
      developer: filters.developer || '',
      genre: filters.category || '',
      engine: filters.engine || '',
      yearFilter: filters.year || ''
    });

    const { data, count, error } = await query;
    
    if (error) {
      console.error('Statistics query error:', error);
      throw new Error('Failed to fetch game statistics from database');
    }

    const gamesWithOptions = data?.filter(game => 
      game.total_options_count && game.total_options_count > 0
    ).length || 0;
    
    const total = count || 0;
    const gamesWithoutOptions = total - gamesWithOptions;
    const percentageWithOptions = total > 0 ? (gamesWithOptions / total) * 100 : 0;

    const statistics = {
      withOptions: gamesWithOptions,
      withoutOptions: gamesWithoutOptions,
      total: total,
      percentageWithOptions: Math.round(percentageWithOptions * 10) / 10
    };

    console.log('✅ Statistics calculated:', statistics);
    return statistics;
  } catch (error) {
    console.error('Error in getGameStatistics:', error);
    throw error;
  }
}

/**
 * Retrieves complete game information including associated launch options
 * Combines game metadata with launch options in a single response
 * 
 * @async
 * @function fetchGameWithLaunchOptions
 * @param {string|number} gameId - Steam app ID of the game
 * @returns {Promise<Object>} Game object with embedded launch options array
 * @property {number} app_id - Steam app ID
 * @property {string} title - Game title
 * @property {string} developer - Game developer
 * @property {string} publisher - Game publisher
 * @property {string} release_date - Release date string
 * @property {string} engine - Game engine
 * @property {number} total_options_count - Count of launch options
 * @property {Array} launchOptions - Array of launch option objects
 * @throws {Error} When game not found or database query fails
 * 
 * @example
 * const game = await fetchGameWithLaunchOptions(440);
 * // Returns Team Fortress 2 with all launch options
 */
export async function fetchGameWithLaunchOptions(gameId) {
  try {
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
  } catch (error) {
    console.error('Error in fetchGameWithLaunchOptions:', error);
    throw error;
  }
}

/**
 * Fetches launch options for a specific game with popularity ordering
 * Performs join operations to get complete launch option details
 * 
 * @async
 * @function fetchLaunchOptionsForGame
 * @param {string|number} gameId - Steam app ID of the game
 * @returns {Promise<Array>} Array of launch option objects sorted by upvotes
 * @property {string} id - Launch option UUID
 * @property {string} option - Launch command (frontend compatibility)
 * @property {string} command - Launch command
 * @property {string} description - Option description
 * @property {string} source - Option source
 * @property {number} upvotes - Community upvotes
 * @property {number} downvotes - Community downvotes
 * @property {boolean} verified - Whether option is verified
 * @throws {Error} When database queries fail
 * 
 */
export async function fetchLaunchOptionsForGame(gameId) {
  try {
    // Single query: join game_launch_options → launch_options via nested select
    const { data, error } = await supabase
      .from('game_launch_options')
      .select(`
        launch_options (
          id,
          command,
          description,
          upvotes,
          downvotes,
          verified,
          source,
          created_at
        )
      `)
      .eq('game_app_id', gameId);

    if (error) {
      throw new Error(`Failed to fetch launch options for game ${gameId}: ${error.message}`);
    }

    if (!data || data.length === 0) return [];

    return data
      .map(row => row.launch_options)
      .filter(Boolean)
      .sort((a, b) => (b.upvotes || 0) - (a.upvotes || 0))
      .map(option => ({
        id: option.id,
        option: option.command,
        command: option.command,
        description: option.description || 'No description available',
        source: option.source || 'Community',
        upvotes: option.upvotes || 0,
        downvotes: option.downvotes || 0,
        verified: option.verified || false,
        created_at: option.created_at
      }));
  } catch (error) {
    console.error(`Error in fetchLaunchOptionsForGame(${gameId}):`, error.message);
    throw error;
  }
}
