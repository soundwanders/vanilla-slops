/**
 * @fileoverview Secure Environment Configuration System
 * 
 * SECURITY PRINCIPLES:
 * - Never log actual environment variable values
 * - Validate configuration without exposing secrets
 * - Provide helpful debugging without security risks
 * - Fail fast with clear error messages
 * 
 * @module SecureConfig
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Environment variable schema definition
 * Defines what variables are required and their validation rules
 */
const ENV_SCHEMA = {
  SUPABASE_URL: {
    required: true,
    type: 'url',
    description: 'Supabase project URL',
    example: 'https://your-project.supabase.co',
    validate: (value) => {
      if (!value.includes('supabase.co')) {
        throw new Error('SUPABASE_URL must be a valid Supabase URL');
      }
      return true;
    }
  },
  
  SUPABASE_SERVICE_ROLE_KEY: {
    required: true,
    type: 'secret',
    description: 'Supabase service role key',
    example: 'eyJhbGciOiJIUzI1Ni...',
    validate: (value) => {
      if (!value.startsWith('eyJ')) {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY appears to be invalid (should start with eyJ)');
      }
      if (value.length < 100) {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY appears too short to be valid');
      }
      return true;
    }
  },
  
  // Server Configuration
  PORT: {
    required: false,
    type: 'number',
    default: 8000,
    description: 'Server port number',
    validate: (value) => {
      const port = parseInt(value);
      if (port < 1 || port > 65535) {
        throw new Error('PORT must be between 1 and 65535');
      }
      return true;
    }
  },
  
  NODE_ENV: {
    required: false,
    type: 'enum',
    default: 'development',
    options: ['development', 'production', 'test'],
    description: 'Node.js environment',
    validate: (value) => {
      if (!['development', 'production', 'test'].includes(value)) {
        throw new Error('NODE_ENV must be development, production, or test');
      }
      return true;
    }
  },
  
  // CORS Configuration  
  CORS_ORIGIN: {
    required: false,
    type: 'string',
    description: 'Comma-separated list of allowed CORS origins',
    example: 'http://localhost:3000,https://yourdomain.com'
  },
  
  // Domain Configuration
  DOMAIN_URL: {
    required: false,
    type: 'url',
    description: 'Primary domain URL for the application',
    example: 'https://vanilla-slops.yourdomain.com'
  }
};

/**
 * Secure Configuration Manager
 * Handles environment variable loading and validation without exposure risks
 */
class SecureConfig {
  constructor() {
    this.config = {};
    this.isProduction = process.env.NODE_ENV === 'production';
    this.validationErrors = [];
    this.loadedSuccessfully = false;
  }

  /**
   * Load and validate environment configuration
   * @param {string} [envPath] - Custom path to .env file
   * @returns {Object} Validated configuration object
   */
  load(envPath = null) {
    try {
      // Determine .env file path
      const dotenvPath = envPath || path.resolve(__dirname, '../../.env');
      
      // Load .env file
      const loadResult = dotenv.config({ path: dotenvPath });
      
      if (loadResult.error) {
        this._handleDotenvError(loadResult.error, dotenvPath);
      }
      
      // Validate and process configuration
      this._validateConfiguration();
      
      if (this.validationErrors.length > 0) {
        this._handleValidationErrors();
      }
      
      this.loadedSuccessfully = true;
      this._logSuccessfulLoad();
      
      return this.config;
      
    } catch (error) {
      this._handleCriticalError(error);
    }
  }

  /**
   * Get configuration value safely
   * @param {string} key - Configuration key
   * @returns {*} Configuration value
   */
  get(key) {
    if (!this.loadedSuccessfully) {
      throw new Error('Configuration not loaded. Call load() first.');
    }
    return this.config[key];
  }

  /**
   * Get all configuration (without secrets)
   * @returns {Object} Safe configuration object
   */
  getSafeConfig() {
    const safeConfig = {};
    
    Object.entries(this.config).forEach(([key, value]) => {
      const schema = ENV_SCHEMA[key];
      if (schema && schema.type === 'secret') {
        safeConfig[key] = '[REDACTED]';
      } else {
        safeConfig[key] = value;
      }
    });
    
    return safeConfig;
  }

  /**
   * Validate that all required environment variables are present and valid
   * @private
   */
  _validateConfiguration() {
    Object.entries(ENV_SCHEMA).forEach(([key, schema]) => {
      try {
        const rawValue = process.env[key];
        
        // Check if required variable is missing
        if (schema.required && !rawValue) {
          this.validationErrors.push({
            key,
            error: 'MISSING_REQUIRED',
            message: `Missing required environment variable: ${key}`,
            suggestion: this._getSuggestion(key, schema)
          });
          return;
        }
        
        // Use default value if not provided
        const value = rawValue || schema.default;
        if (!value && !schema.required) {
          return; // Skip optional variables that aren't set
        }
        
        // Type validation
        const processedValue = this._processValue(value, schema.type);
        
        // Custom validation
        if (schema.validate) {
          schema.validate(processedValue);
        }
        
        // Store validated value
        this.config[key] = processedValue;
        
      } catch (error) {
        this.validationErrors.push({
          key,
          error: 'VALIDATION_FAILED',
          message: `Invalid ${key}: ${error.message}`,
          suggestion: this._getSuggestion(key, schema)
        });
      }
    });
  }

  /**
   * Process value according to its type
   * @private
   */
  _processValue(value, type) {
    switch (type) {
      case 'number':
        const num = parseInt(value);
        if (isNaN(num)) {
          throw new Error('must be a valid number');
        }
        return num;
      
      case 'boolean':
        return value.toLowerCase() === 'true';
      
      case 'url':
        try {
          new URL(value);
          return value;
        } catch {
          throw new Error('must be a valid URL');
        }
      
      case 'secret':
      case 'string':
      case 'enum':
      default:
        return value;
    }
  }

  /**
   * Generate helpful suggestion for configuration errors
   * @private
   */
  _getSuggestion(key, schema) {
    let suggestion = `Add ${key} to your .env file`;
    
    if (schema.example) {
      suggestion += `\nExample: ${key}=${schema.example}`;
    }
    
    if (schema.description) {
      suggestion += `\nDescription: ${schema.description}`;
    }
    
    if (schema.options) {
      suggestion += `\nAllowed values: ${schema.options.join(', ')}`;
    }
    
    return suggestion;
  }

  /**
   * Handle .env file loading errors
   * @private
   */
  _handleDotenvError(error, dotenvPath) {
    console.error('❌ Environment Configuration Error:');
    console.error(`Failed to load .env file from: ${dotenvPath}`);
    
    // Check if file exists
    if (!fs.existsSync(dotenvPath)) {
      console.error('\n💡 Solution:');
      console.error('1. Create a .env file in your project root');
      console.error('2. Copy .env.example to .env if available');
      console.error('3. Add your environment variables');
      
      // Show required variables without exposing values
      console.error('\n📋 Required Variables:');
      Object.entries(ENV_SCHEMA).forEach(([key, schema]) => {
        if (schema.required) {
          console.error(`   ${key}=${schema.example || '[your_value_here]'}`);
        }
      });
    }
    
    throw error;
  }

  /**
   * Handle validation errors
   * @private
   */
  _handleValidationErrors() {
    console.error('❌ Environment Configuration Validation Failed:');
    console.error(`Found ${this.validationErrors.length} configuration error(s)\n`);
    
    this.validationErrors.forEach((error, index) => {
      console.error(`${index + 1}. ${error.message}`);
      if (error.suggestion) {
        console.error(`   💡 ${error.suggestion}\n`);
      }
    });
    
    console.error('🔧 Fix these issues and restart the application.\n');
    
    // In production, fail fast
    if (this.isProduction) {
      throw new Error(`Configuration validation failed with ${this.validationErrors.length} errors`);
    }
    
    throw new Error('Environment configuration validation failed');
  }

  /**
   * Handle critical configuration errors
   * @private
   */
  _handleCriticalError(error) {
    console.error('💥 Critical Configuration Error:');
    console.error(error.message);
    
    if (!this.isProduction) {
      console.error('\n🔍 Debug Information:');
      console.error('- Check that your .env file exists and is readable');
      console.error('- Verify all required environment variables are set');
      console.error('- Ensure no syntax errors in .env file');
    }
    
    throw error;
  }

  /**
   * Log successful configuration load
   * @private
   */
  _logSuccessfulLoad() {
    if (this.isProduction) {
      console.log('✅ Configuration loaded successfully');
      return;
    }
    
    // Development mode: show safe configuration summary
    console.log('✅ Environment Configuration Loaded Successfully');
    console.log('📊 Configuration Summary:');
    
    Object.entries(this.config).forEach(([key, value]) => {
      const schema = ENV_SCHEMA[key];
      if (schema && schema.type === 'secret') {
        console.log(`   ${key}: [CONFIGURED]`);
      } else {
        console.log(`   ${key}: ${value}`);
      }
    });
    
    // Show optional variables that could be configured
    const unconfiguredOptional = Object.entries(ENV_SCHEMA)
      .filter(([key, schema]) => !schema.required && !this.config[key])
      .map(([key]) => key);
    
    if (unconfiguredOptional.length > 0) {
      console.log(`\n📝 Optional variables not configured: ${unconfiguredOptional.join(', ')}`);
    }
    
    console.log(''); // Empty line for readability
  }
}

/**
 * Create and configure the secure config instance
 * @param {string} [envPath] - Custom path to .env file
 * @returns {Object} Validated configuration
 */
export function createSecureConfig(envPath = null) {
  const config = new SecureConfig();
  return config.load(envPath);
}

/**
 * Default configuration export for immediate use
 */
const defaultConfig = createSecureConfig();

export default {
  port: defaultConfig.PORT,
  supabaseUrl: defaultConfig.SUPABASE_URL,
  supabaseKey: defaultConfig.SUPABASE_SERVICE_ROLE_KEY,
  nodeEnv: defaultConfig.NODE_ENV,
  corsOrigin: defaultConfig.CORS_ORIGIN,
  domainUrl: defaultConfig.DOMAIN_URL,
  
  // Utility methods
  isProduction: () => defaultConfig.NODE_ENV === 'production',
  isDevelopment: () => defaultConfig.NODE_ENV === 'development',
  isTest: () => defaultConfig.NODE_ENV === 'test'
};