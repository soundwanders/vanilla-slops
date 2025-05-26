import { z } from 'zod';

export const querySchema = z.object({
  search: z.string().optional(),
  genre: z.string().optional(),
  engine: z.string().optional(),
  platform: z.string().optional(),
  developer: z.string().optional(),
  category: z.string().optional(),
  options: z.enum(['has-options', 'no-options', 'performance', 'graphics']).optional(),
  year: z.string().optional(),
  sort: z.enum(['title', 'name', 'year', 'options', 'relevance']).optional().default('title'),
  order: z.enum(['asc', 'desc']).optional().default('asc'),

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
});

export const suggestionQuerySchema = z.object({
  q: z.string()
    .min(2, { message: 'Query must be at least 2 characters long' })
    .max(100, { message: 'Query must be less than 100 characters' })
});

export const gameIdSchema = z.object({
  id: z.string()
    .regex(/^\d+$/, { message: 'Game ID must be a positive integer' })
    .transform(Number)
});