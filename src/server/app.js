import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import gamesRoutes from './routes/gamesRoutes.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';
import logRequests from './middlewares/logRequests.js';

/**
 * Express application setup for Steam Launch Options API
 * Configures middleware, routes, and error handling
 */
// Create __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url); 
const __dirname = path.dirname(__filename); 

const app = express();

// CORS configuration
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    
    // Development origins
    const devOrigins = ['http://localhost:3000', 'http://localhost:5173'];
    
    if (process.env.NODE_ENV === 'production') {
      // If DOMAIN_NAME is set, use it
      if (process.env.DOMAIN_NAME && origin === process.env.DOMAIN_NAME) {
        return callback(null, true);
      }
      
      // Bootstrap: Allow any railway.app domain if DOMAIN_NAME not set
      if (!process.env.DOMAIN_NAME && origin.endsWith('.railway.app')) {
        console.log(`🚀 Bootstrap: Allowing Railway domain ${origin}`);
        return callback(null, true);
      }
    } else {
      // Development: allow dev origins
      if (devOrigins.includes(origin)) {
        return callback(null, true);
      }
    }
    
    console.warn(`❌ CORS: Blocked origin ${origin}`);
    return callback(new Error('Not allowed by CORS'));
  },
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