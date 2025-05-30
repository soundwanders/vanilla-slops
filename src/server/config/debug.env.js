import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Resolve root dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Calculate the path to .env file
const envPath = path.resolve(__dirname, '../../.env');

// Debug information
console.log('🔍 Environment Debugging:');
console.log('Current file:', __filename);
console.log('Current directory:', __dirname);
console.log('Looking for .env at:', envPath);
console.log('Does .env file exist?', fs.existsSync(envPath));

// Try to read the .env file content (safely)
if (fs.existsSync(envPath)) {
  try {
    const envContent = fs.readFileSync(envPath, 'utf8');
    console.log('📄 .env file content preview:');
    // Show first few lines without exposing sensitive data
    const lines = envContent.split('\n').slice(0, 5);
    lines.forEach((line, index) => {
      if (line.trim() && !line.startsWith('#')) {
        const [key] = line.split('=');
        console.log(`Line ${index + 1}: ${key}=***`);
      } else {
        console.log(`Line ${index + 1}: ${line}`);
      }
    });
  } catch (error) {
    console.log('❌ Error reading .env file:', error.message);
  }
} else {
  console.log('❌ .env file not found!');
  console.log('📁 Files in project root:');
  try {
    const rootPath = path.resolve(__dirname, '../..');
    const files = fs.readdirSync(rootPath);
    console.log(files.filter(f => f.startsWith('.') || f.includes('env')));
  } catch (error) {
    console.log('Error reading directory:', error.message);
  }
}

// Load .env from the project root
const result = dotenv.config({ path: envPath });

if (result.error) {
  console.log('❌ dotenv.config() error:', result.error.message);
} else {
  console.log('✅ dotenv.config() loaded successfully');
  console.log('🔑 Available environment variables:');
  Object.keys(process.env)
    .filter(key => key.includes('SUPABASE') || key.includes('DATABASE'))
    .forEach(key => {
      console.log(`${key}=${process.env[key] ? '***SET***' : 'undefined'}`);
    });
}

const requiredVars = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];

console.log('\n🧪 Testing required variables:');
requiredVars.forEach((key) => {
  const value = process.env[key];
  console.log(`${key}: ${value ? '✅ SET' : '❌ MISSING'}`);
  
  if (!value) {
    console.log(`❌ Missing required environment variable: ${key}`);
    console.log('💡 Expected format:');
    if (key === 'SUPABASE_URL') {
      console.log('   SUPABASE_URL=https://your-project.supabase.co');
    } else if (key === 'SUPABASE_SERVICE_ROLE_KEY') {
      console.log('   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here');
    }
  }
});

// Only throw error after debugging
const missingVars = requiredVars.filter(key => !process.env[key]);
if (missingVars.length > 0) {
  console.log('\n❌ CONFIGURATION ERROR:');
  console.log(`Missing required environment variables: ${missingVars.join(', ')}`);
  console.log('\n📋 TO FIX THIS:');
  console.log('1. Create a .env file in your project root');
  console.log('2. Add the following variables:');
  console.log('   SUPABASE_URL=https://your-project.supabase.co');
  console.log('   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key');
  console.log('3. Get these values from your Supabase dashboard');
  
  throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
}

export default {
  port: process.env.PORT || 8000,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY
};