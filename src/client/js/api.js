// const API_URL = '/api/games';
const API_URL = 'http://localhost:3000/api/games';
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

  console.log('API Request:', `/api/games?${params.toString()}`);
  const res = await fetch(`/api/games?${params.toString()}`);
  if (!res.ok) {
    console.error('API Error:', res.status, res.statusText);
    throw new Error('Failed to fetch games');
  }

  const data = await res.json();
  console.log('API Response:', data);

  cache.set(key, data);
  return data;
}
