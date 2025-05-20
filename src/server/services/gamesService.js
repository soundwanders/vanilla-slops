import supabase from '../config/supabaseClient.js';

/**
 * Fetch games from Supabase with optional filters, sorting, and pagination
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
 * @returns {Array} games - The list of games fetched from Supabase
 * @returns {number} total - The total number of games matching the query
 * @returns {number} totalPages - The total number of pages
 * @returns {number} currentPage - The current page number
 */

export async function fetchGames({ searchQuery = '', genre = '', engine = '', platform = '', sort = 'asc', page = 1, limit = 20 }) {
  const offset = (page - 1) * limit;

  let query = supabase
    .from('games')
    .select('*', { count: 'exact' }) // count is for pagination
    .order('title', { ascending: sort === 'asc' })
    .range(offset, offset + limit - 1);

  if (searchQuery) {
    query = query.ilike('title', `%${searchQuery}%`);
  }
  if (genre) {
    query = query.eq('genre', genre);
  }
  if (engine) {
    query = query.eq('engine', engine);
  }
  if (platform) {
    query = query.eq('platform', platform);
  }

  const { data, count, error } = await query;

  if (error) {
    console.error('Supabase query error:', error);
    throw new Error('Failed to fetch games from database');
  }

  // Ensure the response is properly formatted
  return {
    games: data || [],
    total: count || 0,
  };
}
