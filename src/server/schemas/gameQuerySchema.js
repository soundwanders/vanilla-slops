const querySchema = z.object({
  sort: z.string().optional().default('name'),
  order: z.enum(['asc', 'desc']).optional().default('asc'),
  page: z.string().regex(/^\d+$/).optional().default('1'),
  limit: z.string().regex(/^\d+$/).optional().default('20')
    .transform((val) => Math.min(Math.max(parseInt(val), 1), 100)) // Clamp between 1–100
});
