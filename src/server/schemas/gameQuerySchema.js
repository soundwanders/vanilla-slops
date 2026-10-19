import { z } from 'zod';

/**
 * Free-text filter values are bounded so a request cannot carry kilobytes of
 * filter into a PostgREST URL. 200 sits well above the longest real value
 * (a 137-character developer credit, measured 2026-10-19); anything longer is
 * not a filter a person typed or picked.
 */
const filterText = z.string().max(200).optional();

/**
 * Games query schema.
 * All games are returned by default; `options` is the explicit opt-in filter for
 * narrowing by launch-option count. Unknown query params (e.g. the retired
 * showAll/hasOptions) are stripped by Zod rather than rejected, so old
 * bookmarked URLs still work.
 */
export const querySchema = z.object({
  search: filterText,
  genre: filterText,
  engine: filterText,
  platform: filterText,
  developer: filterText,
  // `category` filters by a launch-option category (Display, Performance, …);
  // it filters games that have at least one option in that category.
  category: filterText,
  // `risk` filters games that have at least one option at this risk level.
  // Stale/unknown values degrade to "no risk filter" rather than 400ing.
  risk: z.enum(['safe', 'caution', 'experimental'])
    .optional()
    .catch(undefined),
  // `optionSearch` filters games that have a launch option whose command
  // matches (e.g. "-novid"). Powers "search by the actual launch option".
  optionSearch: z.string().max(100).optional(),
  // Retired values (performance/graphics) and any stale value degrade to
  // "no options filter" via .catch() rather than 400ing old bookmarked URLs.
  options: z.enum(['has-options', 'no-options', 'many-options', 'few-options'])
    .optional()
    .catch(undefined),
  year: filterText,

  // Sorting
  sort: z.enum(['featured', 'title', 'name', 'year', 'options', 'relevance', 'total_options_count', 'created_at', 'developer', 'release_date'])
    .optional()
    .default('featured')
    .describe('Sort field (default: featured — curated lineup first, then by option count)'),
    
  order: z.enum(['asc', 'desc'])
    .optional()
    .default('desc')
    .describe('Sort order (default: desc to show games with most options first)'),

  // Clamped like `limit`. A 20-digit page used to reach PostgREST as an
  // exponent-formatted offset and come back as a 500. Past-the-end pages that
  // fit under the clamp are handled in fetchGames.
  page: z.string()
    .regex(/^\d+$/, { message: 'Page must be a positive integer string' })
    .optional()
    .default('1')
    .transform((val) => Math.min(Math.max(Number(val), 1), 100000)),

  limit: z.string()
    .regex(/^\d+$/, { message: 'Limit must be a positive integer string' })
    .optional()
    .default('20')
    .transform((val) => {
      const num = Number(val);
      return Math.min(Math.max(num, 1), 100);
    }),
    
  // Additional parameters for advanced filtering
  minOptionsCount: z.string()
    .regex(/^\d+$/, { message: 'Minimum options count must be a positive integer' })
    .optional()
    .transform((val) => val ? Number(val) : undefined),
    
  maxOptionsCount: z.string()
    .regex(/^\d+$/, { message: 'Maximum options count must be a positive integer' })
    .optional()
    .transform((val) => val ? Number(val) : undefined),
}).refine((data) => {
  // Validation: minOptionsCount should be less than maxOptionsCount
  if (data.minOptionsCount !== undefined && data.maxOptionsCount !== undefined) {
    return data.minOptionsCount <= data.maxOptionsCount;
  }
  return true;
}, {
  message: "minOptionsCount must be less than or equal to maxOptionsCount",
  path: ['maxOptionsCount']
});

/**
 * Suggestion query schema with options prioritization
 */
export const suggestionQuerySchema = z.object({
  q: z.string()
    .min(2, { message: 'Query must be at least 2 characters long' })
    .max(100, { message: 'Query must be less than 100 characters' }),
    
  limit: z.string()
    .regex(/^\d+$/, { message: 'Limit must be a positive integer' })
    .optional()
    .default('10')
    .transform((val) => Math.min(Number(val), 20)), // Max 20 suggestions
    
  // Option to prioritize games with launch options in suggestions
  prioritizeOptions: z.string()
    .optional()
    .default('true')
    .transform((val) => val === 'true' || val === true)
    .describe('Prioritize games with launch options in suggestions (default: true)')
});

/**
 * Schema for the statistics endpoint
 */
export const statisticsQuerySchema = z.object({
  search: filterText,
  genre: filterText,
  engine: filterText,
  platform: filterText,
  developer: filterText,
  category: filterText,
  year: filterText,
});

/**
 * Facets query schema
 */
export const facetsQuerySchema = z.object({
  // No `search`. Scoping facets to a search skipped the facets cache and cost
  // about a dozen database reads per distinct term, and no client ever sent
  // one, so it was capacity offered only to whoever wanted to spend it. Zod
  // strips it now, and every request is answered from the one cached set.
  includeStats: z.string()
    .optional()
    .default('true')
    .transform((val) => val === 'true' || val === true)
    .describe('Include options statistics in facets response (default: true)')
});

/**
 * Game ID schema (unchanged)
 */
export const gameIdSchema = z.object({
  id: z.string()
    .regex(/^\d+$/, { message: 'Game ID must be a positive integer' })
    .transform(Number)
});

