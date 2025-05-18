import { z } from 'zod';

export const querySchema = z.object({
  search: z.string().optional(),
  genre: z.string().optional(),
  engine: z.string().optional(),
  platform: z.string().optional(),
  sort: z.string().default('title'),
  order: z.enum(['asc', 'desc']).default('asc'),
  page: z.string().default('1').transform(Number),
  limit: z.string().default('20')
    .transform(val => Math.min(Math.max(parseInt(val), 1), 100)),
});
