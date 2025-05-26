import { Router } from 'express';
import { validateRequest } from '../middlewares/validateRequest.js';
import { gamesController, gameDetailsController, gameLaunchOptionsController } from '../controllers/gamesController.js';
import { querySchema } from '../schemas/gameQuerySchema.js';

const router = Router();

// Get all games with pagination and filtering
router.get('/', validateRequest(querySchema), gamesController);

// Get a specific game with its launch options
router.get('/:id', gameDetailsController);

// Get just the launch options for a specific game
router.get('/:id/launch-options', gameLaunchOptionsController);

export default router;