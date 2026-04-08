import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('[DATABASE] Missing Supabase credentials. Check SUPABASE_URL and SUPABASE_ANON_KEY in your environment.');
  process.exit(1);
}

export const supabase = createClient(supabaseUrl, supabaseKey);

console.log('[DATABASE] Supabase client initialized.');
