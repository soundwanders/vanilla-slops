
import { fetchGames, fetchGameSuggestions, fetchFilterFacets } from '../services/gamesService.js';

/**
 * Enhanced games controller with full search and filtering capabilities
 */
export async function gamesController(req, res) {
  try {
    const filters = {
      search: req.query.search || '',
      genre: req.query.genre || '',
      engine: req.query.engine || '',
      platform: req.query.platform || '',
      developer: req.query.developer || '',
      category: req.query.category || '',
      options: req.query.options || '', // 'has-options', 'no-options', 'performance', 'graphics'
      year: req.query.year || '',
      sort: req.query.sort || 'title',
      order: req.query.order || 'asc',
      page: parseInt(req.query.page, 10) || 1,
      limit: parseInt(req.query.limit, 10) || 20,
    };

    const result = await fetchGames(filters);
    res.json(result);
  } catch (err) {
    console.error('Error in gamesController:', err.message);
    res.status(500).json({ error: 'Failed to fetch games' });
  }
}

/**
 * Get search suggestions for autocomplete
 */
export async function searchSuggestionsController(req, res) {
  try {
    const { q: query } = req.query;
    
    if (!query || query.length < 2) {
      return res.json([]);
    }

    const suggestions = await fetchGameSuggestions(query);
    res.json(suggestions);
  } catch (err) {
    console.error('Error in searchSuggestionsController:', err.message);
    res.status(500).json({ error: 'Failed to fetch search suggestions' });
  }
}

/**
 * Get filter facets (available filter options)
 */
export async function filterFacetsController(req, res) {
  try {
    const facets = await fetchFilterFacets();
    res.json(facets);
  } catch (err) {
    console.error('Error in filterFacetsController:', err.message);
    res.status(500).json({ error: 'Failed to fetch filter facets' });
  }
}

/**
 * Controller to handle requests for fetching a specific game and its launch options
 *
 * @param {Object} req - The HTTP request object.
 * @param {Object} req.params - Route parameters.
 * @param {string} req.params.id - The ID of the game to fetch.
 * @param {Object} res - The HTTP response object.
 * @returns {Promise<void>}
 */
export async function gameDetailsController(req, res) {
  try {
    const { id } = req.params;
    const game = await fetchGameWithLaunchOptions(parseInt(id));
    res.json(game);
  } catch (err) {
    console.error('Error in gameDetailsController:', err.message);
    if (err.message.includes('not found')) {
      res.status(404).json({ error: err.message });
    } else {
      res.status(500).json({ error: 'Failed to fetch game details' });
    }
  }
}

/**
 * Controller to handle requests for fetching only the launch options of a specific game
 *
 * @param {Object} req - The HTTP request object
 * @param {Object} req.params - Route parameters
 * @param {string} req.params.id - The ID of the game whose launch options to fetch
 * @param {Object} res - The HTTP response object
 * @returns {Promise<void>}
 */
export async function gameLaunchOptionsController(req, res) {
  try {
    const { id } = req.params;
    const launchOptions = await fetchLaunchOptionsForGame(parseInt(id));
    res.json({ launchOptions });
  } catch (err) {
    console.error('Error in gameLaunchOptionsController:', err.message);
    res.status(500).json({ error: 'Failed to fetch launch options' });
  }
}