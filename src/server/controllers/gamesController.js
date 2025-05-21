import { fetchGames, fetchGameWithLaunchOptions, fetchLaunchOptionsForGame } from '../services/gamesService.js';

/**
 * Controller to handle requests for fetching games from the database.
 * Supports query parameters for search, genre, engine, platform, sort, pagination, and limit.
 *
 * @param {Object} req - The HTTP request object.
 * @param {Object} req.query - Query parameters: search, genre, engine, platform, sort, page, limit.
 * @param {Object} res - The HTTP response object.
 * @returns {Promise<void>}
 */
export async function gamesController(req, res) {
  try {
    const filters = {
      searchQuery: req.query.search || '',
      genre: req.query.genre || '',
      engine: req.query.engine || '',
      platform: req.query.platform || '',
      sort: req.query.sort || 'asc',
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
 * Controller to handle requests for fetching a single game and its launch options.
 *
 * @param {Object} req - The HTTP request object.
 * @param {Object} req.params - Route parameters.
 * @param {string} req.params.id - The ID of the game to fetch.
 * @param {Object} res - The HTTP response object.
 * @returns {Promise<void>}
 */
export async function gameDetailsController(req, res) {
  try {
    const gameId = req.params.id;
    const result = await fetchGameWithLaunchOptions(gameId);
    res.json(result);
  } catch (err) {
    console.error('Error in gameDetailsController:', err.message);
    res.status(500).json({ error: 'Failed to fetch game details' });
  }
}

/**
 * Controller to handle requests for fetching only the launch options of a specific game.
 *
 * @param {Object} req - The HTTP request object.
 * @param {Object} req.params - Route parameters.
 * @param {string} req.params.id - The ID of the game whose launch options to fetch.
 * @param {Object} res - The HTTP response object.
 * @returns {Promise<void>}
 */
export async function gameLaunchOptionsController(req, res) {
  try {
    const gameId = req.params.id;
    const result = await fetchLaunchOptionsForGame(gameId);
    res.json(result);
  } catch (err) {
    console.error('Error in gameLaunchOptionsController:', err.message);
    res.status(500).json({ error: `Failed to fetch launch options for game ${gameId}` });
  }
}
