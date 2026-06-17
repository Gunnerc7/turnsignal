import { createClient } from '@supabase/supabase-js';

// These read from environment variables so the same code works
// locally, in Vercel, and anywhere else — the actual values live
// in your .env file (locally) or your hosting provider's
// environment variable settings (in production), never hardcoded here.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Missing Supabase environment variables. Check your .env file for VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey);
