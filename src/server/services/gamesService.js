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
    .select('*', { count: 'exact' })
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
  
  return {
    games: data || [],
    total: count || 0,
  };
}

// Fetch a single game with its launch options
export async function fetchGameWithLaunchOptions(gameId) {
  // First, fetch the game details
  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('*')
    .eq('app_id', gameId)
    .single();
  
  if (gameError) {
    console.error('Game fetch error:', gameError);
    throw new Error(`Failed to fetch game with ID ${gameId}`);
  }
  
  if (!game) {
    throw new Error(`Game with ID ${gameId} not found`);
  }
  
  // Then fetch all launch options for this game
  const launchOptions = await fetchLaunchOptionsForGame(gameId);
  
  return {
    ...game,
    launchOptions
  };
}

// Fetch launch options for a selected game
export async function fetchLaunchOptionsForGame(gameId) {
  // First get the join table entries
  const { data: gameOptions, error: joinError } = await supabase
    .from('game_launch_options')
    .select('launch_option_id')
    .eq('game_app_id', gameId);
    
  if (joinError) {
    console.error('Join table fetch error:', joinError);
    throw new Error(`Failed to fetch launch options for game ${gameId}`);
  }
  
  if (!gameOptions || gameOptions.length === 0) {
    return []; // No launch options found
  }
  
  // Extract the option IDs
  const optionIds = gameOptions.map(option => option.launch_option_id);
  
  // Now fetch the actual launch options with their source information
  const { data: options, error: optionsError } = await supabase
    .from('launch_options')
    .select(`
      *,
      sources (
        id,
        name,
        description,
        reliability_score
      )
    `)
    .in('id', optionIds);
  
  if (optionsError) {
    console.error('Launch options fetch error:', optionsError);
    throw new Error('Failed to fetch launch options details');
  }
  
  return options || [];
}