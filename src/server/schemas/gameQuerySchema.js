import { z } from 'zod';

/**
 * Query schema with Options-First strategy support
 * Adds hasOptions and showAll parameters for progressive disclosure
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
  
  // Options-First strategy parameters
  hasOptions: z.string()
    .optional()
    .default('true')
    .transform((val) => val === 'true' || val === true)
    .describe('Filter games with launch options (default: true for options-first strategy)'),
  
  showAll: z.string()
    .optional()
    .default('false')
    .transform((val) => val === 'true' || val === true)
    .describe('Show all games including those without options (overrides hasOptions)'),
  
  // Sorting
  sort: z.enum(['title', 'name', 'year', 'options', 'relevance', 'total_options_count', 'created_at'])
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
  // Validation: If explicitly filtering for no-options, must use showAll
  if (data.options === 'no-options' && !data.showAll) {
    return false;
  }
  return true;
}, {
  message: "When filtering for games without options (options='no-options'), showAll must be true",
  path: ['showAll']
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

/**
 * Helper function to validate and log query parameters
 * Useful for debugging the options-first strategy
 */
export function validateAndLogQuery(query, schema) {
  try {
    const result = schema.parse(query);
    
    // Log options-first strategy decisions
    if (result.hasOptions !== undefined || result.showAll !== undefined) {
      console.log('🍓 Options-First Query:', {
        hasOptions: result.hasOptions,
        showAll: result.showAll,
        strategy: result.showAll ? 'show-all' : (result.hasOptions ? 'options-only' : 'no-options-only')
      });
    }
    
    return { success: true, data: result };
  } catch (error) {
    console.error('❌ Query validation failed:', error.errors || error.message);
    return { success: false, error };
  }
}

/**
 * Preset query configurations for common use cases
 */
export const queryPresets = {
  // Default behavior (only games with launch options)
  optionsFirst: {
    hasOptions: 'true',
    showAll: 'false',
    sort: 'total_options_count',
    order: 'desc'
  },

  showAll: {
    hasOptions: 'true', // doesn't matter when showAll is true
    showAll: 'true',
    sort: 'title',
    order: 'asc'
  },
  
  // No Options: Games without launch options
  noOptions: {
    hasOptions: 'false',
    showAll: 'true', // required to see games without options
    sort: 'title',
    order: 'asc'
  },
  
  // Most Options: Games with the most launch options
  mostOptions: {
    hasOptions: 'true',
    showAll: 'false',
    sort: 'total_options_count',
    order: 'desc'
  }
};