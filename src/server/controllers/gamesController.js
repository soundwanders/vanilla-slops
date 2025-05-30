import { 
  fetchGames, 
  getSearchSuggestions, 
  getFacets,
  fetchGameWithLaunchOptions,
  fetchLaunchOptionsForGame
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
    // Map frontend filter names to backend expectations
    const filters = {
      search: req.query.search || '',
      searchQuery: req.query.search || '', // Support both formats
      genre: req.query.genre || req.query.category || '',
      engine: req.query.engine || '',
      platform: req.query.platform || '',
      developer: req.query.developer || '',
      category: req.query.category || '',
      options: req.query.options || '', // 'has-options', 'no-options', 'performance', 'graphics'
      year: req.query.year || '',
      releaseYear: req.query.year || '',
      sort: req.query.sort || 'title',
      order: req.query.order || 'asc',
      page: parseInt(req.query.page, 10) || 1,
      limit: parseInt(req.query.limit, 10) || 20,
    };

    // Handle special filter cases
    if (filters.options === 'has-options') {
      filters.hasLaunchOptions = true;
    } else if (filters.options === 'no-options') {
      filters.hasLaunchOptions = false;
    }

    const result = await fetchGames(filters);
    
    // Ensure consistent response format
    res.json({
      games: result.games || [],
      total: result.total || 0,
      totalPages: result.totalPages || 0,
      currentPage: result.currentPage || 1,
      hasNextPage: result.hasNextPage || false,
      hasPrevPage: result.hasPrevPage || false,
      facets: result.facets || {}
    });
  } catch (err) {
    console.error('Error in gamesController:', err.message);
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