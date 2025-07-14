import express from 'express';
import cors from 'cors';
import gamesRoutes from './routes/gamesRoutes.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';
import logRequests from './middlewares/logRequests.js';

/**
 * Express application setup for Steam Launch Options API
 * Configures middleware, routes, and error handling
 */

const app = express();

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? [process.env.FRONTEND_URL] 
    : ['http://localhost:3000', 'http://localhost:5173'],
  credentials: true
}));

// Middleware setup
app.use(express.json());
app.use(logRequests);

// Serve static files from the client build
if (process.env.NODE_ENV === 'production') {
  const clientBuildPath = path.join(__dirname, '../client/dist');
  app.use(express.static(clientBuildPath));
  
  // Handle SPA routing
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ error: 'API route not found' });
    }
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}

// API routes
app.use('/api/games', gamesRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'Steam Launch Options API'
  });
});

// Error handlers (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

export default app;