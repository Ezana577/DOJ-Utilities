import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // ← changed

if (!supabaseUrl || !supabaseKey) {
  console.error('[DATABASE] Missing Supabase credentials. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment.');
  process.exit(1);
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,  
    autoRefreshToken: false,
  },
});

console.log('[DATABASE] Supabase client initialized.');