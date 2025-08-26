import { 
  fetchGames, 
  getSearchSuggestions, 
  getFacets,
  fetchGameWithLaunchOptions,
  fetchLaunchOptionsForGame,
  getGameStatistics
} from '../services/gamesService.js';

/**
 * @fileoverview Games controller with clean, structured logging and error handling
 * Handles all game-related HTTP requests and coordinates with the service layer
 */

// ============================================================================
// LOGGING UTILITIES
// ============================================================================

class GamesLogger {
  constructor(enabled = process.env.NODE_ENV === 'development') {
    this.enabled = enabled;
    this.requestId = this.generateRequestId();
  }

  generateRequestId() {
    return Math.random().toString(36).substr(2, 8);
  }

  log(level, section, message, data = null) {
    if (!this.enabled) return;

    const timestamp = new Date().toISOString().substr(11, 12);
    const levelIcon = {
      'INFO': '📋',
      'DEBUG': '🔍', 
      'SUCCESS': '✅',
      'WARNING': '⚠️',
      'ERROR': '❌',
      'RESULT': '📊'
    }[level] || '📝';

    const prefix = `[${timestamp}] ${levelIcon} [${this.requestId}] ${section}:`;
    
    if (data) {
      console.log(`${prefix} ${message}`);
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log(`${prefix} ${message}`);
    }
  }

  section(title) {
    if (!this.enabled) return;
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🎯 ${title.toUpperCase()}`);
    console.log(`${'='.repeat(60)}`);
  }

  subsection(title) {
    if (!this.enabled) return;
    console.log(`\n--- ${title} ---`);
  }

  info(section, message, data) { this.log('INFO', section, message, data); }
  debug(section, message, data) { this.log('DEBUG', section, message, data); }
  success(section, message, data) { this.log('SUCCESS', section, message, data); }
  warning(section, message, data) { this.log('WARNING', section, message, data); }
  error(section, message, data) { this.log('ERROR', section, message, data); }
  result(section, message, data) { this.log('RESULT', section, message, data); }
}

/**
 * Helper function to parse boolean parameters consistently
 */
function parseBoolean(value) {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return undefined;
}

/**
 * Analyzes and logs parameter parsing results
 */
function analyzeParameters(query, logger) {
  logger.subsection('Request Analysis');
  
  const analysis = {
    url: query.originalUrl || 'unknown',
    totalParams: Object.keys(query).length,
    hasSearch: !!query.search,
    hasFilters: !!(query.genre || query.engine || query.developer || query.category),
    hasPagination: !!(query.page || query.limit),
    hasSorting: !!(query.sort || query.order),
    hasSpecialFlags: !!(query.hasOptions || query.showAll)
  };

  logger.info('REQUEST', 'Incoming request analysis', analysis);

  // Parse critical parameters
  const hasOptions = parseBoolean(query.hasOptions);
  const showAll = parseBoolean(query.showAll);

  const parameterSummary = {
    hasOptions: { raw: query.hasOptions, parsed: hasOptions, type: typeof hasOptions },
    showAll: { raw: query.showAll, parsed: showAll, type: typeof showAll },
    search: query.search || '(none)',
    filters: {
      genre: query.genre || query.category || '(none)',
      engine: query.engine || '(none)', 
      developer: query.developer || '(none)',
      year: query.year || '(none)'
    }
  };

  logger.debug('PARAMS', 'Parameter parsing results', parameterSummary);

  return { hasOptions, showAll, analysis };
}

/**
 * Determines and logs the filtering strategy
 */
function determineFilteringStrategy(hasOptions, showAll, logger) {
  logger.subsection('Filtering Strategy');

  let strategy, hasLaunchOptions, description;

  if (showAll === true) {
    strategy = 'SHOW_ALL';
    hasLaunchOptions = undefined;
    description = 'Show all games regardless of launch options';
  } else if (hasOptions === true) {
    strategy = 'OPTIONS_ONLY';
    hasLaunchOptions = true;
    description = 'Show only games with launch options';
  } else if (hasOptions === false) {
    strategy = 'NO_OPTIONS_ONLY';
    hasLaunchOptions = false;
    description = 'Show only games without launch options';
  } else {
    strategy = 'DEFAULT_OPTIONS_FIRST';
    hasLaunchOptions = true;
    description = 'Default behavior: prioritize games with launch options';
  }

  logger.info('STRATEGY', `Selected strategy: ${strategy}`, {
    strategy,
    hasLaunchOptions,
    description,
    reasoning: {
      showAllFlag: showAll,
      hasOptionsFlag: hasOptions,
      isDefault: hasOptions === undefined && showAll === undefined
    }
  });

  return { strategy, hasLaunchOptions };
}

/**
 * Builds and validates the filters object
 */
function buildFilters(query, hasLaunchOptions, logger) {
  logger.subsection('Filter Construction');

  const filters = {
    // Search and text filters
    search: query.search || '',
    searchQuery: query.search || '',
    
    // Category filters
    genre: query.genre || query.category || '',
    engine: query.engine || '',
    platform: query.platform || '',
    developer: query.developer || '',
    category: query.category || '',
    
    // Special filters
    options: query.options || '',
    year: query.year || '',
    releaseYear: query.year || '',
    
    // Pagination and sorting
    sort: query.sort || 'title',
    order: query.order || 'asc',
    page: parseInt(query.page, 10) || 1,
    limit: parseInt(query.limit, 10) || 20,
    
    // Launch options filtering
    hasLaunchOptions: hasLaunchOptions
  };

  // Validate pagination
  if (filters.page < 1) filters.page = 1;
  if (filters.limit < 1 || filters.limit > 100) filters.limit = 20;

  const filterSummary = {
    textFilters: {
      search: filters.search || '(none)',
      developer: filters.developer || '(none)'
    },
    categoryFilters: {
      genre: filters.genre || '(none)',
      engine: filters.engine || '(none)',
      year: filters.year || '(none)'
    },
    pagination: {
      page: filters.page,
      limit: filters.limit
    },
    sorting: {
      sort: filters.sort,
      order: filters.order
    },
    specialFilters: {
      hasLaunchOptions: filters.hasLaunchOptions,
      options: filters.options || '(none)'
    }
  };

  logger.debug('FILTERS', 'Final filter configuration', filterSummary);

  return filters;
}

/**
 * Logs and analyzes the service result
 */
function analyzeResult(result, filters, strategy, logger) {
  logger.subsection('Result Analysis');

  const summary = {
    totalGames: result.total || 0,
    gamesReturned: result.games?.length || 0,
    totalPages: result.totalPages || 0,
    currentPage: result.currentPage || 1,
    strategy: strategy,
    hasLaunchOptionsFilter: filters.hasLaunchOptions,
    performance: {
      expectedResults: strategy === 'SHOW_ALL' ? 'All games' : 'Filtered games',
      actualResults: `${result.games?.length || 0} games returned`
    }
  };

  logger.result('SERVICE', 'Query execution summary', summary);

  // Sample games analysis
  if (result.games?.length > 0) {
    const sampleSize = Math.min(3, result.games.length);
    const sampleGames = result.games.slice(0, sampleSize).map(game => ({
      title: game.title,
      appId: game.app_id,
      optionsCount: game.total_options_count || 0,
      engine: game.engine || 'Unknown',
      hasOptions: (game.total_options_count || 0) > 0
    }));

    logger.debug('SAMPLE', `Sample of ${sampleSize} games returned`, sampleGames);

    // Validate filtering worked correctly
    if (filters.hasLaunchOptions === true) {
      const gamesWithoutOptions = sampleGames.filter(g => !g.hasOptions);
      if (gamesWithoutOptions.length > 0) {
        logger.warning('VALIDATION', 'Found games without options when filtering for games WITH options', gamesWithoutOptions);
      }
    } else if (filters.hasLaunchOptions === false) {
      const gamesWithOptions = sampleGames.filter(g => g.hasOptions);
      if (gamesWithOptions.length > 0) {
        logger.warning('VALIDATION', 'Found games with options when filtering for games WITHOUT options', gamesWithOptions);
      }
    }
  }

  return summary;
}

// ============================================================================
// CONTROLLER FUNCTIONS
// ============================================================================

/**
 * Main controller for fetching games with filter and search capabilities
 * plus structured logging and comprehensive error handling
 */
export async function gamesController(req, res) {
  const logger = new GamesLogger();
  
  try {
    logger.section('Games Controller Request');

    // Step 1: Analyze incoming request
    const { hasOptions, showAll, analysis } = analyzeParameters(req.query, logger);

    // Step 2: Determine filtering strategy
    const { strategy, hasLaunchOptions } = determineFilteringStrategy(hasOptions, showAll, logger);

    // Step 3: Build and validate filters
    const filters = buildFilters(req.query, hasLaunchOptions, logger);

    // Step 4: Execute service call
    logger.subsection('Service Execution');
    logger.info('SERVICE', 'Calling fetchGames service', {
      key_filters: {
        hasLaunchOptions: filters.hasLaunchOptions,
        search: filters.search,
        developer: filters.developer,
        page: filters.page,
        limit: filters.limit
      }
    });

    const result = await fetchGames(filters);
    
    // Step 5: Analyze and log results
    const resultSummary = analyzeResult(result, filters, strategy, logger);

    // Step 6: Prepare response
    const response = {
      games: result.games || [],
      total: result.total || 0,
      totalPages: result.totalPages || 0,
      currentPage: result.currentPage || 1,
      hasNextPage: result.hasNextPage || false,
      hasPrevPage: result.hasPrevPage || false,
      facets: result.facets || {},
      // Debug info (remove in production)
      ...(process.env.NODE_ENV === 'development' && {
        debug: {
          requestId: logger.requestId,
          strategy: strategy,
          appliedFilters: {
            hasLaunchOptions: filters.hasLaunchOptions,
            search: filters.search,
            developer: filters.developer
          },
          resultSummary: {
            total: result.total,
            returned: result.games?.length,
            pages: result.totalPages
          }
        }
      })
    };

    logger.success('RESPONSE', 'Successfully processed request', {
      responseSize: response.games.length,
      total: response.total,
      strategy: strategy
    });

    res.json(response);

  } catch (err) {
    logger.error('CONTROLLER', 'Request failed', {
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });

    res.status(500).json({ 
      error: 'Failed to fetch games',
      requestId: logger.requestId,
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
}

/**
 * Provides search suggestions for autocomplete functionality
 * Minimal logging for performance
 */
export async function searchSuggestionsController(req, res) {
  const logger = new GamesLogger();
  
  try {
    const { q: query, limit = 10 } = req.query;
    
    if (!query || query.length < 2) {
      logger.debug('SUGGESTIONS', 'Query too short, returning empty results', { query, length: query?.length });
      return res.json([]);
    }

    logger.info('SUGGESTIONS', 'Fetching suggestions', { query, limit: parseInt(limit) });

    const suggestions = await getSearchSuggestions(query, parseInt(limit));
    
    logger.success('SUGGESTIONS', 'Suggestions retrieved', { count: suggestions.length });
    
    res.json(suggestions);
  } catch (err) {
    logger.error('SUGGESTIONS', 'Failed to fetch suggestions', { error: err.message });
    res.status(500).json({ 
      error: 'Failed to fetch search suggestions',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
}

/**
 * Retrieves available filter options (facets) for dynamic UI generation
 */
export async function filterFacetsController(req, res) {
  const logger = new GamesLogger();
  
  try {
    const searchQuery = req.query.search || '';
    
    logger.info('FACETS', 'Fetching filter facets', { searchQuery });
    
    const facets = await getFacets(searchQuery);
    
    logger.success('FACETS', 'Facets retrieved', { 
      facetCount: Object.keys(facets).length,
      categories: Object.keys(facets)
    });
    
    res.json(facets);
  } catch (err) {
    logger.error('FACETS', 'Failed to fetch facets', { error: err.message });
    res.status(500).json({ 
      error: 'Failed to fetch filter facets',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
}

/**
 * Fetches complete details for a specific game including launch options
 */
export async function gameDetailsController(req, res) {
  const logger = new GamesLogger();
  
  try {
    const { id } = req.params;
    const gameId = parseInt(id);
    
    if (isNaN(gameId)) {
      logger.warning('DETAILS', 'Invalid game ID provided', { id, gameId });
      return res.status(400).json({ error: 'Invalid game ID' });
    }

    logger.info('DETAILS', 'Fetching game details', { gameId });

    const game = await fetchGameWithLaunchOptions(gameId);
    
    logger.success('DETAILS', 'Game details retrieved', { 
      gameId, 
      title: game.title,
      optionsCount: game.launch_options?.length || 0
    });
    
    res.json(game);
  } catch (err) {
    logger.error('DETAILS', 'Failed to fetch game details', { gameId: req.params.id, error: err.message });
    
    if (err.message.includes('not found')) {
      res.status(404).json({ error: err.message });
    } else {
      res.status(500).json({ 
        error: 'Failed to fetch game details',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    }
  }
}

/**
 * Retrieves only the launch options for a specific game
 */
export async function gameLaunchOptionsController(req, res) {
  const logger = new GamesLogger();
  
  try {
    const { id } = req.params;
    const gameId = parseInt(id);
    
    if (isNaN(gameId)) {
      logger.warning('OPTIONS', 'Invalid game ID for launch options', { id });
      return res.status(400).json({ error: 'Invalid game ID' });
    }

    logger.info('OPTIONS', 'Fetching launch options only', { gameId });

    const launchOptions = await fetchLaunchOptionsForGame(gameId);
    
    logger.success('OPTIONS', 'Launch options retrieved', { 
      gameId, 
      optionsCount: launchOptions.length 
    });
    
    res.json(launchOptions);
  } catch (err) {
    logger.error('OPTIONS', 'Failed to fetch launch options', { gameId: req.params.id, error: err.message });
    res.status(500).json({ 
      error: 'Failed to fetch launch options',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
}

/**
 * Retrieves game statistics for progressive disclosure UI
 */
export async function gameStatisticsController(req, res) {
  const logger = new GamesLogger();
  
  try {
    logger.info('STATS', 'Fetching game statistics', { filters: req.query });

    const filters = {
      search: req.query.search || '',
      searchQuery: req.query.search || '',
      developer: req.query.developer || '',
      category: req.query.category || '',
      year: req.query.year || '',
      engine: req.query.engine || ''
    };

    const statistics = await getGameStatistics(filters);
    
    logger.success('STATS', 'Statistics retrieved', {
      totalGames: statistics.totalGames,
      gamesWithOptions: statistics.gamesWithOptions,
      gamesWithoutOptions: statistics.gamesWithoutOptions
    });
    
    res.json(statistics);
  } catch (err) {
    logger.error('STATS', 'Failed to fetch statistics', { error: err.message });
    res.status(500).json({ 
      error: 'Failed to fetch game statistics',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
}