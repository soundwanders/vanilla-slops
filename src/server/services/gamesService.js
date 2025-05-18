import supabase from '../config/supabaseClient.js';

/**
 * Fetch games from Supabase with optional filters, sorting, and pagination.
 * @param {Object} params - Validated query params
 * @param {string} [params.search]
 * @param {string} [params.genre]
 * @param {string} [params.engine]
 * @param {string} [params.platform]
 * @param {string} [params.sort='title']
 * @param {string} [params.order='asc']
 * @param {number} [params.page=1]
 * @param {number} [params.limit=20]
 * @returns {Object} games, total, totalPages, currentPage
 */
export async function fetchGames({ search, genre, engine, platform, sort, order, page, limit }) {
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase.from('games').select('*', { count: 'exact' });

  if (search) query = query.ilike('title', `%${search}%`);
  if (genre) query = query.eq('genre', genre);
  if (engine) query = query.eq('engine', engine);
  if (platform) query = query.eq('platform', platform);

  query = query.order(sort, { ascending: order === 'asc' });
  query = query.range(from, to);

  const { data, count, error } = await query;

  if (error) throw new Error(error.message);

  return {
    games: data,
    total: count,
    totalPages: Math.ceil(count / limit),
    currentPage: page,
  };
}
