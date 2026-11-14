import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// supabase-js sets no timeout unless asked, so when the database stops
// answering, a request waits for as long as the platform lets it. On
// 2026-11-13 a crawler burst saturated the connection pool and requests sat
// open for about four minutes each before failing anyway, and the function is
// billed for every second an instance is held.
//
// 8 s is per attempt, and far above a healthy request: the slowest whole page
// measured on a quiet site took 1.6 s across several of them. A request that
// times out is not retried; it comes back as an ordinary `{ error }`, so
// callers need no change. The library's own retries (three, for a 503, a 520
// or a dropped connection) are left on, because they are what heals a
// momentary blip before a visitor or a search engine sees it.
export const CLIENT_OPTIONS = {
  db: { timeout: 8000 },
};

/**
 * Create and export a Supabase client instance
 * 
 * @returns {Object}
 */
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, CLIENT_OPTIONS);

export default supabase;
