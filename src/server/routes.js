import { Router } from 'express';
import { gamesController, gameDetailsController, gameLaunchOptionsController } from '../controllers/gameController.js';

const router = Router();

// Get all games with pagination and filtering
router.get('/games', gamesController);

// Get a specific game with its launch options
router.get('/games/:id', gameDetailsController);

// Get just the launch options for a specific game
router.get('/games/:id/launch-options', gameLaunchOptionsController);

export default router;