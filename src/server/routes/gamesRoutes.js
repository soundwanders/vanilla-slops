import { Router } from 'express';
import { validateRequest } from '../middlewares/validateRequest.js';
import { querySchema, suggestionQuerySchema, gameIdSchema } from '../schemas/gameQuerySchema.js';
import { 
  gamesController, 
  searchSuggestionsController, 
  filterFacetsController,
  gameDetailsController,
  gameLaunchOptionsController 
} from '../controllers/gamesController.js';

/**
 * Express router for games-related API endpoints
 * Provides CRUD operations and search functionality for Steam games and launch options
 * 
 * @module GamesRoutes
 */
const router = Router();

// Test endpoint
router.get('/test', (req, res) => {
  res.json({ 
    message: 'API is working!', 
    timestamp: new Date().toISOString(),
    query: req.query 
  });
});

/**
 * @route GET /api/games
 * @description Get all games with filtering, search, and pagination
 * @access Public
 * @param {Object} req.query - Query parameters
 * @param {string} [req.query.search] - Search term for title, developer, publisher
 * @param {string} [req.query.category] - Filter by game category
 * @param {string} [req.query.developer] - Filter by developer name
 * @param {string} [req.query.options] - Filter by launch options type
 * @param {string} [req.query.year] - Filter by release year
 * @param {string} [req.query.sort='title'] - Sort field
 * @param {string} [req.query.order='asc'] - Sort order (asc/desc)
 * @param {number} [req.query.page=1] - Page number
 * @param {number} [req.query.limit=20] - Items per page
 * @returns {Object} 200 - Games list with pagination metadata
 * @returns {Object} 400 - Validation error
 * @returns {Object} 500 - Server error
 */
router.get('/', validateRequest(querySchema), gamesController);

/**
 * @route GET /api/games/suggestions
 * @description Get search suggestions for autocomplete functionality
 * @access Public
 * @param {Object} req.query - Query parameters
 * @param {string} req.query.q - Search query (minimum 2 characters)
 * @param {number} [req.query.limit=10] - Maximum suggestions to return
 * @returns {Array} 200 - Array of search suggestions
 * @returns {Object} 400 - Invalid query parameter
 * @returns {Object} 500 - Server error
 */
router.get('/suggestions', validateRequest(suggestionQuerySchema), searchSuggestionsController);

/**
 * @route GET /api/games/facets
 * @description Get available filter options for dynamic UI generation
 * @access Public
 * @param {Object} [req.query] - Optional query parameters
 * @param {string} [req.query.search] - Filter facets based on search context
 * @returns {Object} 200 - Available filter facets with counts
 * @returns {Object} 500 - Server error
 */
router.get('/facets', filterFacetsController);

/**
 * @route GET /api/games/:id
 * @description Get a specific game with its associated launch options
 * @access Public
 * @param {Object} req.params - Route parameters
 * @param {string} req.params.id - Steam app ID of the game
 * @returns {Object} 200 - Game details with launch options
 * @returns {Object} 400 - Invalid game ID
 * @returns {Object} 404 - Game not found
 * @returns {Object} 500 - Server error
 */
router.get('/:id', validateRequest(gameIdSchema), gameDetailsController);

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
router.get('/:id/launch-options', validateRequest(gameIdSchema), gameLaunchOptionsController);

export default router;