import supabase from '../config/supabaseClient.js';

/**
 * Fetch games from Supabase with optional filters, sorting, and pagination
 * @param {Object} params - Validated query params
 * @param {string} [params.searchQuery] - Search term for game titles
 * @param {string} [params.genre] - Genre filter
 * @param {string} [params.engine] - Engine filter
 * @param {string} [params.platform] - Platform filter
 * @param {string} [params.sort='asc'] - Sort order
 * @param {number} [params.page=1] - Page number
 * @param {number} [params.limit=20] - Items per page
 * @returns {Object} games, total
 */
export async function fetchGames({ searchQuery = '', genre = '', engine = '', platform = '', sort = 'asc', page = 1, limit = 20 }) {
  console.log('Games Service - Received params:', { searchQuery, genre, engine, platform, sort, page, limit });
  
  const offset = (page - 1) * limit;
  let query = supabase
    .from('games')
    .select('*', { count: 'exact' })
    .order('title', { ascending: sort === 'asc' })
    .range(offset, offset + limit - 1);
  
  // Apply filters if provided
  if (searchQuery && searchQuery.trim()) {
    console.log('Applying search filter:', searchQuery);
    query = query.ilike('title', `%${searchQuery.trim()}%`);
  }
  if (genre && genre.trim()) {
    console.log('Applying genre filter:', genre);
    query = query.eq('genre', genre);
  }
  if (engine && engine.trim()) {
    console.log('Applying engine filter:', engine);
    query = query.eq('engine', engine);
  }
  if (platform && platform.trim()) {
    console.log('Applying platform filter:', platform);
    query = query.eq('platform', platform);
  }
  
  const { data, count, error } = await query;
  
  if (error) {
    console.error('Supabase query error:', error);
    throw new Error(`Failed to fetch games from database: ${error.message}`);
  }
  
  console.log(`Games Service - Returning ${data?.length || 0} games out of ${count} total`);
  
  return {
    games: data || [],
    total: count || 0,
  };
}

/**
 * Fetch a single game with its launch options
 * @param {string} gameId - The game's app_id
 * @returns {Object} Game with launch options
 */
export async function fetchGameWithLaunchOptions(gameId) {
  console.log(`Games Service - Fetching game details for: ${gameId}`);
  
  // First, fetch the game details
  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('*')
    .eq('app_id', gameId)
    .single();
  
  if (gameError) {
    console.error('Game fetch error:', gameError);
    if (gameError.code === 'PGRST116') {
      throw new Error(`Game with ID ${gameId} not found`);
    }
    throw new Error(`Failed to fetch game with ID ${gameId}: ${gameError.message}`);
  }
  
  // Then fetch all launch options for this game
  const launchOptions = await fetchLaunchOptionsForGame(gameId);
  
  return {
    ...game,
    launchOptions
  };
}

/**
 * Fetch launch options for a selected game
 * @param {string} gameId - The game's app_id
 * @returns {Array} Array of launch options with source info
 */
export async function fetchLaunchOptionsForGame(gameId) {
  console.log(`Games Service - Fetching launch options for game: ${gameId}`);
  
  // Query the launch options directly with a join
  const { data: options, error: optionsError } = await supabase
    .from('game_launch_options')
    .select(`
      launch_options (
        id,
        command,
        description,
        source,
        verified,
        upvotes,
        downvotes,
        created_at
      )
    `)
    .eq('game_app_id', gameId);
  
  if (optionsError) {
    console.error('Launch options fetch error:', optionsError);
    throw new Error(`Failed to fetch launch options for game ${gameId}: ${optionsError.message}`);
  }
  
  // Extract and format the options
  const formattedOptions = (options || [])
    .map(item => item.launch_options)
    .filter(option => option !== null)
    .map(option => ({
      ...option,
      option: option.command, // Map 'command' to 'option' for frontend compatibility
    }));
  
  console.log(`Games Service - Found ${formattedOptions.length} launch options`);
  
  return formattedOptions;
}