import { Router } from 'express';
import gamesRoutes from './routes/gamesRoutes.js';

const router = Router();

router.use('/games', gamesRoutes);
router.get('/health', (req, res) => res.send('OK ✅'));

export default router;
