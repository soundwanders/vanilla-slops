import { Router } from 'express';
import { validateRequest } from '../middlewares/validateRequest.js';
import { gamesController } from '../controllers/gamesController.js';
import { querySchema } from '../schemas/gameQuerySchema.js';

const router = Router();
router.get('/', validateRequest(querySchema), gamesController);

export default router;
