import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Create and export a Supabase client instance
 * 
 * @returns {Object}
 */
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export default supabase;