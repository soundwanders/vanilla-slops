import cors from 'cors';

// CORS configuration
const setupCORS = () => {
  const allowedOrigins = [];
  
  // Production origins
  if (process.env.CORS_ORIGIN) {
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
  
  // Development origins - always add these in development
  if (process.env.NODE_ENV !== 'production') {
    allowedOrigins.push(
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:8000',  // Add your Express server
      'http://127.0.0.1:8000'
    );
    console.log('🔧 CORS: Added development origins');
  }
  
  return cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (same-origin, mobile apps, curl, Postman, etc.)
      if (!origin) {
        return callback(null, true);
      }
      
      // In development, be more permissive
      if (process.env.NODE_ENV !== 'production') {
        return callback(null, true);
      }
      
      // Production: strict checking
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
    optionsSuccessStatus: 200
  });
};

export default setupCORS;