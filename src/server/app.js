import express from 'express';
import cors from 'cors';
import gamesRoutes from './routes/gamesRoutes.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';
import logRequests from './middlewares/logRequests.js';

/**
 * Express application setup for Steam Launch Options API
 * Configures middleware, routes, and error handling
 */

const allowedOrigins = process.env.CORS_ORIGIN?.split(',') || [
  'http://localhost:3000', // Frontend dev server
  'http://127.0.0.1:3000', // Alternative localhost
  'http://localhost:5173', // Vite default port
  'http://127.0.0.1:5173'  // Alternative Vite port
];

const app = express();

// CORS configuration - Allow frontend to access API
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    // In development, be more permissive
    if (process.env.NODE_ENV === 'development') {
      console.log(`🌐 CORS: Allowing origin ${origin} in development mode`);
      return callback(null, true);
    }
    
    console.warn(`❌ CORS: Blocked origin ${origin}`);
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  optionsSuccessStatus: 200 // For legacy browser support
}));

// Middleware setup
app.use(express.json());
app.use(logRequests);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'Steam Launch Options API'
  });
});

// API routes
app.use('/api/games', gamesRoutes);

// Test endpoint for debugging
app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'API is working!',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development'
  });
});

// Error handlers (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

export default app;