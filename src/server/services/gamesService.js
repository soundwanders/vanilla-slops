import supabase from '../config/supabaseClient.js';
import { FEATURED_APP_IDS, FEATURED_RANK, FEATURED_ID_LIST } from '../config/featuredGames.js';
import { mergeRelatedTiers } from '../utils/relatedGames.js';
import { buildPhantomMap, withDisplayCounts } from '../utils/optionCounts.js';
import { rankBrowsableOptions } from '../utils/optionRanking.js';
import { sanitizeOrFilterValue, toOrFilterTerms } from '../utils/searchTerms.js';
import { dedupeKey } from '../utils/searchNormalize.js';

// Deliberately smaller than the exact-match limit. These are guesses, and a
// long list of guesses reads as the search not working rather than as help —
// past about five the marginal suggestion is always worse than the last.
const FUZZY_SUGGESTION_LIMIT = 5;

// Which heading a suggestion keeps when the same string matched as more than
// one kind of thing. Lower wins.
const TYPE_RANK = { title: 0, developer: 1, publisher: 2 };

const CATEGORY_FOR_KIND = {
  title: 'Games',
  developer: 'Developers',
  publisher: 'Publishers'
};

const FACETS_TTL_MS = 5 * 60 * 1000;
const _facetsCache = { data: null, expiresAt: 0 };

// Catalog totals for the /how-it-works figures line. Deliberately NOT folded
// into _facetsCache: that cache sits on the hot path of every initial catalog
// load, and these counts belong to a page most visitors never open. Its own
// long TTL means ~24 DB reads a day total, whatever the traffic.
const STATS_TTL_MS = 60 * 60 * 1000;
const _statsCache = { data: null, expiresAt: 0 };

// app_id → number of links pointing at options `public_launch_options` hides.
// Small and slow-moving (39 games, 55 links at the time of writing), and only
// changes when the scraper runs, so it gets a long TTL and is computed once
// rather than per request.
const PHANTOM_TTL_MS = 60 * 60 * 1000;
const _phantomCache = { data: null, expiresAt: 0 };

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
    // Passed through as typed. This used to strip `% , ( )` on the theory that
    // they could corrupt the query, which was never true for this filter — it
    // reaches PostgREST through supabase-js's `.ilike()`, which quotes the
    // value, and hostile input simply fails to match (verified: parentheses,
    // quotes and semicolons all return zero rows rather than an error).
    //
    // Stripping was actively wrong, and rev 15 made it visible. The two
    // highest-reach commands in the catalogue are now stored as
    // `gamemoderun %command%` and `mangohud %command%`, so removing `%` turned
    // a filter that should match 2,108 games into one that matched none. It
    // had already been breaking `WINEDLLOVERRIDES=xaudio2_7=n,b` on the comma.
    // Length is bounded by the Zod schema (max 100).
    const optionCommand = (optionSearch || '').trim();
    const hasOptionAttrFilter = Boolean(optionCategory) || Boolean(optionRisk) || Boolean(optionCommand);

    const offset = (page - 1) * limit;

    // When filtering by option attributes we embed the junction + options as an
    // INNER join so PostgREST filters games down to those with a matching option
    // (count stays a distinct-games count — verified against ground truth). The
    // embedded rows are stripped before returning; the SPA fetches options
    // separately. Without an attribute filter we keep the lean `*` select.
    const selectClause = hasOptionAttrFilter
      ? '*, game_launch_options!inner(public_launch_options!inner(risk_level, categories))'
      : '*';

    // Every query variant below starts from the same filtered base. The
    // featured path needs to run two of them (curated block, then the tail),
    // and a Supabase query builder can only be awaited once.
    const buildFilteredQuery = (countOption) => {
      let q = supabase
        .from('public_games')
        .select(selectClause, countOption ? { count: 'exact' } : undefined);

      q = applySearchFilters(q, {
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

      return applyOptionAttributeFilter(q, {
        category: optionCategory,
        risk: optionRisk,
        command: optionCommand
      });
    };

    let data;
    let count;

    if (sort === 'featured') {
      ({ data, count } = await fetchFeaturedPage(buildFilteredQuery, { offset, limit }));
    } else {
      let query = buildFilteredQuery(true);
      query = applySorting(query, sort, order);
      query = query.range(offset, offset + limit - 1);

      const result = await query;
      if (result.error) {
        console.error('Supabase query error:', result.error);
        throw new Error('Failed to fetch games from database');
      }
      ({ data, count } = result);
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

    // Stamp on the count the UI should display. `total_options_count` counts
    // links, including ones to options the view hides, so 39 games advertise
    // more than they can render — Team Fortress 2 says 28 and shows 23. The
    // column stays untouched because sorting and filtering are built on it;
    // this only adds the honest number alongside it. Cached, so it is one
    // lookup an hour rather than a query per request.
    games = withDisplayCounts(games, await getPhantomOptionCounts());

    // Deliberately does NOT compute facets. It used to end with
    // `await getFacets(searchTerm)`, which made every listing request pay for
    // the whole filter-dropdown fan-out — seven queries, one of which pages
    // through all 16k junction rows. Nothing ever read the facets off this
    // response (the client fetches /api/games/facets separately on boot), so
    // it was ~2.7s and ~3.9KB spent on a field with no reader. Worse, a search
    // term bypassed the facets cache, so every search paid it in full.
    return {
      games,
      total: count || 0,
      totalPages: Math.ceil((count || 0) / limit),
      currentPage: page,
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

  // Multi-field search. Each term must match at least one field, so several
  // words narrow the result rather than widening it. The one- and many-term
  // cases were separate branches doing the same thing; they are one loop now.
  //
  // Terms are sanitised because `.or()` parses its argument as a filter
  // expression — see utils/searchTerms.js. Until they were, a title with a
  // comma in it took the whole request down: "Warhammer 40,000" put a bare
  // `000%` where PostgREST expected a condition and the endpoint answered 500.
  for (const term of toOrFilterTerms(searchTerm)) {
    query = query.or(`title.ilike.%${term}%,developer.ilike.%${term}%,publisher.ilike.%${term}%`);
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
 * Both conditions target the same inner-joined option row, so passing category
 * AND risk means "has an option that is both" — the intuitive reading.
 * Assumes the query was built with the
 * game_launch_options!inner(public_launch_options!inner(...)) embed;
 * a no-op when neither filter is set.
 *
 * @param {Object} query - Supabase query builder with the options embed
 * @param {Object} attrs
 * @param {string} [attrs.category] - Launch-option category (e.g. "Display")
 * @param {string} [attrs.risk] - Risk level: safe | caution | experimental
 * @returns {Object} Modified query
 */
export function applyOptionAttributeFilter(query, { category, risk, command } = {}) {
  // Paths address the embedded resource in fetchGames' select clause, which is
  // public_launch_options — so a filter can never match on a row the catalogue
  // does not publish, and a facet value can never return games we can't back up.
  if (risk) {
    query = query.eq('game_launch_options.public_launch_options.risk_level', risk);
  }
  if (category) {
    // categories is text[]; `contains` matches rows whose array includes the value
    query = query.contains('game_launch_options.public_launch_options.categories', [category]);
  }
  if (command) {
    // Command search (feedback: "search by the actual launch option"): games
    // that have an option whose command matches. Substring so partial/typed
    // queries work; the suggestion dropdown resolves fuzzy intent to a command.
    query = query.ilike('game_launch_options.public_launch_options.command', `%${command}%`);
  }
  return query;
}

/**
 * Fetches one page of the "Featured" ordering.
 *
 * The conceptual result set is the curated lineup (in its hand-picked order)
 * followed by everything else by option count — so pagination has to walk a
 * seam between two differently-ordered blocks. Rather than trying to express
 * that as a single SQL ordering, this runs the curated block as its own small
 * query (capped at the lineup's length, so it is cheap) and slices the page
 * across the boundary.
 *
 * Active filters apply to both blocks, so searching or filtering simply
 * removes featured games that no longer match — the lineup never overrides a
 * user's own query.
 *
 * @async
 * @function fetchFeaturedPage
 * @param {(countOption?: boolean) => Object} buildFilteredQuery - Factory returning a fresh filtered query
 * @param {Object} pagination - Page window
 * @param {number} pagination.offset - Zero-based index of the first row wanted
 * @param {number} pagination.limit - Rows per page
 * @returns {Promise<{data: Array<Object>, count: number}>} Page rows and total match count
 * @throws {Error} When either underlying query fails
 */
async function fetchFeaturedPage(buildFilteredQuery, { offset, limit }) {
  // Block one: the curated lineup, ordered in JS by its editorial position
  // rather than by any database column.
  const featuredResult = await buildFilteredQuery()
    .in('app_id', FEATURED_APP_IDS)
    .limit(FEATURED_APP_IDS.length);

  if (featuredResult.error) {
    console.error('Supabase featured query error:', featuredResult.error);
    throw new Error('Failed to fetch games from database');
  }

  const featured = (featuredResult.data || [])
    .sort((a, b) => FEATURED_RANK.get(a.app_id) - FEATURED_RANK.get(b.app_id));

  const pageFeatured = featured.slice(offset, offset + limit);
  const remaining = limit - pageFeatured.length;

  // Block two: everything else, by option count. Once the curated block is
  // exhausted the offset continues into this block, so subtract the rows the
  // lineup already consumed. `app_id` breaks ties for stable pagination —
  // without it, equal option counts can reshuffle between page requests and
  // drop or repeat a row.
  let tailQuery = buildFilteredQuery(true)
    .not('app_id', 'in', FEATURED_ID_LIST)
    .order('total_options_count', { ascending: false, nullsFirst: false })
    .order('app_id', { ascending: true });

  const tailOffset = Math.max(0, offset - featured.length);
  // When the page is already full we still need the tail's total for the
  // pagination footer, so ask for the narrowest possible window rather than
  // skipping the query.
  tailQuery = remaining > 0
    ? tailQuery.range(tailOffset, tailOffset + remaining - 1)
    : tailQuery.range(0, 0);

  const tailResult = await tailQuery;

  if (tailResult.error) {
    console.error('Supabase query error:', tailResult.error);
    throw new Error('Failed to fetch games from database');
  }

  return {
    data: remaining > 0 ? [...pageFeatured, ...(tailResult.data || [])] : pageFeatured,
    count: featured.length + (tailResult.count || 0)
  };
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

    // Same rule the other or-filter paths use, defined once in utils/searchTerms.js.
    const safe = sanitizeOrFilterValue(query);
    if (!safe) return [];

    const rows = await fetchSuggestionRows(query, safe, limit);

    // Keyed on the normalised form, not the raw string. Keying on the raw title
    // made the dropdown show the same game twice whenever two rows differed only
    // in trailing whitespace, a trademark sign or a doubled space — which is a
    // real shape in this catalogue, not a hypothetical (slop-scraper rev 17
    // fixed one such title, 'SaGa Emerald Beyond '). Measured against the
    // published catalogue: 1 title pair, 17 developer groups, 12 publisher
    // groups. Which spelling survives is decided below, deterministically —
    // never by which row the database happened to return first.
    const suggestions = new Map();
    const queryLower = query.toLowerCase();

    // Keyed WITHOUT the type, so 'NetEase Games' cannot appear once under
    // Developers and again under Publishers. That is only correct because
    // picking any of the three does the same thing — selectSuggestion sets the
    // search box to the value and runs a text search; it does not apply a typed
    // filter. Two rows that run an identical search are one row with two
    // headings above it. If suggestion selection ever becomes type-aware, this
    // key has to grow the type back.
    const addSuggestion = (type, value, category) => {
      // `type` comes from a database function, so an unrecognised value is a
      // schema change rather than a typo. Dropping the row beats rendering a
      // group heading that reads "undefined".
      if (!category) return;
      // No raw-substring re-check here. It used to guard against the or-filter
      // returning a row that matched on a DIFFERENT column than the one being
      // read, but it now rejects the very rows this exists to surface —
      // 'F.E.A.R.' does not contain the substring 'fear'. Deciding what matched
      // is the query's job, in both the RPC and the fallback below.
      if (!value) return;
      const key = dedupeKey(value);
      const existing = suggestions.get(key);
      // A title is the likeliest intent, then the developer, then the
      // publisher. Resolved by rank rather than by arrival so the surviving
      // heading does not depend on which database row came back first.
      if (existing && TYPE_RANK[existing.type] <= TYPE_RANK[type]) return;
      // Emitted trimmed, so which of several stored spellings arrived first
      // stops mattering. Two live publisher rows read 'NetEase Games ' and
      // ' 505 Games'; whitespace is invisible in the dropdown, so a padded
      // survivor looks identical to a clean one and behaves differently. It is
      // never worse to send the trimmed form — every downstream use is a
      // substring match, and trimming can only widen what it reaches.
      suggestions.set(key, { type, value: value.trim(), category });
    };

    rows.forEach((row) => {
      addSuggestion(row.kind, row.value, CATEGORY_FOR_KIND[row.kind]);
    });

    const gameSuggestions = Array.from(suggestions.values()).slice(0, limit);

    // Launch-option matches — the discovery path. Match on the command AND the
    // description, so someone who doesn't know the flag can type what they want
    // ("skip intro", "vsync") and still find `-novid`, etc.
    // Orphan options (0 linked games) would yield 0 results if picked, so they
    // don't belong in suggestions. public_launch_options already excludes them —
    // "linked to ≥1 game" is one of the two conditions it enforces — and the
    // `!inner` join keeps that true independently of the view's definition. Both
    // are dynamic: an option becomes searchable again on its own the moment a
    // game is added with it. Embedded rows are capped at 1 (existence is all we
    // need).
    const { data: optData } = await supabase
      .from('public_launch_options')
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

    const exactSuggestions = [...gameSuggestions, ...optionSuggestions.slice(0, 6)];

    // Everything above is an ilike match — a substring the user actually typed,
    // so it is never a guess. Only when that finds nothing at all is it worth
    // guessing, and only then is a wrong guess cheaper than an empty dropdown:
    // an empty dropdown cannot tell "you misspelled it" from "we don't have it".
    //
    // The ordering is the whole design. Running fuzzy alongside the exact pass
    // is how these features become annoying — approximate matches crowd out the
    // literal one the user was typing toward. As a fallback it can only ever
    // appear in place of nothing.
    if (exactSuggestions.length === 0) {
      return await getFuzzyTitleSuggestions(query);
    }

    return exactSuggestions;
  } catch (error) {
    console.error('Error in getSearchSuggestions:', error);
    return [];
  }
}

/**
 * The typeahead's primary pass: names that literally match what was typed.
 *
 * Runs through the `game_suggestions` Postgres function rather than a PostgREST
 * `.or(...ilike...)`, for one reason — a title arm that ignores punctuation.
 * `ilike '%fear%'` cannot reach `F.E.A.R.`, and because it DOES reach three
 * other games the fuzzy fallback stays quiet and the title stays unfindable.
 * Matching the punctuation-stripped title, anchored to its start, reaches it
 * without dragging in the word-boundary junk that an unanchored match brings
 * ('art' finding 'War Thunder'). Measured before it was written; the reasoning
 * and the numbers are in docs/schema-snapshot.sql beside the function.
 *
 * A second benefit of moving it into SQL: the RPC takes the raw query as a
 * bound parameter, so it needs none of the or-filter sanitising the fallback
 * still does. `.or()` parses its argument as a filter expression; an RPC
 * argument is just a value.
 *
 * FALLS BACK RATHER THAN FAILING
 *
 * Same contract as the fuzzy tier: the function is a hand-applied migration, so
 * until it exists PostgREST answers PGRST202 and this drops to the exact
 * PostgREST query it replaced. The typeahead then behaves as it did before —
 * F.E.A.R. is unreachable again, and nothing else changes. That is what makes
 * the deploy safe to land before the migration.
 *
 * @param {string} query - Raw search text, as typed
 * @param {string} safe - The same text, sanitised for or-filter grammar
 * @param {number} limit
 * @returns {Promise<Array<{value: string, kind: string}>>}
 */
async function fetchSuggestionRows(query, safe, limit) {
  const { data, error } = await supabase.rpc('game_suggestions', {
    q: query,
    // Over-fetch: the caller folds case, punctuation and padding together, so
    // some of these rows are about to collapse into each other.
    lim: limit * 3
  });

  if (!error) return data || [];

  if (error.code !== 'PGRST202') {
    console.error('Error fetching suggestions:', error);
    return [];
  }

  const { data: games, error: fallbackError } = await supabase
    .from('public_games')
    .select('title, developer, publisher')
    .or(`title.ilike.%${safe}%,developer.ilike.%${safe}%,publisher.ilike.%${safe}%`)
    .limit(limit * 3);

  if (fallbackError) {
    console.error('Error fetching suggestions:', fallbackError);
    return [];
  }

  // The or-filter returns a row if ANY of the three columns matched, so each
  // column has to be re-checked to know which one to offer.
  const needle = query.toLowerCase();
  const rows = [];
  for (const game of games || []) {
    for (const kind of ['title', 'developer', 'publisher']) {
      const value = game[kind];
      if (value && value.toLowerCase().includes(needle)) rows.push({ value, kind });
    }
  }
  return rows;
}

/**
 * Last-resort typeahead tier: titles that are close to what was typed, for when
 * nothing matches it literally.
 *
 * The matching itself is one Postgres function, `fuzzy_game_titles`, whose
 * definition lives in docs/schema-snapshot.sql. It ORs two arms together — a
 * trigram word similarity, which absorbs a typo in one word of a long title,
 * and an edit distance, which catches the transpositions trigrams are blind to.
 * Doing it in SQL rather than JS keeps the catalogue out of this process's
 * memory, which matters on a serverless function that pays a cold start for
 * every megabyte it wants resident.
 *
 * It used to carry a third arm, a punctuation-insensitive substring. That match
 * moved into `fetchSuggestionRows` above, where it belongs: `stalker` reaching
 * S.T.A.L.K.E.R. is not a guess about a typo, it is a match, and it should not
 * have depended on the literal search happening to fail first.
 *
 * NEVER THROWS, AND DEGRADES TO NOTHING
 *
 * The function is a migration that has to be applied to the database by hand.
 * Until it is — and on any deploy that reaches a database where it is not —
 * PostgREST answers PGRST202, and the honest response to that is the same as
 * the response to "no close matches": an empty list. The site then behaves
 * exactly as it did before this tier existed, rather than erroring on a
 * keystroke. That is also what makes the migration safe to apply after the
 * deploy rather than in lockstep with it.
 *
 * @param {string} query
 * @returns {Promise<SearchSuggestion[]>} Empty when nothing is close enough
 */
async function getFuzzyTitleSuggestions(query) {
  const { data, error } = await supabase.rpc('fuzzy_game_titles', {
    q: query,
    lim: FUZZY_SUGGESTION_LIMIT
  });

  if (error) {
    // PGRST202 is "no such function" — the expected state before the migration
    // is applied, and not worth logging as a failure on every keystroke.
    if (error.code !== 'PGRST202') {
      console.error('Error fetching fuzzy suggestions:', error);
    }
    return [];
  }

  return (data || []).map((row) => ({
    type: 'title',
    value: row.title,
    // The category doubles as the dropdown's group heading, so this string is
    // what tells the user these are guesses rather than matches.
    category: 'Did you mean…?',
    fuzzy: true
  }));
}

/**
 * Catalog totals for the /how-it-works figures line: how many games, how many
 * distinct options, and when the newest option landed.
 *
 * `lastUpdated` is the one that earns its place — it makes the "runs on demand,
 * arrives in batches" claim on that page checkable instead of a promise.
 *
 * Counts come from `public_launch_options`, not the `launch_options` table. The
 * view is the set the project is willing to stand behind; the raw table also
 * holds rows that are unlinked or unsourced, most of which no user can navigate
 * to. Publishing the table count would advertise a catalog larger than the one
 * you can actually search, on the very page that promises the opposite. The
 * figure is deliberately the conservative one.
 *
 * Note the rest of the service still reads the raw table (suggestions, facets,
 * game pages). Migrating those is a separate job with product implications —
 * this is only the published headline number.
 *
 * Never throws. The figures line is a nice-to-have on an otherwise static page,
 * so a database hiccup returns nulls and the caller omits the line rather than
 * failing the page.
 *
 * @returns {Promise<{games: number|null, options: number|null, lastUpdated: string|null}>}
 */
export async function getCatalogStats() {
  const now = Date.now();
  if (_statsCache.data && now < _statsCache.expiresAt) {
    return _statsCache.data;
  }

  const empty = { games: null, options: null, lastUpdated: null };

  try {
    const [games, options, newest] = await Promise.all([
      supabase.from('public_games').select('*', { count: 'exact', head: true }),
      supabase.from('public_launch_options').select('*', { count: 'exact', head: true }),
      supabase.from('public_launch_options')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const result = {
      games: games.error ? null : games.count,
      options: options.error ? null : options.count,
      lastUpdated: newest.error ? null : (newest.data?.created_at ?? null),
    };

    _statsCache.data = result;
    _statsCache.expiresAt = now + STATS_TTL_MS;
    return result;
  } catch (error) {
    console.error('Error in getCatalogStats:', error);
    return empty;
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
/**
 * Links that point at an option `public_launch_options` will not return, keyed
 * by game. Subtracting these turns "what the catalogue holds" into "what the
 * page can show" — see utils/optionCounts.js for why the column itself is fine.
 *
 * A left join with the embedded side constrained to null asks the database for
 * exactly the junction rows whose option the view drops — 55 rows today. The
 * alternative was to list every stored option id, list every published one and
 * diff them in JS, which meant reading the `launch_options` base table and
 * moving about a thousand ids to find fifty-five links. This touches only the
 * junction table and the view, so nothing here reads around the view at all.
 *
 * Fails soft. If this errors the map comes back empty, every count falls
 * through to `total_options_count`, and the site behaves exactly as it did
 * before this existed.
 *
 * @returns {Promise<Map<number, number>>}
 */
async function getPhantomOptionCounts() {
  const now = Date.now();
  if (_phantomCache.data && now < _phantomCache.expiresAt) return _phantomCache.data;

  try {
    const { data, error } = await supabase
      .from('game_launch_options')
      .select('game_app_id, public_launch_options!left(id)')
      .is('public_launch_options', null);

    if (error) {
      console.error('getPhantomOptionCounts:', error);
      return new Map();
    }

    const map = buildPhantomMap(data);
    _phantomCache.data = map;
    _phantomCache.expiresAt = now + PHANTOM_TTL_MS;
    return map;
  } catch (error) {
    console.error('Error in getPhantomOptionCounts:', error);
    return new Map();
  }
}

async function getPopularOptions(topN = 24) {
  try {
    // Each game_launch_options row is a unique (game, option) link, so the
    // number of junction rows per option == the number of games using it.
    //
    // PostgREST returns that count per row as an embedded resource, which makes
    // this a single ~170ms query over 421 published options. It used to page
    // through the junction table instead — all 16k rows in 17 sequential
    // round trips, ~2.4s — to compute a list of eight. Server-side GROUP BY is
    // not available (this instance rejects aggregate functions), but the
    // embedded count is a different feature and is allowed.
    //
    // Ordering happens here rather than in the query: `order` on a referenced
    // table's count is accepted and then quietly ignored, so relying on it
    // would return eight arbitrary options. 421 rows is nothing to sort.
    const { data, error } = await supabase
      .from('public_launch_options')
      .select('command, description, game_launch_options(count)');

    if (error) {
      console.error('Error fetching popular options:', error);
      return [];
    }

    // How many games there are, so "too broad" can be a proportion rather than
    // a magic number that rots as the catalogue grows.
    const { count: totalGames } = await supabase
      .from('public_games')
      .select('app_id', { count: 'exact', head: true });

    // Selection and ordering live in utils/optionRanking.js, which explains why
    // popularity is the wrong sort here and is unit-tested against the real
    // shape of this catalogue.
    return rankBrowsableOptions(
      (data || []).map((row) => ({
        command: row.command,
        description: row.description || '',
        count: row.game_launch_options?.[0]?.count ?? 0,
      })),
      totalGames,
      topN
    );
  } catch (error) {
    console.error('Error in getPopularOptions:', error);
    return [];
  }
}

/**
 * Get the launch-option attribute facets that drive the category and risk
 * filters (feedback #1). Reads public_launch_options (well under the 1000-row
 * cap) and aggregates in JS — reading the table instead would let a chip offer
 * a value only unpublished rows carry, which returns nothing when picked.
 * Counts are per-option (how many options
 * carry the value), used only to order the dropdowns — the filtered results are
 * games, so counts are not surfaced as game totals in the UI.
 *
 * @returns {Promise<{categories: Array<{value:string,count:number}>, riskLevels: Array<{value:string,count:number}>}>}
 */
async function getOptionAttributeFacets() {
  try {
    const { data, error } = await supabase
      .from('public_launch_options')
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
    // Counts cover every published game, matching the default view
    const data = await fetchAllRows((from, to) => {
      let query = supabase
        .from('public_games')
        .select(field);

      // Apply search filter if provided
      for (const term of toOrFilterTerms(searchQuery)) {
        query = query.or(`title.ilike.%${term}%,developer.ilike.%${term}%,publisher.ilike.%${term}%`);
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
      .from('public_games')
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
    // Covers every published game, paged past the 1000-row cap
    const data = await fetchAllRows((from, to) => {
      let query = supabase
        .from('public_games')
        .select('release_date');

      for (const term of toOrFilterTerms(searchQuery)) {
        query = query.or(`title.ilike.%${term}%,developer.ilike.%${term}%,publisher.ilike.%${term}%`);
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
    let totalQuery = supabase.from('public_games').select('*', { count: 'exact', head: true });
    totalQuery = applySearchFilters(totalQuery, baseFilters);

    let withOptionsQuery = supabase.from('public_games').select('*', { count: 'exact', head: true });
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
      .from('public_games')
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
    // Deliberately the table, not public_games: this is the only read that must
    // still see a hidden duplicate row. A link to app 100 (Condition Zero's
    // second App ID) should redirect to the canonical game, and it can't do that
    // if the lookup pretends the row doesn't exist. `duplicate_of` comes back
    // with the row and tells the caller where to send it.
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
    // Single query: join game_launch_options → public_launch_options via nested
    // select. The junction can only reach rows that exist, but it can still
    // reach an unsourced one — so the view is what keeps a game page from
    // showing an option the catalogue can't say where it found.
    // risk_level / categories / engine_compatibility come from the slop-scraper
    // metadata migration and drive the badge rendering on the frontend.
    const { data, error } = await supabase
      .from('game_launch_options')
      .select(`
        public_launch_options (
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
      .map(row => row.public_launch_options)
      .filter(Boolean)
      .sort((a, b) => (b.upvotes || 0) - (a.upvotes || 0))
      .map(option => ({
        id: option.id,
        option: option.command,
        command: option.command,
        description: option.description || 'No description available',
        source: option.source || 'Community',
        // 411 of 421 published rows carry a URL, and every published row with no
        // description carries one — so the "no description" fallback can always
        // render a link. null still means "no link", not "broken".
        source_url: option.source_url || null,
        upvotes: option.upvotes || 0,
        downvotes: option.downvotes || 0,
        verified: option.verified || false,
        risk_level: option.risk_level || null,
        categories: option.categories || [],
        engine_compatibility: option.engine_compatibility || [],
        created_at: option.created_at,
        // Freshness signals — populated on 390 of 421 published rows. null must
        // read as "not yet re-checked", not stale.
        last_verified_at: option.last_verified_at || null,
        verification_method: option.verification_method || null,
        // Per-option usage docs, from the curated flag dictionary only. Set on
        // 46 rows — but those cover 90% of game-option pairs, because the
        // documented flags are the ones attached to the most games. Rendered
        // only when set.
        usage_example: option.usage_example || null,
        effect: option.effect || null
      }));
  } catch (error) {
    console.error(`Error in fetchLaunchOptionsForGame(${gameId}):`, error.message);
    throw error;
  }
}

/**
 * Finds games worth linking to from a game page.
 *
 * Two signals, in priority order. Engine leads because it is the one that
 * predicts whether a launch option transfers at all — a Source 2 flag means
 * something on another Source 2 game and nothing on a Unity title. Developer is
 * the softer fallback: it groups games a reader plausibly also owns, without
 * implying their options are interchangeable.
 *
 * Only games carrying at least one option are eligible. A link to an empty page
 * wastes a reader's click and hands a crawler a dead end, which is the opposite
 * of why this exists.
 *
 * Reads `public_games`, so a duplicate App ID never surfaces as its own entry.
 *
 * @async
 * @function fetchRelatedGames
 * @param {Object} game - The game being rendered; needs app_id, and engine or developer
 * @param {number} [limit=8] - Maximum number of links to return
 * @returns {Promise<Array<Object>>} Related games, each with app_id, title,
 *   total_options_count, relation ('engine' | 'developer') and label
 */
export async function fetchRelatedGames(game, limit = 8) {
  if (!game?.app_id) return [];

  // "Unknown" is a placeholder the scraper writes, not a value worth grouping on.
  const engine = game.engine && game.engine !== 'Unknown' ? game.engine : null;
  const developer = game.developer && game.developer !== 'Unknown' ? game.developer : null;
  if (!engine && !developer) return [];

  // Over-fetch a little: dropping the current game and de-duplicating across the
  // two signals would otherwise leave a short list.
  const span = limit + 1;

  const matching = (column, value) =>
    supabase
      .from('public_games')
      .select('app_id, title, total_options_count')
      .eq(column, value)
      .neq('app_id', game.app_id)
      .gt('total_options_count', 0)
      // `app_id` breaks ties, the same way the featured tail query does. Without
      // it, games holding equal option counts come back in whatever order the
      // planner chose for that connection, and `.limit(span)` then cuts among
      // them arbitrarily — so two servers reading one database rendered
      // different related lists for the same game, and a cached page could
      // disagree with a fresh one. Which game wins a tie is arbitrary either
      // way; that it is decided the same way every time is the point.
      .order('total_options_count', { ascending: false })
      .order('app_id', { ascending: true })
      .limit(span);

  try {
    const [byEngine, byDeveloper] = await Promise.all([
      engine ? matching('engine', engine) : Promise.resolve({ data: [] }),
      developer ? matching('developer', developer) : Promise.resolve({ data: [] }),
    ]);

    if (byEngine.error) console.error('fetchRelatedGames (engine):', byEngine.error);
    if (byDeveloper.error) console.error('fetchRelatedGames (developer):', byDeveloper.error);

    // Ordering and the `> 0` filter above stay on total_options_count — they
    // are asking "where do we hold the most", which is what that column means.
    // Only the number printed on the card is corrected.
    const merged = mergeRelatedTiers([
      { rows: byEngine.data || [], relation: 'engine', label: engine },
      { rows: byDeveloper.data || [], relation: 'developer', label: developer },
    ], limit);
    return withDisplayCounts(merged, await getPhantomOptionCounts());
  } catch (error) {
    // A game page is worth serving without its related list. It is not worth
    // failing over one.
    console.error('Error in fetchRelatedGames:', error);
    return [];
  }
}
