import { 
  fetchGames, 
  getSearchSuggestions, 
  getFacets,
  fetchGameWithLaunchOptions,
  fetchLaunchOptionsForGame,
  getGameStatistics
} from '../services/gamesService.js';

/**
 * @fileoverview Games controller with Options-First strategy support
 * Handles new showAll and hasOptions parameters for progressive disclosure
 */

/**
 * Main controller for fetching games with Options-First strategy
 * Now supports progressive disclosure with showAll toggle
 * 
 * @async
 * @function gamesController
 * @param {Object} req - Express request object
 * @param {Object} req.query - Query parameters from frontend
 * @param {string} [req.query.search=''] - Search term for games
 * @param {string} [req.query.category=''] - Game category filter
 * @param {string} [req.query.developer=''] - Developer name filter
 * @param {string} [req.query.options=''] - Launch options filter type
 * @param {string} [req.query.year=''] - Release year filter
 * @param {string} [req.query.sort='total_options_count'] - Sort field (NEW DEFAULT)
 * @param {string} [req.query.order='desc'] - Sort order (NEW DEFAULT)
 * @param {number} [req.query.page=1] - Page number for pagination
 * @param {number} [req.query.limit=20] - Items per page
 * @param {boolean} [req.query.hasOptions=true] - Filter games with launch options
 * @param {boolean} [req.query.showAll=false] - Show all games override
 * @param {Object} res - Express response object
 * @returns {Promise<void>} JSON response with games data, metadata, and statistics
 */
export async function gamesController(req, res) {
  try {
    console.log('🎮 Games Controller');
    console.log('📊 Raw query parameters:', req.query);
    
    // Parameter parsing with better defaults
    const showAll = parseBoolean(req.query.showAll, false);
    const hasOptions = showAll ? true : parseBoolean(req.query.hasOptions, true);
    
    console.log(`🎯 Options-First Strategy Decision:`, {
      showAll,
      hasOptions: showAll ? 'N/A (showing all)' : hasOptions,
      optionsFilter: req.query.options || 'none'
    });
    
    // Build comprehensive filters object
    const filters = buildFiltersObject(req.query, { hasOptions, showAll });
    
    console.log('🔄 Calling fetchGames with filters:', {
      search: filters.search,
      options: filters.options,
      hasOptions: filters.hasOptions,
      showAll: filters.showAll,
      sort: filters.sort,
      order: filters.order,
      developer: filters.developer,
      year: filters.year
    });

    const result = await fetchGames(filters);
    
    console.log(`✅ Fetched ${result.games?.length || 0} games (total: ${result.total || 0})`);
    console.log(`📈 Stats: ${result.stats?.withOptions || 0} with options, ${result.stats?.withoutOptions || 0} without`);
    
    // Build response with debugging info
    const response = buildResponseObject(result, req.query, { hasOptions, showAll });
    
    res.json(response);
  } catch (err) {
    console.error('❌ Error in gamesController:', err.message);
    res.status(500).json({ 
      error: 'Failed to fetch games',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
      strategy: 'options-first',
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Parse boolean values from query parameters with proper defaults
 */
function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    return lower === 'true' || lower === '1' || lower === 'yes';
  }
  return defaultValue;
}

/**
 * Build comprehensive filters object with proper parameter mapping
 */
function buildFiltersObject(query, { hasOptions, showAll }) {
  const filters = {
    // Search parameters
    search: query.search || '',
    searchQuery: query.search || '',
    
    // Filter parameters with multiple name support
    genre: query.genre || query.category || '',
    engine: query.engine || '',
    platform: query.platform || '',
    developer: query.developer || '',
    category: query.category || '',
    year: query.year || '',
    releaseYear: query.year || '',
    
    // Options-First strategy parameters
    options: query.options || '',
    hasOptions,
    showAll,
    
    // Sorting with Options-First defaults
    sort: query.sort || 'total_options_count',
    order: query.order || 'desc',
    
    // Pagination
    page: parseInt(query.page, 10) || 1,
    limit: parseInt(query.limit, 10) || 20,
    
    // Range filters
    minOptionsCount: query.minOptionsCount ? parseInt(query.minOptionsCount, 10) : undefined,
    maxOptionsCount: query.maxOptionsCount ? parseInt(query.maxOptionsCount, 10) : undefined
  };

  // Handle special option filter cases with logic
  if (filters.options) {
    console.log(`🔧 Processing special options filter: ${filters.options}`);
    
    switch (filters.options) {
      case 'has-options':
        // Force showing only games with options
        filters.hasOptions = true;
        filters.showAll = false;
        console.log('🎯 Forcing has-options strategy');
        break;
        
      case 'no-options':
        // Force showing only games without options - requires showAll
        filters.hasOptions = false;
        filters.showAll = true;
        console.log('❌ Forcing no-options strategy (showAll required)');
        break;
        
      case 'many-options':
        // Games with 5+ options
        filters.hasOptions = true;
        filters.showAll = false;
        filters.minOptionsCount = 5;
        console.log('📊 Filtering for games with many options (5+)');
        break;
        
      case 'few-options':
        // Games with 1-4 options
        filters.hasOptions = true;
        filters.showAll = false;
        filters.minOptionsCount = 1;
        filters.maxOptionsCount = 4;
        console.log('📊 Filtering for games with few options (1-4)');
        break;
        
      case 'performance':
      case 'graphics':
        filters.hasOptions = true;
        filters.showAll = false;
        console.log(`🔧 Filtering for ${filters.options} options`);
        break;
    }
  }

  return filters;
}

/**
 * Build response object with comprehensive metadata
 */
function buildResponseObject(result, originalQuery, { hasOptions, showAll }) {
  return {
    games: result.games || [],
    total: result.total || 0,
    totalPages: result.totalPages || 0,
    currentPage: result.currentPage || 1,
    hasNextPage: result.hasNextPage || false,
    hasPrevPage: result.hasPrevPage || false,
    facets: result.facets || {},
    
    // Options-First strategy metadata
    stats: result.stats || { 
      withOptions: 0, 
      withoutOptions: 0, 
      total: 0, 
      percentageWithOptions: 0 
    },
    
    meta: {
      // Strategy information
      strategy: 'options-first',
      version: '2.1',
      
      // Current behavior
      showingOptionsOnly: !showAll && hasOptions,
      showingAll: showAll,
      showingNoOptionsOnly: showAll && !hasOptions,
      
      // Applied filters for debugging
      appliedFilters: {
        hasOptions: showAll ? undefined : hasOptions,
        showAll,
        optionsFilter: originalQuery.options || null,
        search: originalQuery.search || null,
        developer: originalQuery.developer || null,
        category: originalQuery.category || null,
        year: originalQuery.year || null
      },
      
      // Sort information
      defaultSort: originalQuery.sort === 'total_options_count' || !originalQuery.sort,
      sortField: originalQuery.sort || 'total_options_count',
      sortOrder: originalQuery.order || 'desc',
      
      // Performance info
      timestamp: new Date().toISOString(),
      queryTime: Date.now()
    }
  };
}

/**
 * Search suggestions with options-first prioritization
 * Prioritizes games and entities that have launch options
 * 
 * @async
 * @function searchSuggestionsController
 * @param {Object} req - Express request object
 * @param {Object} req.query - Query parameters
 * @param {string} req.query.q - Search query (validated to be 2+ characters)
 * @param {number} [req.query.limit=10] - Maximum number of suggestions
 * @param {boolean} [req.query.prioritizeOptions=true] - Prioritize games with options
 * @param {Object} res - Express response object
 * @returns {Promise<void>} JSON array of prioritized search suggestions
 */
export async function searchSuggestionsController(req, res) {
  try {
    const { q: query, limit = 10 } = req.query;
    const prioritizeOptions = parseBoolean(req.query.prioritizeOptions, true);
    
    if (!query || query.length < 2) {
      return res.json([]);
    }

    console.log(`🔍 Search suggestions for "${query}" (prioritizeOptions: ${prioritizeOptions})`);

    const suggestions = await getSearchSuggestions(query, parseInt(limit), prioritizeOptions);
    
    console.log(`✅ Generated ${suggestions.length} suggestions`);
    
    // Add metadata to response for debugging
    const response = {
      suggestions,
      meta: {
        query,
        limit: parseInt(limit),
        prioritizeOptions,
        count: suggestions.length,
        strategy: 'options-first'
      }
    };
    
    // For backward compatibility, return just the suggestions array
    // but log the full response for debugging
    console.log('🔍 Suggestions response metadata:', response.meta);
    res.json(suggestions);
    
  } catch (err) {
    console.error('❌ Error in searchSuggestionsController:', err.message);
    res.status(500).json({ 
      error: 'Failed to fetch search suggestions',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
      suggestions: [] // Fallback empty array
    });
  }
}

/**
 * Filter facets with options-first statistics
 * Includes information about games with/without options for UI feedback
 * 
 * @async
 * @function filterFacetsController
 * @param {Object} req - Express request object
 * @param {Object} [req.query] - Optional query parameters
 * @param {string} [req.query.search] - Filter facets based on search context
 * @param {boolean} [req.query.includeStats=true] - Include options statistics
 * @param {Object} res - Express response object
 * @returns {Promise<void>} JSON object with categorized filter options and statistics
 */
export async function filterFacetsController(req, res) {
  try {
    const searchQuery = req.query.search || '';
    const includeStats = parseBoolean(req.query.includeStats, true);
    
    console.log(`📊 Fetching facets for "${searchQuery}" (includeStats: ${includeStats})`);
    
    // Execute facets and stats queries in parallel
    const facetsPromise = getFacets(searchQuery);
    const statsPromise = includeStats ? getGameStatistics(searchQuery, {
      genre: req.query.category || req.query.genre,
      developer: req.query.developer,
      engine: req.query.engine,
      platform: req.query.platform,
      yearFilter: req.query.year
    }) : Promise.resolve(null);
    
    const [facets, stats] = await Promise.all([facetsPromise, statsPromise]);
    
    const response = {
      ...facets,
      // Include statistics for options-first UI
      ...(stats && { 
        statistics: {
          ...stats,
          strategy: 'options-first',
          context: {
            searchQuery,
            hasFilters: !!(req.query.category || req.query.developer || req.query.year)
          }
        }
      }),
      
      // Metadata for debugging
      meta: {
        searchQuery,
        includeStats,
        facetCounts: {
          developers: facets.developers?.length || 0,
          engines: facets.engines?.length || 0,
          publishers: facets.publishers?.length || 0,
          genres: facets.genres?.length || 0,
          releaseYears: facets.releaseYears?.length || 0,
          optionsRanges: facets.optionsRanges?.length || 0
        },
        timestamp: new Date().toISOString()
      }
    };
    
    console.log(`✅ Facets generated successfully:`, response.meta.facetCounts);
    if (stats) {
      console.log(`📈 Stats: ${stats.withOptions} with options, ${stats.withoutOptions} without (${stats.percentageWithOptions}%)`);
    }
    
    res.json(response);
  } catch (err) {
    console.error('❌ Error in filterFacetsController:', err.message);
    res.status(500).json({ 
      error: 'Failed to fetch filter facets',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
      // Fallback empty facets
      developers: [],
      engines: [],
      publishers: [],
      genres: [],
      platforms: [],
      optionsRanges: [],
      releaseYears: [],
      statistics: { withOptions: 0, withoutOptions: 0, total: 0, percentageWithOptions: 0 }
    });
  }
}

/**
 * Dedicated endpoint for getting options statistics
 * Useful for UI components that need to show counts for progressive disclosure
 * 
 * @async
 * @function gameStatisticsController
 * @param {Object} req - Express request object
 * @param {Object} [req.query] - Optional filter parameters
 * @param {string} [req.query.search] - Search term to scope statistics
 * @param {Object} res - Express response object
 * @returns {Promise<void>} JSON object with game statistics
 */
export async function gameStatisticsController(req, res) {
  try {
    const searchQuery = req.query.search || '';
    const filters = {
      genre: req.query.genre || req.query.category || '',
      engine: req.query.engine || '',
      platform: req.query.platform || '',
      developer: req.query.developer || '',
      yearFilter: req.query.year || ''
    };
    
    console.log(`📊 Fetching statistics for search: "${searchQuery}"`);
    console.log(`🔧 Applied filters:`, filters);
    
    const stats = await getGameStatistics(searchQuery, filters);
    
    const response = {
      ...stats,
      strategy: 'options-first',
      timestamp: new Date().toISOString(),
      query: {
        search: searchQuery,
        filters: Object.fromEntries(
          Object.entries(filters).filter(([key, value]) => value && value.trim())
        )
      },
      
      // Additional computed statistics
      computed: {
        ratioWithOptions: stats.total > 0 ? (stats.withOptions / stats.total).toFixed(3) : 0,
        ratioWithoutOptions: stats.total > 0 ? (stats.withoutOptions / stats.total).toFixed(3) : 0,
        isEmpty: stats.total === 0,
        hasFilters: Object.values(filters).some(value => value && value.trim())
      }
    };
    
    console.log(`✅ Statistics: ${stats.withOptions} with options (${stats.percentageWithOptions}%)`);
    console.log(`📊 Computed ratios: ${response.computed.ratioWithOptions} with, ${response.computed.ratioWithoutOptions} without`);
    
    res.json(response);
  } catch (err) {
    console.error('❌ Error in gameStatisticsController:', err.message);
    res.status(500).json({ 
      error: 'Failed to fetch game statistics',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
      // Fallback statistics
      withOptions: 0,
      withoutOptions: 0,
      total: 0,
      percentageWithOptions: 0,
      strategy: 'options-first',
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Fetches complete details for a specific game including launch options
 */
export async function gameDetailsController(req, res) {
  try {
    const { id } = req.params;
    const gameId = parseInt(id);
    
    if (isNaN(gameId)) {
      return res.status(400).json({ 
        error: 'Invalid game ID',
        details: `Expected numeric game ID, received: ${id}`
      });
    }

    console.log(`🎮 Fetching details for game ID: ${gameId}`);
    
    const game = await fetchGameWithLaunchOptions(gameId);
    
    console.log(`✅ Game details fetched: ${game.title} (${game.launchOptions?.length || 0} options)`);
    
    res.json(game);
  } catch (err) {
    console.error(`❌ Error in gameDetailsController for ID ${req.params.id}:`, err.message);
    if (err.message.includes('not found')) {
      res.status(404).json({ 
        error: err.message,
        gameId: req.params.id
      });
    } else {
      res.status(500).json({ 
        error: 'Failed to fetch game details',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined,
        gameId: req.params.id
      });
    }
  }
}

/**
 * Game launch options controller (unchanged but with better logging)
 */
export async function gameLaunchOptionsController(req, res) {
  try {
    const { id } = req.params;
    const gameId = parseInt(id);
    
    if (isNaN(gameId)) {
      return res.status(400).json({ 
        error: 'Invalid game ID',
        details: `Expected numeric game ID, received: ${id}`
      });
    }

    console.log(`🚀 Fetching launch options for game ID: ${gameId}`);
    
    const launchOptions = await fetchLaunchOptionsForGame(gameId);
    
    console.log(`✅ Launch options fetched: ${launchOptions.length} options for game ${gameId}`);
    
    res.json(launchOptions);
  } catch (err) {
    console.error(`❌ Error in gameLaunchOptionsController for ID ${req.params.id}:`, err.message);
    res.status(500).json({ 
      error: 'Failed to fetch launch options',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
      gameId: req.params.id,
      launchOptions: [] // Fallback empty array
    });
  }
}