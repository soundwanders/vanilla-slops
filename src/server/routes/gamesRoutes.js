import { Router } from 'express';
import { validateRequest } from '../middlewares/validateRequest.js';
import { 
  querySchema, 
  suggestionQuerySchema, 
  facetsQuerySchema,
  statisticsQuerySchema
} from '../schemas/gameQuerySchema.js';
import { 
  gamesController, 
  searchSuggestionsController, 
  filterFacetsController,
  gameDetailsController,
  gameLaunchOptionsController,
  gameStatisticsController 
} from '../controllers/gamesController.js';

/**
 * Express router for games-related API endpoints
 * 
 * @module GamesRoutes
 */
const router = Router();

// Test endpoint with options-first info
router.get('/test', (req, res) => {
  res.json({ 
    message: 'Vanilla Slops API - Options-First Strategy Enabled!', 
    timestamp: new Date().toISOString(),
    query: req.query,
    strategy: {
      name: 'options-first',
      version: '2.0',
      description: 'Defaults to showing games WITH launch options for immediate user value',
      parameters: {
        hasOptions: 'boolean (default: true) - Filter games with launch options',
        showAll: 'boolean (default: false) - Show all games including those without options'
      }
    }
  });
});

/**
 * @route GET /api/games
 * @description Get games with Options-First strategy (NEW DEFAULT BEHAVIOR)
 * @access Public
 * @param {Object} req.query - Query parameters
 * @param {string} [req.query.search] - Search term for title, developer, publisher
 * @param {string} [req.query.category] - Filter by game category
 * @param {string} [req.query.developer] - Filter by developer name
 * @param {string} [req.query.options] - Filter by launch options type
 * @param {string} [req.query.year] - Filter by release year
 * @param {string} [req.query.sort='total_options_count'] - Sort field
 * @param {string} [req.query.order='desc'] - Sort order
 * @param {number} [req.query.page=1] - Page number
 * @param {number} [req.query.limit=20] - Items per page
 * @param {boolean} [req.query.hasOptions=true] - Filter games with launch options
 * @param {boolean} [req.query.showAll=false] - Show all games override
 * @returns {Object} 200 - Games list with metadata and statistics
 * @returns {Object} 400 - Validation error
 * @returns {Object} 500 - Server error
 * 
 * @example
 * // Options-First Only games with launch options
 * GET /api/games?search=half+life
 * 
 * // Show All: All games including those without options
 * GET /api/games?search=half+life&showAll=true
 * 
 * // No Options: Only games without launch options
 * GET /api/games?options=no-options&showAll=true
 */
router.get('/', validateRequest(querySchema), gamesController);

/**
 * @route GET /api/games/suggestions
 * @description Get search suggestions with options-first prioritization
 * @access Public
 * @param {Object} req.query - Query parameters
 * @param {string} req.query.q - Search query (minimum 2 characters)
 * @param {number} [req.query.limit=10] - Maximum suggestions to return
 * @param {boolean} [req.query.prioritizeOptions=true] - Prioritize games with options
 * @returns {Array} 200 - Array of prioritized search suggestions
 * @returns {Object} 400 - Invalid query parameter
 * @returns {Object} 500 - Server error
 */
router.get('/suggestions', validateRequest(suggestionQuerySchema), searchSuggestionsController);

/**
 * @route GET /api/games/facets
 * @description Get available filter options with statistics
 * @access Public
 * @param {Object} [req.query] - Optional query parameters
 * @param {string} [req.query.search] - Filter facets based on search context
 * @param {boolean} [req.query.includeStats=true] - Include options statistics
 * @returns {Object} 200 - Available filter facets with counts and statistics
 * @returns {Object} 500 - Server error
 */
router.get('/facets', validateRequest(facetsQuerySchema), filterFacetsController);

/**
 * @route GET /api/games/statistics
 * @description Get game statistics from API 
 * @access Public
 * @param {Object} [req.query] - Optional filter parameters
 * @param {string} [req.query.search] - Search term to scope statistics
 * @param {string} [req.query.developer] - Developer filter
 * @param {string} [req.query.category] - Category filter
 * @param {string} [req.query.year] - Year filter
 * @returns {Object} 200 - Game statistics including options counts and percentages
 * @returns {Object} 500 - Server error
 * 
 * @example
 * GET /api/games/statistics
 * // Returns: { withOptions: 1250, withoutOptions: 750, total: 2000, percentageWithOptions: 62.5 }
 * 
 * GET /api/games/statistics?search=valve
 * // Returns stats scoped to search results
 */
router.get('/statistics', validateRequest(statisticsQuerySchema), gameStatisticsController);

/**
 * @route GET /api/games/:id
 * @description Get a specific game and its associated launch options
 * @access Public
 * @param {Object} req.params - Route parameters
 * @param {string} req.params.id - Steam app ID of the game
 * @returns {Object} 200 - Game details with launch options
 * @returns {Object} 400 - Invalid game ID
 * @returns {Object} 404 - Game not found
 * @returns {Object} 500 - Server error
 */
router.get('/:id', gameDetailsController);

/**
 * @route GET /api/games/:id/launch-options
 * @description Get only the launch options for a specific game
 * @access Public
 * @param {Object} req.params - Route parameters
 * @param {string} req.params.id - Steam app ID of the game
 * @returns {Array} 200 - Array of launch options for the game
 * @returns {Object} 400 - Invalid game ID
 * @returns {Object} 500 - Server error
 */
router.get('/:id/launch-options', gameLaunchOptionsController);

/**
 * @route GET /api/games/health/strategy
 * @description Health check specifically for options-first strategy
 * @access Public
 * @returns {Object} 200 - Strategy health information
 */
router.get('/health/strategy', async (req, res) => {
  try {
    // Quick test of options-first functionality
    const [optionsOnlyTest, allGamesTest] = await Promise.all([
      // Test default behavior
      fetch(`${req.protocol}://${req.get('host')}/api/games?limit=1`).then(r => r.json()),
      // Test with show all games set to 'true" as default behavior
      fetch(`${req.protocol}://${req.get('host')}/api/games?limit=1&showAll=true`).then(r => r.json())
    ]);

    const health = {
      strategy: 'options-first',
      status: 'healthy',
      timestamp: new Date().toISOString(),
      tests: {
        optionsFirst: {
          status: optionsOnlyTest.meta?.showingOptionsOnly ? 'pass' : 'fail',
          description: 'Default behavior shows only games with options',
          result: optionsOnlyTest.meta
        },
        showAll: {
          status: allGamesTest.meta?.showingAll ? 'pass' : 'fail',
          description: 'showAll=true shows all games',
          result: allGamesTest.meta
        }
      },
      implementation: {
        defaultSort: 'total_options_count DESC',
        defaultFilter: 'hasOptions=true',
        progressiveDisclosure: 'showAll parameter'
      }
    };

    const overallStatus = Object.values(health.tests).every(test => test.status === 'pass') 
      ? 'healthy' : 'degraded';
    
    res.json({ ...health, status: overallStatus });
  } catch (error) {
    res.status(500).json({
      strategy: 'options-first',
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

export default router;