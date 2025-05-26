import { fetchGames, fetchGameWithLaunchOptions, fetchLaunchOptionsForGame } from '../services/gamesService.js';

/**
 * Controller to handle requests for fetching games from the database
 */
export async function gamesController(req, res) {
  try {
    const filters = {
      searchQuery: req.query.search || '', // Note: mapping 'search' to 'searchQuery'
      genre: req.query.genre || '',
      engine: req.query.engine || '',
      platform: req.query.platform || '',
      sort: req.query.sort || 'asc',
      page: parseInt(req.query.page, 10) || 1,
      limit: parseInt(req.query.limit, 10) || 20,
    };

    console.log('Games Controller - Received filters:', filters);

    const result = await fetchGames(filters);

    console.log('Games Controller - Returning result:', {
      gamesCount: result.games?.length || 0,
      total: result.total
    });

    res.json(result);
  } catch (err) {
    console.error('Error in gamesController:', err.message);
    res.status(500).json({ error: 'Failed to fetch games', details: err.message });
  }
}

/**
 * Controller to handle requests for fetching a specific game with launch options
 */
export async function gameDetailsController(req, res) {
  try {
    const gameId = req.params.id;
    console.log(`Game Details Controller - Fetching game: ${gameId}`);
    
    const game = await fetchGameWithLaunchOptions(gameId);
    
    console.log('Game Details Controller - Found game:', game.title);
    res.json(game);
  } catch (err) {
    console.error('Error in gameDetailsController:', err.message);
    
    if (err.message.includes('not found')) {
      res.status(404).json({ error: 'Game not found' });
    } else {
      res.status(500).json({ error: 'Failed to fetch game details', details: err.message });
    }
  }
}

/**
 * Controller to handle requests for fetching launch options for a specific game
 */
export async function gameLaunchOptionsController(req, res) {
  try {
    const gameId = req.params.id;
    console.log(`Launch Options Controller - Fetching options for game: ${gameId}`);
    
    const options = await fetchLaunchOptionsForGame(gameId);
    
    console.log(`Launch Options Controller - Found ${options.length} options`);
    res.json(options);
  } catch (err) {
    console.error('Error in gameLaunchOptionsController:', err.message);
    res.status(500).json({ error: 'Failed to fetch launch options', details: err.message });
  }
}