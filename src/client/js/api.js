// src/client/api.js - Enhanced with better error handling
const API_URL = 'http://localhost:8000/api';
const cache = new Map();

/**
 * Fetch games from the API with optional filters and pagination.
 *
 * @param {Object} params - Query parameters for the API request.
 * @param {number} [params.page=1] - The page number to fetch.
 * @param {Object} [params.filters={}] - Filters to apply to the query.
 * @param {string} [params.filters.searchQuery] - Search query for filtering games by title.
 * @param {string} [params.filters.genre] - Filter by genre.
 * @param {string} [params.filters.engine] - Filter by game engine.
 * @param {string} [params.filters.platform] - Filter by platform.
 * @param {string} [params.filters.sort='asc'] - Sort order (default is ascending).
 *
 * @returns {Promise<Object>} - The API response containing games and metadata.
 */
export async function fetchGames({ page = 1, filters = {} } = {}) {
  const params = new URLSearchParams({ page: page.toString() });
  
  // Add filters only if they exist and are not empty
  if (filters.searchQuery && filters.searchQuery.trim()) {
    params.set('search', filters.searchQuery.trim());
  }
  if (filters.genre && filters.genre.trim()) {
    params.set('genre', filters.genre.trim());
  }
  if (filters.engine && filters.engine.trim()) {
    params.set('engine', filters.engine.trim());
  }
  if (filters.platform && filters.platform.trim()) {
    params.set('platform', filters.platform.trim());
  }
  
  // Add sort param, default to ascending
  params.set('sort', filters.sort || 'asc');
  
  const key = params.toString();
  if (cache.has(key)) {
    console.log('API Cache hit for:', key);
    return cache.get(key);
  }
  
  const url = `${API_URL}/games?${params.toString()}`;
  console.log('API Request:', url);
  
  try {
    const res = await fetch(url);
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error('API Error:', res.status, res.statusText, errorText);
      throw new Error(`API request failed: ${res.status} ${res.statusText}`);
    }
    
    const data = await res.json();
    console.log('API Response:', {
      gamesCount: data.games?.length || 0,
      total: data.total || 0
    });
    
    // Validate response structure
    if (!data.games || !Array.isArray(data.games)) {
      console.error('Invalid API response structure:', data);
      throw new Error('Invalid response format from API');
    }
    
    cache.set(key, data);
    return data;
  } catch (error) {
    console.error('Fetch games error:', error);
    // Don't cache errors
    throw error;
  }
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
    console.log('API Cache hit for game:', gameId);
    return cache.get(cacheKey);
  }
  
  const url = `${API_URL}/games/${gameId}`;
  console.log(`API Request: Fetching game details - ${url}`);
  
  try {
    const res = await fetch(url);
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error('API Error:', res.status, res.statusText, errorText);
      
      if (res.status === 404) {
        throw new Error(`Game with ID ${gameId} not found`);
      }
      throw new Error(`Failed to fetch game details: ${res.status} ${res.statusText}`);
    }
    
    const data = await res.json();
    console.log('Game Details Response:', data.title || data.app_id);
    
    cache.set(cacheKey, data);
    return data;
  } catch (error) {
    console.error('Fetch game details error:', error);
    throw error;
  }
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
    console.log('API Cache hit for launch options:', gameId);
    return cache.get(cacheKey);
  }
  
  const url = `${API_URL}/games/${gameId}/launch-options`;
  console.log(`API Request: Fetching launch options - ${url}`);
  
  try {
    const res = await fetch(url);
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error('API Error:', res.status, res.statusText, errorText);
      throw new Error(`Failed to fetch launch options: ${res.status} ${res.statusText}`);
    }
    
    const data = await res.json();
    console.log(`Launch Options Response: ${data.length} options found`);
    
    // Ensure we return an array
    const options = Array.isArray(data) ? data : [];
    
    cache.set(cacheKey, options);
    return options;
  } catch (error) {
    console.error('Fetch launch options error:', error);
    throw error;
  }
}

/**
 * Clear the cache for a specific entry or the entire cache
 * 
 * @param {string} [key] - Specific key to clear, or clear entire cache if omitted
 */
export function clearCache(key) {
  if (key) {
    cache.delete(key);
    console.log('Cache cleared for key:', key);
  } else {
    cache.clear();
    console.log('Cache cleared completely');
  }
}