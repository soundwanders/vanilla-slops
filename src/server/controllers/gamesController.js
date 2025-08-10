import { 
  fetchGames, 
  getSearchSuggestions, 
  getFacets,
  fetchGameWithLaunchOptions,
  fetchLaunchOptionsForGame,
  getGameStatistics
} from '../services/gamesService.js';

/**
 * @fileoverview Games controller with error handling and parameter mapping
 * Handles all game-related HTTP requests and coordinates with the service layer
 */

/**
 * Main controller for fetching games with filter and search capabilities
 * Maps frontend filter parameters to backend service expectations
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
 * @param {string} [req.query.sort='title'] - Sort field
 * @param {string} [req.query.order='asc'] - Sort order
 * @param {number} [req.query.page=1] - Page number for pagination
 * @param {number} [req.query.limit=20] - Items per page
 * @param {Object} res - Express response object
 * @returns {Promise<void>} JSON response with games data and metadata
 * @throws {Error} 500 - When database query fails or service error occurs
 */
export async function gamesController(req, res) {
  try {
    console.log('🔍 === BACKEND DEBUG SESSION ===');
    console.log('🔍 RAW REQUEST:', {
      url: req.url,
      query: req.query,
      queryKeys: Object.keys(req.query),
      hasOptionsRaw: req.query.hasOptions,
      showAllRaw: req.query.showAll,
      hasOptionsType: typeof req.query.hasOptions,
      showAllType: typeof req.query.showAll
    });

    // Parameter extraction and conversion
    const hasOptionsParam = req.query.hasOptions;
    const showAllParam = req.query.showAll;
    
    // Helper function to parse boolean parameters
    function parseBoolean(value) {
      if (value === true || value === 'true') return true;
      if (value === false || value === 'false') return false;
      return undefined;
    }
    
    const hasOptions = parseBoolean(hasOptionsParam);
    const showAll = parseBoolean(showAllParam);

    console.log('🎯 PARSED PARAMETERS:', {
      hasOptions,
      showAll,
      hasOptionsType: typeof hasOptions,
      showAllType: typeof showAll,
      hasOptionsRaw: hasOptionsParam,
      showAllRaw: showAllParam
    });

    // Build filters object
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
      sort: req.query.sort || 'title',
      order: req.query.order || 'asc',
      page: parseInt(req.query.page, 10) || 1,
      limit: parseInt(req.query.limit, 10) || 20,
      showAll: showAll,
      hasOptions: hasOptions
    };

    // Map to hasLaunchOptions for the service layer
    if (showAll === true) {
      filters.hasLaunchOptions = undefined; // Show all games
      console.log('🌍 SHOW ALL MODE - no hasLaunchOptions filtering');
    } else if (hasOptions === true) {
      filters.hasLaunchOptions = true; // Only games with options
      console.log('🎯 OPTIONS-FIRST MODE - games with options only');
    } else if (hasOptions === false) {
      filters.hasLaunchOptions = false; // Only games without options
      console.log('🚫 NO-OPTIONS MODE - games without options only');
    } else {
      // DEFAULT BEHAVIOR: Show games with options first
      filters.hasLaunchOptions = true;
      console.log('⚡ DEFAULT MODE - defaulting to OPTIONS-FIRST');
    }

    console.log('📋 FINAL FILTERS SENT TO SERVICE:', {
      hasLaunchOptions: filters.hasLaunchOptions,
      showAll: filters.showAll,
      hasOptions: filters.hasOptions,
      search: filters.search,
      developer: filters.developer,
      sort: filters.sort,
      order: filters.order
    });

    const result = await fetchGames(filters);
    
    console.log(`📊 BACKEND RESULT SUMMARY:`, {
      totalGames: result.total,
      gamesReturned: result.games?.length,
      showAllMode: showAll === true,
      hasLaunchOptionsFilter: filters.hasLaunchOptions,
      expectedBehavior: showAll === true ? 'Should show ALL games including those without options' : 'Should show only games WITH options'
    });

    // Log some sample games to verify filtering
    if (result.games?.length > 0) {
      const sampleGames = result.games.slice(0, 3).map(game => ({
        title: game.title,
        optionsCount: game.total_options_count || 0
      }));
      console.log('📝 SAMPLE GAMES RETURNED:', sampleGames);
    }
    
    res.json({
      games: result.games || [],
      total: result.total || 0,
      totalPages: result.totalPages || 0,
      currentPage: result.currentPage || 1,
      hasNextPage: result.hasNextPage || false,
      hasPrevPage: result.hasPrevPage || false,
      facets: result.facets || {},
      // Add debug info to response (remove in production)
      debug: {
        receivedShowAll: showAll,
        receivedHasOptions: hasOptions,
        appliedHasLaunchOptions: filters.hasLaunchOptions,
        mode: showAll === true ? 'SHOW_ALL' : 'OPTIONS_FIRST'
      }
    });
  } catch (err) {
    console.error('❌ Error in gamesController:', err.message);
    res.status(500).json({ 
      error: 'Failed to fetch games',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
}

/**
 * Provides search suggestions for autocomplete functionality
 * Validates query length and delegates to service layer
 * 
 * @async
 * @function searchSuggestionsController
 * @param {Object} req - Express request object
 * @param {Object} req.query - Query parameters
 * @param {string} req.query.q - Search query (validated to be 2+ characters)
 * @param {number} [req.query.limit=10] - Maximum number of suggestions
 * @param {Object} res - Express response object
 * @returns {Promise<void>} JSON array of search suggestions
 * @throws {Error} 500 - When suggestion fetch fails
 */
export async function searchSuggestionsController(req, res) {
  try {
    const { q: query, limit = 10 } = req.query;
    
    if (!query || query.length < 2) {
      return res.json([]);
    }

    const suggestions = await getSearchSuggestions(query, parseInt(limit));
    res.json(suggestions);
  } catch (err) {
    console.error('Error in searchSuggestionsController:', err.message);
    res.status(500).json({ 
      error: 'Failed to fetch search suggestions',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
}

/**
 * Retrieves available filter options (facets) for dynamic UI generation
 * Used to populate filter dropdowns with current available options
 * 
 * @async
 * @function filterFacetsController
 * @param {Object} req - Express request object
 * @param {Object} [req.query] - Optional query parameters
 * @param {string} [req.query.search] - Filter facets based on search context
 * @param {Object} res - Express response object
 * @returns {Promise<void>} JSON object with categorized filter options and counts
 * @throws {Error} 500 - When facet retrieval fails
 */
export async function filterFacetsController(req, res) {
  try {
    const searchQuery = req.query.search || '';
    const facets = await getFacets(searchQuery);
    res.json(facets);
  } catch (err) {
    console.error('Error in filterFacetsController:', err.message);
    res.status(500).json({ 
      error: 'Failed to fetch filter facets',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
}

/**
 * Fetches complete details for a specific game including launch options
 * Validates game ID and handles not found cases
 * 
 * @async
 * @function gameDetailsController
 * @param {Object} req - Express request object
 * @param {Object} req.params - Route parameters
 * @param {string} req.params.id - Steam app ID (validated as positive integer)
 * @param {Object} res - Express response object
 * @returns {Promise<void>} JSON object with game details and launch options
 * @throws {Error} 400 - When game ID is invalid
 * @throws {Error} 404 - When game is not found
 * @throws {Error} 500 - When database query fails
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
 * Lighter endpoint when full game details are not needed
 * 
 * @async
 * @function gameLaunchOptionsController
 * @param {Object} req - Express request object
 * @param {Object} req.params - Route parameters
 * @param {string} req.params.id - Steam app ID (validated as positive integer)
 * @param {Object} res - Express response object
 * @returns {Promise<void>} JSON array of launch options for the game
 * @throws {Error} 400 - When game ID is invalid
 * @throws {Error} 500 - When launch options fetch fails
 */
export async function gameLaunchOptionsController(req, res) {
  try {
    const { id } = req.params;
    const gameId = parseInt(id);
    
    if (isNaN(gameId)) {
      return res.status(400).json({ error: 'Invalid game ID' });
    }

    const launchOptions = await fetchLaunchOptionsForGame(gameId);
    res.json(launchOptions); // Return array directly, not wrapped in object
  } catch (err) {
    console.error('Error in gameLaunchOptionsController:', err.message);
    res.status(500).json({ 
      error: 'Failed to fetch launch options',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
}

/**
 * Retrieves game statistics for progressive disclosure UI
 * Provides counts of games with/without launch options for Show All Games filter
 * 
 * @async
 * @function gameStatisticsController
 * @param {Object} req - Express request object
 * @param {Object} [req.query] - Optional query parameters for scoped statistics
 * @param {string} [req.query.search] - Search term to scope statistics
 * @param {string} [req.query.developer] - Developer filter
 * @param {string} [req.query.category] - Category filter
 * @param {string} [req.query.year] - Year filter
 * @param {Object} res - Express response object
 * @returns {Promise<void>} JSON response with game statistics
 * @throws {Error} 500 - When database query fails
 */
export async function gameStatisticsController(req, res) {
  try {
    console.log('📊 Fetching game statistics with filters:', req.query);

    // Map filters similar to main games controller
    const filters = {
      search: req.query.search || '',
      searchQuery: req.query.search || '',
      developer: req.query.developer || '',
      category: req.query.category || '',
      year: req.query.year || '',
      engine: req.query.engine || ''
    };

    const statistics = await getGameStatistics(filters);
    
    console.log('📈 Game statistics result:', statistics);
    
    res.json(statistics);
  } catch (err) {
    console.error('Error in gameStatisticsController:', err.message);
    res.status(500).json({ 
      error: 'Failed to fetch game statistics',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
}




