/**
 * CORS Configuration for Steam Launch Options API
 * Handles cross-origin requests between frontend (port 3000) and backend (port 8000)
*/

const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',')
  : [
    'https://vanilla-slops.up.railway.app', // Production frontend URL
    'http://localhost:3000',  // Vite dev server
    'http://127.0.0.1:3000',  // Alternative localhost
    'http://localhost:5173',  // Vite default port (fallback)
    'http://127.0.0.1:5173',  // Alternative localhost for Vite
  ];

const corsConfig = {
  origin: corsOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'Cache-Control',
    'X-Requested-With',
    'Access-Control-Allow-Origin'
  ],
  
  // Allow credentials (cookies, auth headers)
  credentials: true,
  
  // Cache preflight requests for 24 hours
  maxAge: 86400,
  
  // Handle preflight requests
  preflightContinue: false,
  optionsSuccessStatus: 204
};

// Development mode - allow all origins
if (process.env.NODE_ENV === 'development') {
  corsConfig.origin = true; // Allow all origins in development
  console.log('🔓 CORS: Development mode - allowing all origins');
}

// Production mode - strict origin checking
if (process.env.NODE_ENV === 'production') {
  corsConfig.origin = [
    process.env.FRONTEND_URL || 'https://localhost:3000', // Default to localhost if not set
    'https://vanilla-slops-place.holder.com', // Replace with production frontend URL
  ];
  console.log('🔒 CORS: Production mode - restricted origins');
}

export default corsConfig;