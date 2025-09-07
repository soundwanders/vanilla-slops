import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import setupCORS from './middlewares/cors.js';
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
  } : {
    // DEVELOPMENT: More permissive CSP to avoid blocking issues
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      scriptSrcAttr: ["'self'", "'unsafe-inline'"], // Allow inline event handlers
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://*.supabase.co"],
      fontSrc: ["'self'", "https:", "data:"],
    },
  },
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

// CORS setup initialization
app.use(setupCORS());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use(logRequests);

// FIXED: Serve static files in BOTH development and production
const clientBuildPath = path.join(__dirname, '../client/dist');

// Check if built files exist
import fs from 'fs';
if (fs.existsSync(clientBuildPath)) {
  // Serve static assets with appropriate caching
  app.use(express.static(clientBuildPath, {
    maxAge: process.env.NODE_ENV === 'production' ? '1y' : '0', // No cache in dev
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
      // Set correct MIME types for JavaScript modules
      if (path.extname(filePath) === '.js') {
        res.setHeader('Content-Type', 'application/javascript');
      }
      
      // Don't cache HTML files
      if (path.extname(filePath) === '.html') {
        res.setHeader('Cache-Control', 'no-cache');
      }
    }
  }));
  
  console.log(`📁 Serving static files from: ${clientBuildPath}`);
} else {
  console.warn(`⚠️  Client build directory not found: ${clientBuildPath}`);
  console.warn(`   Run 'npm run build' in the client directory first`);
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
    staticFiles: fs.existsSync(clientBuildPath) ? 'available' : 'missing',
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

// Handle SPA routing (must be after static file serving and API routes)
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
  const indexPath = path.join(clientBuildPath, 'index.html');
  
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath, (err) => {
      if (err) {
        console.error('Error serving index.html:', err);
        res.status(500).json({ error: 'Failed to serve application' });
      }
    });
  } else {
    res.status(500).json({ 
      error: 'Application not built',
      message: 'Run "npm run build" in the client directory first'
    });
  }
});

// Error handlers (must be last)
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