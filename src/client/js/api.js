// const API_URL = '/api/games';
const API_URL = 'http://localhost:3000/api/games';const cache = new Map();

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

  const res = await fetch(`/api/games?${params.toString()}`);
  if (!res.ok) {
    throw new Error('Failed to fetch games');
  }

  const data = await res.json();
  cache.set(key, data);
  return data;
}
