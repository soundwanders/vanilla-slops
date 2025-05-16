import dotenv from 'dotenv';
dotenv.config();

const requiredVars = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];

requiredVars.forEach((key) => {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
});

export default {
  port: process.env.PORT || 3000,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY
};
