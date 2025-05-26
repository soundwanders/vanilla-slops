import { z } from 'zod';

export const querySchema = z.object({
  search: z.string().optional().default(''),
  genre: z.string().optional().default(''),
  engine: z.string().optional().default(''),
  platform: z.string().optional().default(''),
  sort: z.enum(['asc', 'desc']).optional().default('asc'),

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