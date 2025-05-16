import { Router } from 'express';
import { z } from 'zod';
import { validateQuery } from '../middlewares/validateRequest.js';
import { getGames } from '../controllers/gamesController.js';

const router = Router();

const querySchema = z.object({
  sort: z.string().optional().default('name'),
  order: z.enum(['asc', 'desc']).optional().default('asc'),
  page: z.string().regex(/^\d+$/).optional().default('1'),
  limit: z.string().regex(/^\d+$/).optional().default('20'),
});

router.get('/', validateQuery(querySchema), getGames);

export default router;
