/**
 * @fileoverview Games service layer for Vanilla Slops
 * Provides data access operations for Steam games and launch options
 * Implements Options-First strategy with database compatibility
 */

import supabase from '../config/supabaseClient.js';

/**
 * Retrieves games with filtering, pagination, and Options-First strategy
 * 
 * @param {Object} params - Query parameters
 * @param {string} [params.search=''] - Search term for title, developer, publisher
 * @param {string} [params.searchQuery=''] - Alternative search parameter name
 * @param {string} [params.genre=''] - Game genre filter
 * @param {string} [params.engine=''] - Game engine filter
 * @param {string} [params.platform=''] - Platform filter
 * @param {string} [params.developer=''] - Developer name filter
 * @param {string} [params.category=''] - Game category filter
 * @param {string} [params.options=''] - Launch options filter type
 * @param {string} [params.year=''] - Release year filter
 * @param {string} [params.releaseYear=''] - Alternative year parameter name
 * @param {string} [params.sort='total_options_count'] - Sort field
 * @param {string} [params.order='desc'] - Sort order (asc/desc)
 * @param {number} [params.page=1] - Page number for pagination
 * @param {number} [params.limit=20] - Items per page
 * @param {number} [params.minOptionsCount] - Minimum launch options count
 * @param {number} [params.maxOptionsCount] - Maximum launch options count
 * @param {boolean} [params.hasOptions=true] - Filter games with launch options
 * @param {boolean} [params.showAll=false] - Show all games override
 * @returns {Promise<Object>} Games data with metadata and statistics
 * @throws {Error} When database query fails or invalid parameters provided
 */
export async function fetchGames({
  search = '',
  searchQuery = '',
  genre = '',
  engine = '',
  platform = '',
  developer = '',
  category = '',
  options = '',
  year = '',
  releaseYear = '',
  sort = 'total_options_count',
  order = 'desc',
  page = 1,
  limit = 20,
  minOptionsCount,
  maxOptionsCount,
  hasOptions = true,
  showAll = false
} = {}) {
  try {
    console.log('🎯 fetchGames called with Options-First strategy:', {
      hasOptions,
      showAll,
      options,
      search: search || searchQuery,
      sort,
      order
    });

    const searchTerm = search || searchQuery || '';
    const yearFilter = year || releaseYear || '';
    const genreFilter = genre || category || '';
    
    const offset = (page - 1) * limit;
    
    let query = supabase
      .from('games')
      .select('*', { count: 'exact' });

    console.log('📊 Base query created');

    // Apply Options-First strategy logic first
    query = applyOptionsFirstStrategy(query, { hasOptions, showAll, options });
    
    // Apply search and filter constraints
    query = applyDatabaseCompatibleFilters(query, {
      searchTerm,
      genre: genreFilter,
      engine,
      platform,
      developer,
      yearFilter,
      minOptionsCount,
      maxOptionsCount
    });

    // Apply sorting and pagination
    query = applySorting(query, sort, order);
    query = query.range(offset, offset + limit - 1);

    console.log('🔍 Executing final query...');
    const { data, count, error } = await query;
    
    if (error) {
      console.error('❌ Supabase query error:', error);
      throw new Error(`Database query failed: ${error.message}`);
    }

    console.log(`✅ Query successful: ${data?.length || 0} games returned, total: ${count || 0}`);

    // Get statistics for UI components
    const stats = await getGameStatistics(searchTerm, {
      genre: genreFilter,
      engine,
      platform,
      developer,
      yearFilter
    });

    // Fetch filter facets for dynamic UI generation
    const facets = await getFacets(searchTerm);
    
    return {
      games: data || [],
      total: count || 0,
      totalPages: Math.ceil((count || 0) / limit),
      currentPage: page,
      facets,
      stats,
      hasNextPage: page < Math.ceil((count || 0) / limit),
      hasPrevPage: page > 1,
      meta: {
        showingOptionsOnly: !showAll && hasOptions,
        showingAll: showAll,
        strategy: 'options-first',
        appliedFilters: {
          hasOptions: showAll ? undefined : hasOptions,
          showAll,
          options,
          search: searchTerm
        }
      }
    };
  } catch (error) {
    console.error('💥 Error in fetchGames:', error);
    throw error;
  }
}

/**
 * Applies Options-First strategy filtering to query
 * Prioritizes games with launch options based on strategy parameters
 * 
 * @param {Object} query - Supabase query builder instance
 * @param {Object} params - Strategy parameters
 * @param {boolean} params.hasOptions - Whether to filter for games with options
 * @param {boolean} params.showAll - Whether to show all games regardless of options
 * @param {string} params.options - Specific options filter type
 * @returns {Object} Modified query with Options-First strategy applied
 */
function applyOptionsFirstStrategy(query, { hasOptions, showAll, options }) {
  console.log('🎯 Applying Options-First strategy:', { hasOptions, showAll, options });
  
  if (options) {
    console.log(`🔧 Applying options filter: ${options}`);
    switch (options) {
      case 'has-options':
        return query.gt('total_options_count', 0);
      case 'no-options':
        return query.eq('total_options_count', 0);
      case 'many-options':
        return query.gte('total_options_count', 5);
      case 'few-options':
        return query.gte('total_options_count', 1).lt('total_options_count', 5);
      case 'performance':
      case 'graphics':
        return query.gt('total_options_count', 0);
      default:
        break;
    }
  }
  
  if (!options) {
    if (showAll) {
      console.log('📊 Strategy: Show ALL games');
      return query;
    } else if (hasOptions) {
      console.log('🎯 Strategy: Options-First (games with launch options only)');
      return query.gt('total_options_count', 0);
    } else {
      console.log('❌ Strategy: No options only');
      return query.eq('total_options_count', 0);
    }
  }
  
  return query;
}

/**
 * Applies search and filter constraints with database compatibility
 * Handles field validation and type conversion for PostgreSQL compatibility
 * 
 * @param {Object} query - Supabase query builder instance
 * @param {Object} filters - Filter parameters to apply
 * @param {string} filters.searchTerm - Multi-field search term
 * @param {string} filters.genre - Genre filter (handled via inference)
 * @param {string} filters.engine - Engine filter
 * @param {string} filters.platform - Platform filter
 * @param {string} filters.developer - Developer filter
 * @param {string} filters.yearFilter - Release year filter
 * @param {number} filters.minOptionsCount - Minimum options count
 * @param {number} filters.maxOptionsCount - Maximum options count
 * @returns {Object} Modified query with filters applied
 */
function applyDatabaseCompatibleFilters(query, filters) {
  const {
    searchTerm,
    genre,
    engine,
    platform,
    developer,
    yearFilter,
    minOptionsCount,
    maxOptionsCount
  } = filters;

  console.log('🔍 Applying search filters:', filters);

  // Multi-field text search
  if (searchTerm && searchTerm.trim()) {
    const cleanTerm = searchTerm.trim();
    console.log(`🔍 Searching for: "${cleanTerm}"`);
    query = query.or(`title.ilike.%${cleanTerm}%,developer.ilike.%${cleanTerm}%,publisher.ilike.%${cleanTerm}%`);
  }

  // Developer name filter
  if (developer && developer.trim()) {
    console.log(`👨‍💻 Developer filter: ${developer}`);
    query = query.ilike('developer', `%${developer.trim()}%`);
  }
  
  // Engine filter
  if (engine && engine.trim()) {
    console.log(`⚙️ Engine filter: ${engine}`);
    query = query.ilike('engine', `%${engine.trim()}%`);
  }
  
  // Platform filter
  if (platform && platform.trim()) {
    console.log(`🖥️ Platform filter: ${platform}`);
    query = query.ilike('platform', `%${platform.trim()}%`);
  }

  // Genre filter - skip database query since fields don't exist
  if (genre && genre.trim()) {
    console.log(`🎮 Genre filter: ${genre} (handled via inference)`);
    // Genre filtering is handled through inference in getFacets
  }

  // Year filter with timestamp compatibility
  if (yearFilter && yearFilter.trim()) {
    console.log(`📅 Year filter: ${yearFilter}`);
    const year = yearFilter.trim();
    
    try {
      const yearInt = parseInt(year, 10);
      
      if (!isNaN(yearInt) && yearInt >= 1980 && yearInt <= new Date().getFullYear() + 1) {
        // Use EXTRACT function for timestamp fields and fallback to text search
        query = query.or(`extract(year from release_date)::text.eq.${yearInt},release_date.ilike.%${year}%`);
      } else {
        console.warn(`⚠️ Invalid year format: ${year}`);
      }
    } catch (error) {
      console.error(`❌ Year filter error: ${error.message}`);
    }
  }

  // Launch options count range filters
  if (minOptionsCount !== undefined && minOptionsCount >= 0) {
    console.log(`📊 Min options: ${minOptionsCount}`);
    query = query.gte('total_options_count', minOptionsCount);
  }
  if (maxOptionsCount !== undefined && maxOptionsCount >= 0) {
    console.log(`📊 Max options: ${maxOptionsCount}`);
    query = query.lte('total_options_count', maxOptionsCount);
  }

  return query;
}

/**
 * Applies sorting to query with field validation
 * Maps frontend sort field names to database column names
 * 
 * @param {Object} query - Supabase query builder instance
 * @param {string} sort - Sort field name from frontend
 * @param {string} order - Sort order ('asc' or 'desc')
 * @returns {Object} Query with sorting applied
 */
function applySorting(query, sort, order) {
  const ascending = order === 'asc';
  
  let sortField = sort;
  switch (sort) {
    case 'name':
      sortField = 'title';
      break;
    case 'year':
      sortField = 'release_date';
      break;
    case 'options':
      sortField = 'total_options_count';
      break;
    case 'relevance':
      sortField = 'title';
      break;
    case 'created_at':
    case 'title':
    case 'total_options_count':
    case 'developer':
    case 'publisher':
    case 'release_date':
      break;
    default:
      sortField = 'title';
      console.warn(`⚠️ Unknown sort field "${sort}", defaulting to "title"`);
  }
  
  console.log(`📊 Sorting by: ${sortField} ${ascending ? 'ASC' : 'DESC'}`);
  
  return query.order(sortField, { ascending });
}

/**
 * Provides search suggestions for autocomplete functionality
 * Prioritizes games with launch options when requested
 * 
 * @param {string} query - Search query (minimum 2 characters)
 * @param {number} [limit=10] - Maximum number of suggestions to return
 * @param {boolean} [prioritizeOptions=true] - Whether to prioritize games with options
 * @returns {Promise<Array>} Array of categorized search suggestions
 * @throws {Error} When database query fails
 */
export async function getSearchSuggestions(query, limit = 10, prioritizeOptions = true) {
  try {
    if (!query || query.length < 2) return [];

    console.log(`🔍 Getting suggestions for "${query}" (prioritizeOptions: ${prioritizeOptions})`);

    let baseQuery = supabase
      .from('games')
      .select('title, developer, publisher, total_options_count')
      .or(`title.ilike.%${query}%,developer.ilike.%${query}%,publisher.ilike.%${query}%`)
      .limit(limit * 3);

    if (prioritizeOptions) {
      baseQuery = baseQuery.order('total_options_count', { ascending: false });
    }

    const { data, error } = await baseQuery;

    if (error) {
      console.error('❌ Error fetching suggestions:', error);
      return [];
    }

    const suggestions = new Map();
    const queryLower = query.toLowerCase();
    
    data?.forEach(game => {
      const hasOptions = (game.total_options_count || 0) > 0;
      const optionsSuffix = prioritizeOptions && hasOptions ? ' 🚀' : '';
      
      if (game.title && game.title.toLowerCase().includes(queryLower)) {
        suggestions.set(`title_${game.title}`, { 
          type: 'title', 
          value: game.title + optionsSuffix, 
          category: 'Games',
          hasOptions
        });
      }
      
      if (game.developer && game.developer.toLowerCase().includes(queryLower)) {
        suggestions.set(`developer_${game.developer}`, { 
          type: 'developer', 
          value: game.developer, 
          category: 'Developers',
          hasOptions
        });
      }
      
      if (game.publisher && game.publisher.toLowerCase().includes(queryLower)) {
        suggestions.set(`publisher_${game.publisher}`, { 
          type: 'publisher', 
          value: game.publisher, 
          category: 'Publishers',
          hasOptions
        });
      }
    });

    let resultArray = Array.from(suggestions.values());
    
    if (prioritizeOptions) {
      resultArray.sort((a, b) => {
        if (a.hasOptions && !b.hasOptions) return -1;
        if (!a.hasOptions && b.hasOptions) return 1;
        return 0;
      });
    }
    
    return resultArray.slice(0, limit);
  } catch (error) {
    console.error('💥 Error in getSearchSuggestions:', error);
    return [];
  }
}

/**
 * Retrieves filter facets for dynamic UI generation
 * Provides available filter options with occurrence counts and statistics
 * 
 * @param {string} [searchQuery=''] - Optional search context for filtering facets
 * @returns {Promise<Object>} Object containing arrays of available filter options
 * @property {Array} developers - Available developers with counts
 * @property {Array} engines - Available engines with counts  
 * @property {Array} publishers - Available publishers with counts
 * @property {Array} genres - Inferred genres from game titles
 * @property {Array} platforms - Available platforms (empty if not supported)
 * @property {Array} optionsRanges - Launch options count ranges
 * @property {Array} releaseYears - Available release years extracted from timestamps
 * @throws {Error} When database queries fail
 */
export async function getFacets(searchQuery = '') {
  try {
    console.log(`📊 Fetching facets for search: "${searchQuery}"`);
    
    const facetPromises = [
      getFacetValues('developer', searchQuery),
      getFacetValues('engine', searchQuery),
      getFacetValues('publisher', searchQuery),
      getInferredGenres(searchQuery),
      getOptionsCountRanges(),
      getReleaseYearsFromTimestamp(searchQuery)
    ];

    const [developers, engines, publishers, genres, optionsRanges, releaseYears] = await Promise.all(facetPromises);

    console.log('📊 Facets results:', {
      developers: developers?.length || 0,
      engines: engines?.length || 0,
      publishers: publishers?.length || 0,
      genres: genres?.length || 0,
      optionsRanges: optionsRanges?.length || 0,
      releaseYears: releaseYears?.length || 0
    });

    return {
      developers: developers || [],
      engines: engines || [],
      publishers: publishers || [],
      genres: genres || [],
      platforms: [],
      optionsRanges: optionsRanges || [],
      releaseYears: releaseYears || []
    };
  } catch (error) {
    console.error('💥 Error in getFacets:', error);
    return {
      developers: [],
      engines: [],
      publishers: [],
      genres: [],
      platforms: [],
      optionsRanges: [],
      releaseYears: []
    };
  }
}

/**
 * Extracts unique values for a specific database field with occurrence counts
 * 
 * @param {string} field - Database field name to extract values from
 * @param {string} [searchQuery=''] - Optional search context
 * @returns {Promise<Array>} Array of objects with value and count properties
 */
async function getFacetValues(field, searchQuery = '') {
  try {
    console.log(`📋 Getting facet values for field: ${field}`);
    
    let query = supabase
      .from('games')
      .select(field);

    if (searchQuery && searchQuery.trim()) {
      query = query.or(`title.ilike.%${searchQuery}%,developer.ilike.%${searchQuery}%,publisher.ilike.%${searchQuery}%`);
    }

    const { data, error } = await query
      .not(field, 'is', null)
      .not(field, 'eq', '')
      .limit(1000);

    if (error) {
      console.error(`❌ Error fetching ${field} facets:`, error);
      return [];
    }

    if (!data || data.length === 0) {
      console.warn(`⚠️ No data found for field: ${field}`);
      return [];
    }

    const counts = {};
    data.forEach(item => {
      const value = item[field];
      if (value && typeof value === 'string' && value.trim()) {
        const cleanValue = value.trim();
        counts[cleanValue] = (counts[cleanValue] || 0) + 1;
      }
    });

    const result = Object.entries(counts)
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 50);

    console.log(`✅ Found ${result.length} unique values for ${field}`);
    return result;
  } catch (error) {
    console.error(`💥 Error in getFacetValues for ${field}:`, error);
    return [];
  }
}

/**
 * Infers game genres from title patterns
 * Used when database lacks genre/category fields
 * 
 * @param {string} [searchQuery=''] - Optional search context
 * @returns {Promise<Array>} Array of inferred genres with counts
 */
async function getInferredGenres(searchQuery = '') {
  try {
    console.log('🔧 Creating inferred genres from title patterns...');
    
    let query = supabase
      .from('games')
      .select('title');

    if (searchQuery && searchQuery.trim()) {
      query = query.or(`title.ilike.%${searchQuery}%,developer.ilike.%${searchQuery}%,publisher.ilike.%${searchQuery}%`);
    }

    const { data, error } = await query.limit(1000);

    if (error || !data) {
      console.error('❌ Error fetching games for genre inference:', error);
      return [];
    }

    const genrePatterns = {
      'Action': /call of duty|battlefield|counter.*strike|doom|quake|halo|gears|mortal kombat|assassin|hitman|max payne|grand theft auto|gta/i,
      'Strategy': /civilization|age of empires|starcraft|command.*conquer|total war|crusader kings|europa|hearts of iron|warcraft/i,
      'RPG': /elder scrolls|fallout|witcher|final fantasy|dragon age|mass effect|diablo|path of exile|baldur|neverwinter|divinity/i,
      'FPS': /counter.*strike|call of duty|battlefield|overwatch|valorant|apex legends|rainbow six|half.*life|bioshock/i,
      'Racing': /forza|gran turismo|need for speed|dirt|f1|burnout|crew|driver|midnight club/i,
      'Sports': /fifa|nba|nfl|nhl|madden|pes|rocket league|tony hawk|skate/i,
      'Simulation': /cities.*skylines|sim city|euro truck|farming|flight simulator|planet coaster|two point|tropico/i,
      'Puzzle': /portal|tetris|puzzle|baba is you|witness|monument valley|limbo|inside/i,
      'Horror': /resident evil|silent hill|dead space|amnesia|outlast|phasmophobia|alien|dead by daylight/i,
      'Survival': /rust|ark|subnautica|green hell|raft|valheim|forest|dayz|minecraft/i,
      'Indie': /indie|celeste|hollow knight|stardew valley|undertale|shovel knight|ori and the/i,
      'MMORPG': /world of warcraft|final fantasy xiv|guild wars|elder scrolls online|neverwinter|destiny/i
    };

    const genreCounts = {};
    
    data.forEach(game => {
      if (game.title) {
        Object.entries(genrePatterns).forEach(([genre, pattern]) => {
          if (pattern.test(game.title)) {
            genreCounts[genre] = (genreCounts[genre] || 0) + 1;
          }
        });
      }
    });

    const result = Object.entries(genreCounts)
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count);

    console.log(`✅ Inferred ${result.length} genres from game titles`);
    return result;
  } catch (error) {
    console.error('💥 Error in getInferredGenres:', error);
    return [];
  }
}

/**
 * Extracts release years from timestamp fields
 * Handles both timestamp and string date formats
 * 
 * @param {string} [searchQuery=''] - Optional search context
 * @returns {Promise<Array>} Array of release years sorted newest first
 */
async function getReleaseYearsFromTimestamp(searchQuery = '') {
  try {
    console.log('📅 Getting release years from timestamp fields...');
    
    let query = supabase
      .from('games')
      .select('release_date, created_at');

    if (searchQuery && searchQuery.trim()) {
      query = query.or(`title.ilike.%${searchQuery}%,developer.ilike.%${searchQuery}%,publisher.ilike.%${searchQuery}%`);
    }

    const { data, error } = await query
      .limit(1000)
      .not('release_date', 'is', null);

    if (error) {
      console.error('❌ Error fetching release years:', error);
      return [];
    }

    const years = new Set();
    
    data?.forEach(item => {
      if (item.release_date) {
        const year = extractYearFromTimestamp(item.release_date);
        if (year) years.add(year);
      }
      
      if (!item.release_date && item.created_at) {
        const year = extractYearFromTimestamp(item.created_at);
        if (year) years.add(year);
      }
    });

    const result = Array.from(years)
      .filter(year => year >= 1980 && year <= new Date().getFullYear() + 1)
      .sort((a, b) => b - a)
      .slice(0, 30);

    console.log(`✅ Found ${result.length} release years`);
    return result;
  } catch (error) {
    console.error('💥 Error in getReleaseYearsFromTimestamp:', error);
    return [];
  }
}

/**
 * Extracts year from timestamp or date string
 * 
 * @param {string|Date} dateString - Date string or timestamp to parse
 * @returns {number|null} Extracted year or null if parsing fails
 */
function extractYearFromTimestamp(dateString) {
  if (!dateString) return null;
  
  try {
    // Parse as Date object first
    const date = new Date(dateString);
    if (!isNaN(date.getTime())) {
      const year = date.getFullYear();
      if (year >= 1980 && year <= new Date().getFullYear() + 1) {
        return year;
      }
    }
    
    // Fallback to regex patterns
    const patterns = [
      /\b(19|20)\d{2}\b/,
      /^(\d{4})-/,
      /(\d{4})$/,
    ];
    
    for (const pattern of patterns) {
      const match = dateString.toString().match(pattern);
      if (match) {
        const year = parseInt(match[1] || match[0], 10);
        if (year >= 1980 && year <= new Date().getFullYear() + 1) {
          return year;
        }
      }
    }
  } catch (error) {
    console.error(`Error parsing date: ${dateString}`, error);
  }
  
  return null;
}

/**
 * Calculates game statistics for Options-First UI components
 * 
 * @param {string} [searchQuery=''] - Search term to scope statistics
 * @param {Object} [filters={}] - Additional filters to scope statistics
 * @returns {Promise<Object>} Statistics object with counts and percentages
 * @property {number} withOptions - Count of games with launch options
 * @property {number} withoutOptions - Count of games without launch options
 * @property {number} total - Total number of games
 * @property {number} percentageWithOptions - Percentage of games with options
 */
export async function getGameStatistics(searchQuery = '', filters = {}) {
  try {
    console.log(`📊 Getting game statistics for: "${searchQuery}"`);
    
    let query = supabase
      .from('games')
      .select('total_options_count', { count: 'exact' });

    if (searchQuery && searchQuery.trim()) {
      query = query.or(`title.ilike.%${searchQuery}%,developer.ilike.%${searchQuery}%,publisher.ilike.%${searchQuery}%`);
    }

    // Apply filters that exist in database
    Object.entries(filters).forEach(([key, value]) => {
      if (value && value.trim()) {
        switch (key) {
          case 'developer':
            query = query.ilike('developer', `%${value}%`);
            break;
          case 'engine':
            query = query.ilike('engine', `%${value}%`);
            break;
          case 'platform':
            query = query.ilike('platform', `%${value}%`);
            break;
          case 'yearFilter':
            const year = parseInt(value, 10);
            if (!isNaN(year)) {
              query = query.or(`extract(year from release_date)::text.eq.${year},release_date.ilike.%${value}%`);
            }
            break;
          case 'genre':
            console.log(`🎮 Genre filter in stats: ${value} (handled via inference)`);
            break;
        }
      }
    });

    const { data, count, error } = await query;

    if (error) {
      console.error('❌ Error fetching statistics:', error);
      return { withOptions: 0, withoutOptions: 0, total: 0, percentageWithOptions: 0 };
    }

    const total = count || 0;
    const withOptions = data?.filter(item => (item.total_options_count || 0) > 0).length || 0;
    const withoutOptions = total - withOptions;
    const percentageWithOptions = total > 0 ? Math.round((withOptions / total) * 100) : 0;

    const stats = {
      withOptions,
      withoutOptions,
      total,
      percentageWithOptions
    };

    console.log('✅ Statistics calculated:', stats);
    return stats;
  } catch (error) {
    console.error('💥 Error in getGameStatistics:', error);
    return { withOptions: 0, withoutOptions: 0, total: 0, percentageWithOptions: 0 };
  }
}

/**
 * Generates launch options count ranges for filtering UI
 * 
 * @returns {Promise<Array>} Array of range objects with labels and counts
 */
async function getOptionsCountRanges() {
  try {
    console.log('📊 Getting options count ranges...');
    
    const { data, error } = await supabase
      .from('games')
      .select('total_options_count')
      .not('total_options_count', 'is', null)
      .limit(10000);

    if (error) {
      console.error('❌ Error fetching options ranges:', error);
      return [];
    }

    const counts = data.map(item => item.total_options_count || 0);
    const max = Math.max(...counts);
    
    const ranges = [
      { label: 'No options (0)', value: 'no-options', min: 0, max: 0, count: counts.filter(c => c === 0).length },
      { label: 'Few options (1-4)', value: 'few-options', min: 1, max: 4, count: counts.filter(c => c >= 1 && c <= 4).length },
      { label: 'Many options (5+)', value: 'many-options', min: 5, max: max, count: counts.filter(c => c >= 5).length }
    ].filter(range => range.count > 0);

    console.log(`✅ Found ${ranges.length} option ranges`);
    return ranges;
  } catch (error) {
    console.error('💥 Error in getOptionsCountRanges:', error);
    return [];
  }
}

/**
 * Retrieves complete game information including associated launch options
 * 
 * @param {string|number} gameId - Steam app ID of the game
 * @returns {Promise<Object>} Game object with embedded launch options array
 * @throws {Error} When game not found or database query fails
 */
export async function fetchGameWithLaunchOptions(gameId) {
  try {
    const { data: game, error: gameError } = await supabase
      .from('games')
      .select('*')
      .eq('app_id', gameId)
      .single();
    
    if (gameError) {
      console.error('❌ Game fetch error:', gameError);
      throw new Error(`Failed to fetch game with ID ${gameId}: ${gameError.message}`);
    }
    
    if (!game) {
      throw new Error(`Game with ID ${gameId} not found`);
    }
    
    const launchOptions = await fetchLaunchOptionsForGame(gameId);
    
    return {
      ...game,
      launchOptions
    };
  } catch (error) {
    console.error('💥 Error in fetchGameWithLaunchOptions:', error);
    throw error;
  }
}

/**
 * Fetches launch options for a specific game with popularity ordering
 * Performs join operations to get complete launch option details
 * 
 * @param {string|number} gameId - Steam app ID of the game
 * @returns {Promise<Array>} Array of launch option objects sorted by upvotes
 * @throws {Error} When database queries fail
 */
export async function fetchLaunchOptionsForGame(gameId) {
  try {
    console.log(`🚀 Fetching launch options for game ID: ${gameId}`);
    
    const { data: gameExists, error: gameCheckError } = await supabase
      .from('games')
      .select('app_id, title')
      .eq('app_id', gameId)
      .single();
    
    if (gameCheckError) {
      console.error('❌ Game check error:', gameCheckError);
      throw new Error(`Game ${gameId} not found: ${gameCheckError.message}`);
    }
    
    console.log(`✅ Found game: ${gameExists.title} (ID: ${gameId})`);
    
    const { data: gameOptions, error: joinError } = await supabase
      .from('game_launch_options')
      .select('launch_option_id')
      .eq('game_app_id', gameId);
    
    console.log(`🔗 Junction table query result:`, { 
      gameId,
      found: gameOptions?.length || 0, 
      error: joinError?.message || 'none'
    });
        
    if (joinError) {
      console.error('❌ Junction table error:', joinError);
      throw new Error(`Failed to query game_launch_options for game ${gameId}: ${joinError.message}`);
    }
    
    if (!gameOptions || gameOptions.length === 0) {
      console.log(`ℹ️ No launch options found for game ${gameId}`);
      return [];
    }
    
    const optionIds = gameOptions.map(option => option.launch_option_id);
    console.log(`🎯 Looking up ${optionIds.length} launch option IDs`);
    
    const { data: options, error: optionsError } = await supabase
      .from('launch_options')
      .select(`
        id,
        command,
        description,
        upvotes,
        downvotes,
        verified,
        source,
        created_at
      `)
      .in('id', optionIds)
      .order('upvotes', { ascending: false });
    
    if (optionsError) {
      console.error('❌ Launch options error:', optionsError);
      throw new Error(`Failed to fetch launch options details: ${optionsError.message}`);
    }
    
    const transformedOptions = (options || []).map(option => ({
      id: option.id,
      option: option.command,
      command: option.command,
      description: option.description || 'No description available',
      source: option.source || 'Community',
      upvotes: option.upvotes || 0,
      downvotes: option.downvotes || 0,
      verified: option.verified || false,
      created_at: option.created_at
    }));
    
    console.log(`✅ Successfully transformed ${transformedOptions.length} launch options for game ${gameId}`);
    
    return transformedOptions;
    
  } catch (error) {
    console.error(`💥 Error in fetchLaunchOptionsForGame(${gameId}):`, error.message);
    throw error;
  }
}