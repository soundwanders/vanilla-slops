import { z } from 'zod';

/**
 * Games query schema.
 * All games are returned by default; `options` is the explicit opt-in filter for
 * narrowing by launch-option count. Unknown query params (e.g. the retired
 * showAll/hasOptions) are stripped by Zod rather than rejected, so old
 * bookmarked URLs still work.
 */
export const querySchema = z.object({
  search: z.string().optional(),
  genre: z.string().optional(),
  engine: z.string().optional(),
  platform: z.string().optional(),
  developer: z.string().optional(),
  category: z.string().optional(),
  options: z.enum(['has-options', 'no-options', 'performance', 'graphics', 'many-options', 'few-options']).optional(),
  year: z.string().optional(),

  // Sorting
  sort: z.enum(['title', 'name', 'year', 'options', 'relevance', 'total_options_count', 'created_at', 'developer', 'release_date'])
    .optional()
    .default('total_options_count')
    .describe('Sort field (default: total_options_count for options-first)'),
    
  order: z.enum(['asc', 'desc'])
    .optional()
    .default('desc')
    .describe('Sort order (default: desc to show games with most options first)'),

  page: z.string()
    .regex(/^\d+$/, { message: 'Page must be a positive integer string' })
    .optional()
    .default('1')
    .transform(Number),

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
  search: z.string().optional(),
  genre: z.string().optional(),
  engine: z.string().optional(),
  platform: z.string().optional(),
  developer: z.string().optional(),
  category: z.string().optional(),
  year: z.string().optional(),
});

/**
 * Facets query schema
 */
export const facetsQuerySchema = z.object({
  search: z.string().optional(),
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

