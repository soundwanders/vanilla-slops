import { Router } from 'express';
import { validateRequest } from '../middlewares/validateRequest.js';
import { 
  gamesController, 
  searchSuggestionsController, 
  filterFacetsController,
  gameDetailsController,
  gameLaunchOptionsController 
} from '../controllers/gamesController.js';
import { querySchema, suggestionQuerySchema } from '../schemas/gameQuerySchema.js';

const router = Router();

// Get all games with enhanced filtering and search
router.get('/', validateRequest(querySchema), gamesController);

// Get search suggestions for autocomplete
router.get('/suggestions', validateRequest(suggestionQuerySchema), searchSuggestionsController);

// Get available filter facets
router.get('/facets', filterFacetsController);

// Get a specific game with its launch options
router.get('/:id', gameDetailsController);

// Get just the launch options for a specific game
router.get('/:id/launch-options', gameLaunchOptionsController);

export default router;