import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import compression from 'compression';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import gamesRoutes from './routes/gamesRoutes.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';
import logRequests from './middlewares/logRequests.js';

/**
 * Express application for Vanilla Slops
 * Steam Launch Options API with full-stack serving capabilities
 */

// ES modules __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Trust proxy for Railway/reverse proxy setup
app.set('trust proxy', 1);

// Compression middleware
app.use(compression());

// Security headers with Helmet
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://*.supabase.co"],
      fontSrc: ["'self'", "https:", "data:"],
    },
  } : false, // Disable CSP in development
  crossOriginEmbedderPolicy: false
}));

// Rate limiting for API endpoints
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to API routes
app.use('/api', apiLimiter);

// CORS configuration
const setupCORS = () => {
  const allowedOrigins = [];
  
  // Production origins
  if (process.env.CORS_ORIGIN) {
    // Handle potential trailing slash
    const corsOrigin = process.env.CORS_ORIGIN.replace(/\/$/, '');
    allowedOrigins.push(corsOrigin);
    console.log(`✅ CORS: Added production origin ${corsOrigin}`);
  }
  
  if (process.env.DOMAIN_URL) {
    const domainUrl = process.env.DOMAIN_URL.replace(/\/$/, '');
    if (!allowedOrigins.includes(domainUrl)) {
      allowedOrigins.push(domainUrl);
      console.log(`✅ CORS: Added domain URL ${domainUrl}`);
    }
  }
  
  // Development origins
  if (process.env.NODE_ENV !== 'production') {
    allowedOrigins.push(
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:5173',
      'http://127.0.0.1:5173'
    );
    console.log('🔧 CORS: Added development origins');
  }
  
  return cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, Postman, etc.)
      if (!origin) {
        return callback(null, true);
      }
      
      // Check against allowed origins
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      
      // Production fallback: allow Railway domains if no specific origin set
      if (process.env.NODE_ENV === 'production' && 
          !process.env.CORS_ORIGIN && 
          origin.includes('.railway.app')) {
        console.log(`🐸 Bootstrap: Allowing Railway domain ${origin}`);
        return callback(null, true);
      }
      
      // Log blocked requests for debugging
      console.warn(`❌ CORS: Blocked origin ${origin}`);
      console.warn(`   Allowed origins: ${allowedOrigins.join(', ')}`);
      return callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'Cache-Control'
    ],
    credentials: true,
    optionsSuccessStatus: 200 // For legacy browser support
  });
};

app.use(setupCORS());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use(logRequests);

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  const clientBuildPath = path.join(__dirname, '../client/dist');
  
  // Serve static assets with caching headers
  app.use(express.static(clientBuildPath, {
    maxAge: '1y', // Cache static assets for 1 year
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
      // Don't cache HTML files
      if (path.extname(filePath) === '.html') {
        res.setHeader('Cache-Control', 'no-cache');
      }
    }
  }));
  
  console.log(`📁 Serving static files from: ${clientBuildPath}`);
}

// API Routes
app.use('/api/games', gamesRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  const healthInfo = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'Vanilla Slops - Steam Launch Options API',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime(),
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 100) / 100,
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024 * 100) / 100
    }
  };
  
  res.json(healthInfo);
});

// API status endpoint
app.get('/api/status', (req, res) => {
  res.json({
    api: 'Vanilla Slops API',
    status: 'operational',
    timestamp: new Date().toISOString(),
    endpoints: {
      games: '/api/games',
      suggestions: '/api/games/suggestions',
      facets: '/api/games/facets',
      health: '/health'
    }
  });
});

// Handle SPA routing (must be after API routes to work correctly)
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    // Don't serve index.html for API routes that don't exist
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ 
        error: 'API endpoint not found',
        path: req.path,
        availableEndpoints: ['/api/games', '/api/games/suggestions', '/api/games/facets']
      });
    }
    
    // Serve index.html for all other routes (SPA routing)
    const indexPath = path.join(__dirname, '../client/dist/index.html');
    res.sendFile(indexPath, (err) => {
      if (err) {
        console.error('Error serving index.html:', err);
        res.status(500).json({ error: 'Failed to serve application' });
      }
    });
  });
}

// Error handlers (must be last to function correctly)
app.use(notFoundHandler);
app.use(errorHandler);

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Log startup information
console.log('🐸 Vanilla Slops Server Configuration:');
console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`   Port: ${process.env.PORT || 8000}`);
console.log(`   CORS Origin: ${process.env.CORS_ORIGIN || 'not set'}`);
console.log(`   Domain URL: ${process.env.DOMAIN_URL || 'not set'}`);

export default app;