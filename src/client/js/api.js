// src/client/api.js - Enhanced with launch options support
const API_URL = 'http://localhost:8000/api';
const cache = new Map();

/**
 * Fetch games from the API with optional filters and pagination.
 *
 * @param {Object} params - Query parameters for the API request.
 * @param {number} [params.page=1] - The page number to fetch.
 * @param {Object} [params.filters={}] - Filters to apply to the query.
 * @param {string} [params.filters.search] - Search query for filtering games by title.
 * @param {string} [params.filters.genre] - Filter by genre.
 * @param {string} [params.filters.engine] - Filter by game engine.
 * @param {string} [params.filters.platform] - Filter by platform.
 * @param {string} [params.filters.sort='asc'] - Sort order (default is ascending).
 *
 * @returns {Promise<Object>} - The API response containing games and metadata.
 */
export async function fetchGames({ page = 1, filters = {} } = {}) {
  const params = new URLSearchParams({ page: page.toString() });
  
  // Add filters only if they exist
  if (filters.search) params.set('search', filters.search);
  if (filters.genre) params.set('genre', filters.genre);
  if (filters.engine) params.set('engine', filters.engine);
  if (filters.platform) params.set('platform', filters.platform);
  
  // Add sort param, default to ascending
  params.set('sort', filters.sort || 'asc');
  
  const key = params.toString();
  if (cache.has(key)) {
    return cache.get(key);
  }
  
  console.log('API Request:', `${API_URL}/games?${params.toString()}`);
  const res = await fetch(`${API_URL}/games?${params.toString()}`);
  
  if (!res.ok) {
    console.error('API Error:', res.status, res.statusText);
    throw new Error('Failed to fetch games');
  }
  
  const data = await res.json();
  console.log('API Response:', data);
  cache.set(key, data);
  return data;
}

/**
 * Fetch a specific game with its launch options
 *
 * @param {string} gameId - The game's app_id to fetch details for
 * @returns {Promise<Object>} - The game data with launch options
 */
export async function fetchGameDetails(gameId) {
  const cacheKey = `game_${gameId}`;
  
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }
  
  console.log(`API Request: Fetching game details for ${gameId}`);
  const res = await fetch(`${API_URL}/games/${gameId}`);
  
  if (!res.ok) {
    console.error('API Error:', res.status, res.statusText);
    throw new Error(`Failed to fetch details for game ${gameId}`);
  }
  
  const data = await res.json();
  console.log('Game Details Response:', data);
  cache.set(cacheKey, data);
  return data;
}

/**
 * Fetch launch options for a specific game
 *
 * @param {string} gameId - The game's app_id to fetch launch options for
 * @returns {Promise<Array>} - Array of launch options
 */
export async function fetchLaunchOptions(gameId) {
  const cacheKey = `launch_options_${gameId}`;
  
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }
  
  console.log(`API Request: Fetching launch options for ${gameId}`);
  const res = await fetch(`${API_URL}/games/${gameId}/launch-options`);
  
  if (!res.ok) {
    console.error('API Error:', res.status, res.statusText);
    throw new Error(`Failed to fetch launch options for game ${gameId}`);
  }
  
  const data = await res.json();
  console.log('Launch Options Response:', data);
  cache.set(cacheKey, data);
  return data;
}

/**
 * Clear the cache for a specific entry or the entire cache
 * 
 * @param {string} [key] - Specific key to clear, or clear entire cache if omitted
 */
export function clearCache(key) {
  if (key) {
    cache.delete(key);
  } else {
    cache.clear();
  }
}