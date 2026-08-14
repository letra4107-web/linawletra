import { createClient } from '@supabase/supabase-js';

// Supabase configuration
const supabaseUrl = String(process.env.REACT_APP_SUPABASE_URL || '')
  .trim()
  .replace(/\/rest\/v1\/?$/i, '')
  .replace(/\/+$/, '');
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  const target = process.env.NODE_ENV === 'production'
    ? 'Hostinger/GitHub Actions build environment'
    : 'local .env.local';
  console.error(
    `Missing Supabase configuration. Set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY in the ${target}. Do not use SUPABASE_SERVICE_ROLE_KEY in the frontend.`
  );
}

// Create Supabase client
export const supabase = createClient(
  supabaseUrl || 'https://example.supabase.co',
  supabaseAnonKey || 'missing-supabase-anon-key'
);

// Export for backward compatibility
export default supabase;
