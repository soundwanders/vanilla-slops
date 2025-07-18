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
    console.log('🎮 Games Controller - Options-First Strategy');
    console.log('📊 Query parameters:', req.query);
    
    // Parse boolean parameters with proper defaults
    const hasOptions = req.query.hasOptions !== undefined 
      ? req.query.hasOptions === 'true' || req.query.hasOptions === true
      : true; // Only show games with options
    
    const showAll = req.query.showAll === 'true' || req.query.showAll === true || false;
    
    // Log strategy decisions for debugging
    console.log(`🎯 Options-First Strategy: hasOptions=${hasOptions}, showAll=${showAll}`);
    
    // Map frontend filter names to backend expectations
    const filters = {
      search: req.query.search || '',
      searchQuery: req.query.search || '',
      genre: req.query.genre || req.query.category || '',
      engine: req.query.engine || '',
      platform: req.query.platform || '',
      developer: req.query.developer || '',
      category: req.query.category || '',
      options: req.query.options || '',
      year: req.query.year || '',
      releaseYear: req.query.year || '',
      sort: req.query.sort || 'total_options_count', // Sort by options count
      order: req.query.order || 'desc', // Most options first
      page: parseInt(req.query.page, 10) || 1,
      limit: parseInt(req.query.limit, 10) || 20,
      hasOptions, // Options-first filtering
      showAll, // Progressive disclosure override
    };
 
    // Handle special filter cases for backward compatibility
    if (filters.options === 'has-options') {
      filters.hasOptions = true;
    } else if (filters.options === 'no-options') {
      filters.hasOptions = false;
      filters.showAll = true; // Must show all to see games without options
    }

    console.log('🔄 Calling fetchGames with filters:', {
      ...filters,
      // Don't log full filters object, just the key ones
      search: filters.search,
      hasOptions: filters.hasOptions,
      showAll: filters.showAll,
      sort: filters.sort,
      order: filters.order
    });

    const result = await fetchGames(filters);
    
    console.log(`✅ Fetched ${result.games?.length || 0} games (total: ${result.total || 0})`);
    console.log(`📈 Stats: ${result.stats?.withOptions || 0} with options, ${result.stats?.withoutOptions || 0} without`);
    
    // Response with options-first metadata
    const response = {
      games: result.games || [],
      total: result.total || 0,
      totalPages: result.totalPages || 0,
      currentPage: result.currentPage || 1,
      hasNextPage: result.hasNextPage || false,
      hasPrevPage: result.hasPrevPage || false,
      facets: result.facets || {},
      
      // Options-First strategy metadata
      stats: result.stats || { withOptions: 0, withoutOptions: 0, total: 0 },
      meta: {
        showingOptionsOnly: result.meta?.showingOptionsOnly || false,
        showingAll: result.meta?.showingAll || false,
        defaultSort: result.meta?.defaultSort || false,
        strategy: 'options-first',
        version: '2.0'
      }
    };
    
    res.json(response);
  } catch (err) {
    console.error('❌ Error in gamesController:', err.message);
    res.status(500).json({ 
      error: 'Failed to fetch games',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
      strategy: 'options-first' // Include strategy info even in errors
    });
  }
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
    const prioritizeOptions = req.query.prioritizeOptions !== 'false'; // Default true
    
    if (!query || query.length < 2) {
      return res.json([]);
    }

    console.log(`🔍 Search suggestions for "${query}" (prioritizeOptions: ${prioritizeOptions})`);

    const suggestions = await getSearchSuggestions(query, parseInt(limit), prioritizeOptions);
    
    console.log(`✅ Generated ${suggestions.length} suggestions`);
    res.json(suggestions);
  } catch (err) {
    console.error('❌ Error in searchSuggestionsController:', err.message);
    res.status(500).json({ 
      error: 'Failed to fetch search suggestions',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
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
    const includeStats = req.query.includeStats !== 'false'; // Default true
    
    console.log(`📊 Fetching facets for "${searchQuery}" (includeStats: ${includeStats})`);
    
    const facetsPromise = getFacets(searchQuery);
    const statsPromise = includeStats ? getGameStatistics(searchQuery, {}) : Promise.resolve(null);
    
    const [facets, stats] = await Promise.all([facetsPromise, statsPromise]);
    
    const response = {
      ...facets,
      // Include statistics for options-first UI
      ...(stats && { 
        statistics: {
          ...stats,
          strategy: 'options-first'
        }
      })
    };
    
    console.log(`✅ Facets generated with ${Object.keys(facets).length} categories`);
    if (stats) {
      console.log(`📈 Stats: ${stats.withOptions} with options, ${stats.withoutOptions} without`);
    }
    
    res.json(response);
  } catch (err) {
    console.error('❌ Error in filterFacetsController:', err.message);
    res.status(500).json({ 
      error: 'Failed to fetch filter facets',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
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
    
    const stats = await getGameStatistics(searchQuery, filters);
    
    const response = {
      ...stats,
      strategy: 'options-first',
      timestamp: new Date().toISOString(),
      query: {
        search: searchQuery,
        ...filters
      }
    };
    
    console.log(`✅ Statistics: ${stats.withOptions} with options (${stats.percentageWithOptions}%)`);
    
    res.json(response);
  } catch (err) {
    console.error('❌ Error in gameStatisticsController:', err.message);
    res.status(500).json({ 
      error: 'Failed to fetch game statistics',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
}

/**
 * Fetches complete details for a specific game including launch options
 * Unchanged from original implementation
 */
export async function gameDetailsController(req, res) {
  try {
    const { id } = req.params;
    const gameId = parseInt(id);
    
    if (isNaN(gameId)) {
      return res.status(400).json({ error: 'Invalid game ID' });
    }

    const game = await fetchGameWithLaunchOptions(gameId);
    res.json(game);
  } catch (err) {
    console.error('Error in gameDetailsController:', err.message);
    if (err.message.includes('not found')) {
      res.status(404).json({ error: err.message });
    } else {
      res.status(500).json({ 
        error: 'Failed to fetch game details',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    }
  }
}

/**
 * Retrieves only the launch options for a specific game
 * Unchanged from original implementation
 */
export async function gameLaunchOptionsController(req, res) {
  try {
    const { id } = req.params;
    const gameId = parseInt(id);
    
    if (isNaN(gameId)) {
      return res.status(400).json({ error: 'Invalid game ID' });
    }

    const launchOptions = await fetchLaunchOptionsForGame(gameId);
    res.json(launchOptions);
  } catch (err) {
    console.error('Error in gameLaunchOptionsController:', err.message);
    res.status(500).json({ 
      error: 'Failed to fetch launch options',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
}