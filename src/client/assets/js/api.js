// const API_URL = '/api/games';

const API_URL = 'http://localhost:3000/api/games';
const cache = new Map();

export async function fetchGames({ page = 1, search = '', hideDLC = false } = {}) {
  const params = new URLSearchParams({
    page,
    search,
    hideDLC: hideDLC ? '1' : '',
  });
  if (cache.has(page)) return cache.get(page);
  const res = await fetch(`/api/games?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch games');
  const data = await response.json();
  cache.set(page, data);
  return data;
}
