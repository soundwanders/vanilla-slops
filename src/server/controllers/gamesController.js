// controllers/gamesController.js
import { fetchGames } from '../services/gamesService.js';

export async function gamesController(req, res) {
  try {
    const result = await fetchGames(req.query); 
    res.json(result);
  } catch (err) {
    console.error('Error fetching games:', err.message);
    res.status(500).json({ error: 'Failed to fetch games' });
  }
}
