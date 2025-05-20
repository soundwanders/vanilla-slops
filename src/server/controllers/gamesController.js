/**
 * Controller to handle requests for fetching games from the database
 * 
 * @param {Object} req - The HTTP request object
 * @param {Object} req.query - Query parameters from the request
 * @param {Object} res - The HTTP response object
 * 
 * @returns {void}
 */

// import { fetchGames } from '../services/gamesService.js';
// import { log } from '../utils/logger.js';

// export async function gamesController(req, res) {
//   try {
//     log('Incoming request query:', req.query);

//     const result = await fetchGames(req.query);

//     log('Outgoing response data:', result);
//     res.json(result);
//   } catch (err) {
//     log('Error fetching games:', err.message);
//     res.status(500).json({ error: 'Failed to fetch games' });
//   }
// }

import { fetchGames } from '../services/gamesService.js';

export async function gamesController(req, res) {
  try {
    const filters = {
      searchQuery: req.query.search || '',
      genre: req.query.genre || '',
      engine: req.query.engine || '',
      platform: req.query.platform || '',
      sort: req.query.sort || 'asc',
      page: parseInt(req.query.page, 10) || 1,
      limit: 20, // Default page size
    };

    const result = await fetchGames(filters);

    // Log the result for debugging
    console.log('API Response:', result);

    res.json(result);
  } catch (err) {
    console.error('Error in gamesController:', err.message);
    res.status(500).json({ error: 'Failed to fetch games' });
  }
}