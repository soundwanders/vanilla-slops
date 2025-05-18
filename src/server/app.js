import express from 'express';
import cors from 'cors';
import gamesRoutes from './routes/gamesRoutes.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';
import logRequests from './middlewares/logRequests.js';

const allowedOrigins = process.env.CORS_ORIGIN?.split(',') || [];

const app = express();

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET'],
}));

app.use(express.json());
app.use(logRequests);

app.use('/api/games', gamesRoutes);

// Error handlers
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
