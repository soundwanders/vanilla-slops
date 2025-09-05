import { createSecureConfig } from './secureConfig.js';

// Load and validate configuration securely
const config = createSecureConfig();

export default {
  port: config.PORT,
  supabaseUrl: config.SUPABASE_URL,
  supabaseKey: config.SUPABASE_SERVICE_ROLE_KEY,
  nodeEnv: config.NODE_ENV,
  corsOrigin: config.CORS_ORIGIN,
  domainUrl: config.DOMAIN_URL,
  
  // Utility methods
  isProduction: () => config.NODE_ENV === 'production',
  isDevelopment: () => config.NODE_ENV === 'development',
  isTest: () => config.NODE_ENV === 'test'
};