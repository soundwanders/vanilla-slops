import supabase from '../config/supabaseClient.js';

const FACETS_TTL_MS = 5 * 60 * 1000;
const _facetsCache = { data: null, expiresAt: 0 };

/**
 * @fileoverview Games service layer providing data access
 * Handles logic database operations for Steam games and their launch options
 * Implements search, filter, and pagination
 */

/**
 * @typedef {Object} GameFilter
 * @property {string} [search=''] - Search term for title, developer, publisher
 * @property {string} [searchQuery=''] - Alternative search parameter name
 * @property {string} [genre=''] - Game genre filter
 * @property {string} [engine=''] - Game engine filter
 * @property {string} [platform=''] - Platform filter
 * @property {string} [developer=''] - Developer name filter
 * @property {string} [category=''] - Game category filter
 * @property {string} [options=''] - Launch options filter type
 * @property {string} [year=''] - Release year filter
 * @property {string} [releaseYear=''] - Alternative year parameter name
 * @property {string} [sort='title'] - Sort field
 * @property {string} [order='asc'] - Sort order (asc/desc)
 * @property {number} [page=1] - Page number for pagination
 * @property {number} [limit=20] - Items per page
 * @property {number} [minOptionsCount] - Minimum launch options count
 * @property {number} [maxOptionsCount] - Maximum launch options count
 */

/**
 * @typedef {Object} GameResult
 * @property {Array<Object>} games - Array of game objects
 * @property {number} total - Total number of matching games
 * @property {number} totalPages - Total number of pages
 * @property {number} currentPage - Current page number
 * @property {boolean} hasNextPage - Whether more pages exist
 * @property {boolean} hasPrevPage - Whether previous pages exist
 * @property {Object} facets - Available filter options with counts
 */

/**
 * @typedef {Object} SearchSuggestion
 * @property {string} type - Suggestion type ('title', 'developer', 'publisher')
 * @property {string} value - The suggested value
 * @property {string} category - Display category for UI grouping
 */

/**
 * Main function to fetch games with filtering and pagination
 * Supports multiple search parameters and maintains backward compatibility
 * 
 * @async
 * @function fetchGames
 * @param {GameFilter} filters - Filter and pagination parameters
 * @returns {Promise<GameResult>} Promise resolving to games with metadata
 * @throws {Error} When database query fails or invalid parameters provided
 * 
 * @example
 * const result = await fetchGames({
 *   search: 'half life',
 *   developer: 'valve',
 *   page: 1,
 *   limit: 20,
 *   sort: 'title',
 *   order: 'asc'
 * });
 */
export async function fetchGames({
  search = '',
  searchQuery = '',
  genre = '',
  engine = '',
  platform = '',
  developer = '',
  category = '',
  risk = '',
  optionSearch = '',
  options = '',
  year = '',
  releaseYear = '',
  sort = 'title',
  order = 'asc',
  page = 1,
  limit = 20,
  minOptionsCount,
  maxOptionsCount
} = {}) {
  try {
    // Use search or searchQuery (support both frontend conventions)
    const searchTerm = search || searchQuery || '';
    const yearFilter = year || releaseYear || '';
    const genreFilter = genre || '';

    // Launch-option attribute filters (feedback #1): narrow to games that have
    // at least one option matching the chosen category, risk level, and/or a
    // command search (e.g. "-novid" → games that use it).
    const optionCategory = (category || '').trim();
    const optionRisk = (risk || '').trim();
    const optionCommand = (optionSearch || '').replace(/[%,()]/g, ' ').trim();
    const hasOptionAttrFilter = Boolean(optionCategory) || Boolean(optionRisk) || Boolean(optionCommand);

    const offset = (page - 1) * limit;

    // When filtering by option attributes we embed the junction + options as an
    // INNER join so PostgREST filters games down to those with a matching option
    // (count stays a distinct-games count — verified against ground truth). The
    // embedded rows are stripped before returning; the SPA fetches options
    // separately. Without an attribute filter we keep the lean `*` select.
    const selectClause = hasOptionAttrFilter
      ? '*, game_launch_options!inner(launch_options!inner(risk_level, categories))'
      : '*';

    let query = supabase
      .from('games')
      .select(selectClause, { count: 'exact' });

    // Apply search filters
    query = applySearchFilters(query, {
      searchTerm,
      genre: genreFilter,
      engine,
      platform,
      developer,
      options,
      yearFilter,
      minOptionsCount,
      maxOptionsCount
    });

    // Apply launch-option attribute filters on the embedded resource
    query = applyOptionAttributeFilter(query, { category: optionCategory, risk: optionRisk, command: optionCommand });

    // Apply sorting
    query = applySorting(query, sort, order);

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    const { data, count, error } = await query;

    if (error) {
      console.error('Supabase query error:', error);
      throw new Error('Failed to fetch games from database');
    }

    // Strip the embedded junction/options rows used only for filtering, so the
    // response shape stays identical to the unfiltered case.
    let games = data || [];
    if (hasOptionAttrFilter) {
      games = games.map((row) => {
        const copy = { ...row };
        delete copy.game_launch_options;
        return copy;
      });
    }

    // Fetch facets for dynamic UI generation
    const facets = await getFacets(searchTerm);

    return {
      games,
      total: count || 0,
      totalPages: Math.ceil((count || 0) / limit),
      currentPage: page,
      facets,
      hasNextPage: page < Math.ceil((count || 0) / limit),
      hasPrevPage: page > 1
    };
  } catch (error) {
    console.error('Error in fetchGames:', error);
    throw error;
  }
}

/**
 * Applies search and filter conditions to Supabase query
 * Handles multi-term search, exact matches, range filters, and special options
 * 
 * @function applySearchFilters
 * @param {Object} query - Supabase query builder instance
 * @param {Object} filters - Filter parameters to apply
 * @param {string} [filters.searchTerm] - Search term for multiple fields
 * @param {string} [filters.genre] - Genre exact match
 * @param {string} [filters.engine] - Engine filter (partial match)
 * @param {string} [filters.platform] - Platform filter
 * @param {string} [filters.developer] - Developer filter (partial match)
 * @param {string} [filters.options] - Special launch options filter
 * @param {string} [filters.yearFilter] - Release year filter
 * @param {number} [filters.minOptionsCount] - Minimum options count
 * @param {number} [filters.maxOptionsCount] - Maximum options count
 * @returns {Object} Modified Supabase query with filters applied
 */
function applySearchFilters(query, filters) {
  const {
    searchTerm,
    engine,
    developer,
    options,
    yearFilter,
    minOptionsCount,
    maxOptionsCount
  } = filters;

  // Multi-field search
  if (searchTerm && searchTerm.trim()) {
    const searchTerms = searchTerm.trim().split(/\s+/);
    
    if (searchTerms.length === 1) {
      // Single term - search across multiple fields
      const term = searchTerms[0];
      query = query.or(`title.ilike.%${term}%,developer.ilike.%${term}%,publisher.ilike.%${term}%`);
    } else {
      // Multiple terms - each term must match at least one field
      searchTerms.forEach(term => {
        query = query.or(`title.ilike.%${term}%,developer.ilike.%${term}%,publisher.ilike.%${term}%`);
      });
    }
  }

  // Exact match filters (only apply if the field exists in the database)
  if (developer) query = query.ilike('developer', `%${developer}%`);
  // Engine is an exact match — the value comes from the facet dropdown (a real
  // DB family), and the families are distinct, not spelling variants: a
  // substring match would let "Source" pull in "Source 2" and "Source Engine",
  // and "id Tech" is a family whose games shouldn't merge across versions here.
  if (engine) query = query.eq('engine', engine);
  
  // Handle special launch options filters
  if (options) {
    switch (options) {
      case 'has-options':
        query = query.gt('total_options_count', 0);
        break;
      case 'no-options':
        query = query.eq('total_options_count', 0);
        break;
      case 'many-options':
        query = query.gte('total_options_count', 5);
        break;
      case 'few-options':
        query = query.gte('total_options_count', 1).lte('total_options_count', 4);
        break;
      default:
        // Unknown filter value — fall back to default options-first behavior
        query = query.gt('total_options_count', 0);
        break;
    }
  }

  // Range filters
  if (minOptionsCount !== undefined) {
    query = query.gte('total_options_count', minOptionsCount);
  }
  if (maxOptionsCount !== undefined) {
    query = query.lte('total_options_count', maxOptionsCount);
  }

  // Release year filter — release_date is text, so substring match covers
  // both display format ("Feb 8, 2018") and ISO format ("2018-02-08")
  if (yearFilter) {
    const yearInt = parseInt(yearFilter.trim(), 10);

    if (!isNaN(yearInt) && yearInt >= 1980 && yearInt <= new Date().getFullYear() + 1) {
      query = query.ilike('release_date', `%${yearInt}%`);
    } else {
      console.warn(`⚠️ Invalid year filter ignored: ${yearFilter}`);
    }
  }

  return query;
}

/**
 * Applies launch-option attribute filters to an embedded-resource query.
 * Both conditions target the same inner-joined launch_options row, so passing
 * category AND risk means "has an option that is both" — the intuitive reading.
 * Assumes the query was built with the game_launch_options!inner(launch_options!inner(...))
 * embed; a no-op when neither filter is set.
 *
 * @param {Object} query - Supabase query builder with the options embed
 * @param {Object} attrs
 * @param {string} [attrs.category] - Launch-option category (e.g. "Display")
 * @param {string} [attrs.risk] - Risk level: safe | caution | experimental
 * @returns {Object} Modified query
 */
function applyOptionAttributeFilter(query, { category, risk, command } = {}) {
  if (risk) {
    query = query.eq('game_launch_options.launch_options.risk_level', risk);
  }
  if (category) {
    // categories is text[]; `contains` matches rows whose array includes the value
    query = query.contains('game_launch_options.launch_options.categories', [category]);
  }
  if (command) {
    // Command search (feedback: "search by the actual launch option"): games
    // that have an option whose command matches. Substring so partial/typed
    // queries work; the suggestion dropdown resolves fuzzy intent to a command.
    query = query.ilike('game_launch_options.launch_options.command', `%${command}%`);
  }
  return query;
}

/**
 * Applies sorting to query with field validation and mapping
 * Maps frontend sort field names to database column names
 *
 * @function applySorting
 * @param {Object} query - Supabase query builder instance
 * @param {string} sort - Sort field name from frontend
 * @param {string} order - Sort order ('asc' or 'desc')
 * @returns {Object} Query with sorting applied
 */
function applySorting(query, sort, order) {
  const ascending = order === 'asc';
  const validSortFields = ['title', 'release_date', 'developer', 'publisher', 'total_options_count', 'created_at'];
  
  // Map frontend sort values to backend fields
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
      // For relevance, we use title, but could implement more complex scoring
      sortField = 'title';
      break;
  }
  
  if (validSortFields.includes(sortField)) {
    // nullsFirst:false keeps missing values (e.g. blank release dates) at the end
    // regardless of sort direction
    query = query.order(sortField, { ascending, nullsFirst: false });
  } else {
    // Default sort
    query = query.order('title', { ascending: true });
  }

  return query;
}

/**
 * Provides intelligent search suggestions for autocomplete functionality
 * Searches across game titles, developers, and publishers with deduplication
 * 
 * @async
 * @function getSearchSuggestions
 * @param {string} query - Search query (minimum 2 characters)
 * @param {number} [limit=10] - Maximum number of suggestions to return
 * @returns {Promise<SearchSuggestion[]>} Array of categorized search suggestions
 * @throws {Error} When database query fails
 * 
 * @example
 * const suggestions = await getSearchSuggestions('half', 5);
 * // Returns: [
 * //   { type: 'title', value: 'Half-Life', category: 'Games' },
 * //   { type: 'developer', value: 'Valve Corporation', category: 'Developers' }
 * // ]
 */
export async function getSearchSuggestions(query, limit = 10) {
  try {
    if (!query || query.length < 2) return [];

    // Strip characters that would break PostgREST's or-filter grammar or act as
    // ilike wildcards, so a stray comma/percent can't corrupt the query.
    const safe = query.replace(/[%,()]/g, ' ').trim();
    if (!safe) return [];

    const { data, error } = await supabase
      .from('games')
      .select('title, developer, publisher')
      .or(`title.ilike.%${safe}%,developer.ilike.%${safe}%,publisher.ilike.%${safe}%`)
      .limit(limit * 3); // Get more to filter duplicates

    if (error) {
      console.error('Error fetching suggestions:', error);
      return [];
    }

    const suggestions = new Map(); // Use Map to avoid duplicates
    const queryLower = query.toLowerCase();

    data?.forEach(game => {
      // Add matching titles
      if (game.title && game.title.toLowerCase().includes(queryLower)) {
        suggestions.set(`title_${game.title}`, {
          type: 'title',
          value: game.title,
          category: 'Games'
        });
      }
      // Add matching developers
      if (game.developer && game.developer.toLowerCase().includes(queryLower)) {
        suggestions.set(`developer_${game.developer}`, {
          type: 'developer',
          value: game.developer,
          category: 'Developers'
        });
      }
      // Add matching publishers
      if (game.publisher && game.publisher.toLowerCase().includes(queryLower)) {
        suggestions.set(`publisher_${game.publisher}`, {
          type: 'publisher',
          value: game.publisher,
          category: 'Publishers'
        });
      }
    });

    const gameSuggestions = Array.from(suggestions.values()).slice(0, limit);

    // Launch-option matches — the discovery path. Match on the command AND the
    // description, so someone who doesn't know the flag can type what they want
    // ("skip intro", "vsync") and still find `-novid`, etc.
    // `!inner` on the junction table excludes orphan options (0 linked games):
    // an option that no game actually uses would yield 0 results if picked, so
    // it doesn't belong in suggestions. This is dynamic and self-reversing — the
    // filter is "has ≥1 game" at query time, not a hardcoded exclusion list, so
    // if a game is later added with that option it becomes searchable again on
    // its own. The embedded rows are capped at 1 (existence is all we need).
    const { data: optData } = await supabase
      .from('launch_options')
      .select('command, description, game_launch_options!inner(game_app_id)')
      .or(`command.ilike.%${safe}%,description.ilike.%${safe}%`)
      .limit(1, { referencedTable: 'game_launch_options' })
      .limit(12);

    const optionSuggestions = [];
    const seenCmd = new Set();
    (optData || []).forEach((o) => {
      if (!o.command || seenCmd.has(o.command)) return;
      seenCmd.add(o.command);
      optionSuggestions.push({
        type: 'option',
        value: o.command,
        description: o.description || '',
        category: 'Launch options'
      });
    });
    // Command matches are the strongest signal — surface those first.
    optionSuggestions.sort((a, b) => {
      const aCmd = a.value.toLowerCase().includes(queryLower) ? 0 : 1;
      const bCmd = b.value.toLowerCase().includes(queryLower) ? 0 : 1;
      return aCmd - bCmd;
    });

    return [...gameSuggestions, ...optionSuggestions.slice(0, 6)];
  } catch (error) {
    console.error('Error in getSearchSuggestions:', error);
    return [];
  }
}

/**
 * Retrieves filter facets for dynamic UI generation
 * Provides available filter options with occurrence counts
 * 
 * @async
 * @function getFacets  
 * @param {string} [searchQuery=''] - Optional search context for filtering facets
 * @returns {Promise<Object>} Object containing arrays of available filter options
 * @property {Array} developers - Available developers with counts
 * @property {Array} engines - Available engines with counts  
 * @property {Array} publishers - Available publishers with counts
 * @property {Array} genres - Available genres (empty in current schema)
 * @property {Array} platforms - Available platforms (empty in current schema)
 * @property {Array} optionsRanges - Launch options count ranges
 * @property {Array} releaseYears - Available release years
 * @throws {Error} When database queries fail
 */
export async function getFacets(searchQuery = '') {
  const now = Date.now();

  // Serve cached facets for unfiltered requests (most common: initial load, filter dropdowns)
  if (!searchQuery && _facetsCache.data && now < _facetsCache.expiresAt) {
    return _facetsCache.data;
  }

  try {
    const facetPromises = [
      getFacetValues('developer', searchQuery),
      getFacetValues('engine', searchQuery),
      getFacetValues('publisher', searchQuery),
      getOptionsCountRanges(),
      getReleaseYears(searchQuery),
      getOptionAttributeFacets(),
      getPopularOptions()
    ];

    const [developers, engines, publishers, optionsRanges, releaseYears, optionAttrs, popularOptions] = await Promise.all(facetPromises);

    const result = {
      developers: developers || [],
      engines: engines || [],
      publishers: publishers || [],
      genres: [],
      platforms: [],
      optionsRanges: optionsRanges || [],
      releaseYears: releaseYears || [],
      categories: optionAttrs?.categories || [],
      riskLevels: optionAttrs?.riskLevels || [],
      popularOptions: popularOptions || []
    };

    if (!searchQuery) {
      _facetsCache.data = result;
      _facetsCache.expiresAt = now + FACETS_TTL_MS;
    }

    return result;
  } catch (error) {
    console.error('Error in getFacets:', error);
    return {
      developers: [],
      engines: [],
      publishers: [],
      genres: [],
      platforms: [],
      optionsRanges: [],
      releaseYears: [],
      categories: [],
      riskLevels: [],
      popularOptions: []
    };
  }
}

/**
 * Most-used launch options across the catalog (by number of games), for the
 * "browse without knowing the flag" list shown when the search box is focused
 * but empty. Cached with the rest of the facets.
 *
 * @param {number} [topN=8]
 * @returns {Promise<Array<{command:string, description:string, count:number}>>}
 */
async function getPopularOptions(topN = 8) {
  try {
    // Each game_launch_options row is a unique (game, option) link, so counting
    // rows per command == number of games that use that command.
    const rows = await fetchAllRows((from, to) =>
      supabase
        .from('game_launch_options')
        .select('launch_option_id, launch_options!inner(command, description)')
        .order('launch_option_id', { ascending: true })
        .range(from, to)
    );

    const counts = {};
    rows.forEach((r) => {
      const lo = r.launch_options;
      if (!lo || !lo.command) return;
      if (!counts[lo.command]) {
        counts[lo.command] = { command: lo.command, description: lo.description || '', count: 0 };
      }
      counts[lo.command].count++;
    });

    return Object.values(counts)
      .sort((a, b) => b.count - a.count)
      .slice(0, topN);
  } catch (error) {
    console.error('Error in getPopularOptions:', error);
    return [];
  }
}

/**
 * Get the launch-option attribute facets that drive the category and risk
 * filters (feedback #1). Reads directly from launch_options (well under the
 * 1000-row cap) and aggregates in JS. Counts are per-option (how many options
 * carry the value), used only to order the dropdowns — the filtered results are
 * games, so counts are not surfaced as game totals in the UI.
 *
 * @returns {Promise<{categories: Array<{value:string,count:number}>, riskLevels: Array<{value:string,count:number}>}>}
 */
async function getOptionAttributeFacets() {
  try {
    const { data, error } = await supabase
      .from('launch_options')
      .select('risk_level, categories');

    if (error) {
      console.error('Error fetching option attribute facets:', error);
      return { categories: [], riskLevels: [] };
    }

    const catCounts = {};
    const riskCounts = {};
    (data || []).forEach((o) => {
      if (o.risk_level) riskCounts[o.risk_level] = (riskCounts[o.risk_level] || 0) + 1;
      if (Array.isArray(o.categories)) {
        o.categories.forEach((c) => {
          // "Uncategorized" isn't a useful filter choice — omit it
          if (c && c !== 'Uncategorized') catCounts[c] = (catCounts[c] || 0) + 1;
        });
      }
    });

    const categories = Object.entries(catCounts)
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count);

    const riskOrder = { safe: 0, caution: 1, experimental: 2 };
    const riskLevels = Object.entries(riskCounts)
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => (riskOrder[a.value] ?? 9) - (riskOrder[b.value] ?? 9));

    return { categories, riskLevels };
  } catch (error) {
    console.error('Error in getOptionAttributeFacets:', error);
    return { categories: [], riskLevels: [] };
  }
}

/**
 * Get unique values for a specific field with occurrence counts
 */
/**
 * Fetch every row matching a query, paging past Supabase's 1000-row cap.
 * Counting rows without this silently undercounts once a table exceeds 1000.
 *
 * @param {Function} buildQuery - (from, to) => Supabase query for that range
 * @returns {Promise<Array>} all matching rows
 */
async function fetchAllRows(buildQuery) {
  const PAGE = 1000;
  let from = 0;
  const all = [];

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await buildQuery(from, from + PAGE - 1);
    if (error) {
      console.error('Paged fetch error:', error);
      break;
    }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return all;
}

async function getFacetValues(field, searchQuery = '') {
  try {
    // Counts cover every game, matching the default view (all games shown)
    const data = await fetchAllRows((from, to) => {
      let query = supabase
        .from('games')
        .select(field);

      // Apply search filter if provided
      if (searchQuery && searchQuery.trim()) {
        const searchTerms = searchQuery.trim().split(/\s+/);
        searchTerms.forEach(term => {
          query = query.or(`title.ilike.%${term}%,developer.ilike.%${term}%,publisher.ilike.%${term}%`);
        });
      }

      return query
        .not(field, 'is', null)
        .not(field, 'eq', '')
        .order('app_id', { ascending: true })
        .range(from, to);
    });

    // Count occurrences. "Unknown" isn't a useful filter choice (it's the
    // absence of data, ~38% of games for engine), so omit it from the dropdown —
    // consistent with how "Uncategorized" is dropped from the category facet.
    const counts = {};
    data?.forEach(item => {
      const value = item[field];
      if (value && value.trim() && value.trim().toLowerCase() !== 'unknown') {
        counts[value] = (counts[value] || 0) + 1;
      }
    });

    return Object.entries(counts)
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20); // Limit to top 20
  } catch (error) {
    console.error(`Error in getFacetValues for ${field}:`, error);
    return [];
  }
}

/**
 * Get launch options count ranges for filtering
 */
async function getOptionsCountRanges() {
  try {
    const { data, error } = await supabase
      .from('games')
      .select('total_options_count')
      .not('total_options_count', 'is', null);

    if (error) return [];

    const counts = data.map(item => item.total_options_count || 0);
    const max = Math.max(...counts);
    const ranges = [
      { label: 'No options', min: 0, max: 0, count: counts.filter(c => c === 0).length },
      { label: '1-5 options', min: 1, max: 5, count: counts.filter(c => c >= 1 && c <= 5).length },
      { label: '6-10 options', min: 6, max: 10, count: counts.filter(c => c >= 6 && c <= 10).length },
      { label: '11+ options', min: 11, max: max, count: counts.filter(c => c >= 11).length }
    ].filter(range => range.count > 0);

    return ranges;
  } catch (error) {
    console.error('Error in getOptionsCountRanges:', error);
    return [];
  }
}

/**
 * Get available release years for date filtering
 */
async function getReleaseYears(searchQuery = '') {
  try {
    // Covers every game, paged past the 1000-row cap
    const data = await fetchAllRows((from, to) => {
      let query = supabase
        .from('games')
        .select('release_date');

      if (searchQuery && searchQuery.trim()) {
        const searchTerms = searchQuery.trim().split(/\s+/);
        searchTerms.forEach(term => {
          query = query.or(`title.ilike.%${term}%,developer.ilike.%${term}%,publisher.ilike.%${term}%`);
        });
      }

      return query
        .not('release_date', 'is', null)
        .not('release_date', 'eq', '')
        .order('app_id', { ascending: true })
        .range(from, to);
    });

    const years = new Set();
    data?.forEach(item => {
      const dateStr = item.release_date;
      if (dateStr) {
        // Extract year from various date formats
        const yearMatch = dateStr.match(/\b(19|20)\d{2}\b/);
        if (yearMatch) {
          years.add(yearMatch[0]);
        }
      }
    });

    return Array.from(years)
      .sort((a, b) => b.localeCompare(a)); // Newest first, all years included
  } catch (error) {
    console.error('Error in getReleaseYears:', error);
    return [];
  }
}

/**
 * Get game statistics for progressive disclosure UI
 * Counts games with and without launch options, optionally filtered
 * 
 * @async
 * @function getGameStatistics
 * @param {Object} filters - Filter parameters to scope statistics
 * @param {string} [filters.search] - Search term
 * @param {string} [filters.searchQuery] - Alternative search parameter
 * @param {string} [filters.developer] - Developer filter
 * @param {string} [filters.category] - Category filter
 * @param {string} [filters.year] - Year filter
 * @param {string} [filters.engine] - Engine filter
 * @returns {Promise<Object>} Statistics object with counts and percentages
 * @property {number} withOptions - Count of games with launch options
 * @property {number} withoutOptions - Count of games without launch options
 * @property {number} total - Total games matching filters
 * @property {number} percentageWithOptions - Percentage of games with options
 * @throws {Error} When database queries fail
 */
export async function getGameStatistics(filters = {}) {
  try {
    console.log('📊 Calculating game statistics with filters:', filters);

    const baseFilters = {
      searchTerm: filters.search || filters.searchQuery || '',
      developer: filters.developer || '',
      genre: filters.category || '',
      engine: filters.engine || '',
      yearFilter: filters.year || ''
    };

    // Two count-only queries (head:true transfers no rows). Counting rows in JS
    // instead would silently undercount — Supabase caps returned rows at 1000,
    // so `withOptions` would stop at 1000 while `count` stayed exact.
    let totalQuery = supabase.from('games').select('*', { count: 'exact', head: true });
    totalQuery = applySearchFilters(totalQuery, baseFilters);

    let withOptionsQuery = supabase.from('games').select('*', { count: 'exact', head: true });
    withOptionsQuery = applySearchFilters(withOptionsQuery, baseFilters).gt('total_options_count', 0);

    const [totalRes, withRes] = await Promise.all([totalQuery, withOptionsQuery]);

    if (totalRes.error || withRes.error) {
      console.error('Statistics query error:', totalRes.error || withRes.error);
      throw new Error('Failed to fetch game statistics from database');
    }

    const total = totalRes.count || 0;
    const gamesWithOptions = withRes.count || 0;
    const gamesWithoutOptions = total - gamesWithOptions;
    const percentageWithOptions = total > 0 ? (gamesWithOptions / total) * 100 : 0;

    const statistics = {
      withOptions: gamesWithOptions,
      withoutOptions: gamesWithoutOptions,
      total: total,
      percentageWithOptions: Math.round(percentageWithOptions * 10) / 10
    };

    console.log('✅ Statistics calculated:', statistics);
    return statistics;
  } catch (error) {
    console.error('Error in getGameStatistics:', error);
    throw error;
  }
}

/**
 * Fetch every game that has launch options, for sitemap generation.
 * Paginates past Supabase's 1000-row default cap. Only games with options are
 * returned — pages for optionless games would be thin content.
 *
 * @async
 * @returns {Promise<Array<{app_id:number, title:string, updated_at:string}>>}
 */
export async function getGamesForSitemap() {
  const PAGE = 1000;
  let from = 0;
  const all = [];

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('games')
      .select('app_id, title, updated_at')
      .gt('total_options_count', 0)
      .order('app_id', { ascending: true })
      .range(from, from + PAGE - 1);

    if (error) {
      console.error('Error in getGamesForSitemap:', error);
      break;
    }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return all;
}

/**
 * Retrieves complete game information including associated launch options
 * Combines game metadata with launch options in a single response
 * 
 * @async
 * @function fetchGameWithLaunchOptions
 * @param {string|number} gameId - Steam app ID of the game
 * @returns {Promise<Object>} Game object with embedded launch options array
 * @property {number} app_id - Steam app ID
 * @property {string} title - Game title
 * @property {string} developer - Game developer
 * @property {string} publisher - Game publisher
 * @property {string} release_date - Release date string
 * @property {string} engine - Game engine
 * @property {number} total_options_count - Count of launch options
 * @property {Array} launchOptions - Array of launch option objects
 * @throws {Error} When game not found or database query fails
 * 
 * @example
 * const game = await fetchGameWithLaunchOptions(440);
 * // Returns Team Fortress 2 with all launch options
 */
export async function fetchGameWithLaunchOptions(gameId) {
  try {
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
    
    const launchOptions = await fetchLaunchOptionsForGame(gameId);
    
    return {
      ...game,
      launchOptions
    };
  } catch (error) {
    console.error('Error in fetchGameWithLaunchOptions:', error);
    throw error;
  }
}

/**
 * Fetches launch options for a specific game with popularity ordering
 * Performs join operations to get complete launch option details
 * 
 * @async
 * @function fetchLaunchOptionsForGame
 * @param {string|number} gameId - Steam app ID of the game
 * @returns {Promise<Array>} Array of launch option objects sorted by upvotes
 * @property {string} id - Launch option UUID
 * @property {string} option - Launch command (frontend compatibility)
 * @property {string} command - Launch command
 * @property {string} description - Option description
 * @property {string} source - Option source
 * @property {number} upvotes - Community upvotes
 * @property {number} downvotes - Community downvotes
 * @property {boolean} verified - Whether option is verified
 * @throws {Error} When database queries fail
 * 
 */
export async function fetchLaunchOptionsForGame(gameId) {
  try {
    // Single query: join game_launch_options → launch_options via nested select.
    // risk_level / categories / engine_compatibility come from the slop-scraper
    // metadata migration and drive the badge rendering on the frontend.
    const { data, error } = await supabase
      .from('game_launch_options')
      .select(`
        launch_options (
          id,
          command,
          description,
          upvotes,
          downvotes,
          verified,
          source,
          source_url,
          created_at,
          last_verified_at,
          verification_method,
          usage_example,
          effect,
          risk_level,
          categories,
          engine_compatibility
        )
      `)
      .eq('game_app_id', gameId);

    if (error) {
      throw new Error(`Failed to fetch launch options for game ${gameId}: ${error.message}`);
    }

    if (!data || data.length === 0) return [];

    return data
      .map(row => row.launch_options)
      .filter(Boolean)
      .sort((a, b) => (b.upvotes || 0) - (a.upvotes || 0))
      .map(option => ({
        id: option.id,
        option: option.command,
        command: option.command,
        description: option.description || 'No description available',
        source: option.source || 'Community',
        // Nullable — only ~50 rows (ProtonDB) have a URL so far; grows as the
        // scraper re-encounters options. null means "no link", not "broken".
        source_url: option.source_url || null,
        upvotes: option.upvotes || 0,
        downvotes: option.downvotes || 0,
        verified: option.verified || false,
        risk_level: option.risk_level || null,
        categories: option.categories || [],
        engine_compatibility: option.engine_compatibility || [],
        created_at: option.created_at,
        // Freshness signals — currently null across the catalog; populate as
        // --rescan passes run. null must read as "not yet re-checked", not stale.
        last_verified_at: option.last_verified_at || null,
        verification_method: option.verification_method || null,
        // Per-option usage docs — columns exist but the scraper doesn't populate
        // them yet, so these are null for now; the UI renders them only when set.
        usage_example: option.usage_example || null,
        effect: option.effect || null
      }));
  } catch (error) {
    console.error(`Error in fetchLaunchOptionsForGame(${gameId}):`, error.message);
    throw error;
  }
}
