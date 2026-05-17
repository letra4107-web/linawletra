const path = require('path');
const dotenv = require('dotenv');

[path.resolve(__dirname, '../.env'), path.resolve(__dirname, '.env'), path.resolve(__dirname, '../.env.local'), path.resolve(__dirname, '.env.local')].forEach((envPath) => {
  dotenv.config({ path: envPath, override: false });
});

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL || 'https://uwuiinbbrhnwswmtlskp.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || '';

// ============================================================================
// IMPORTANT: Service Role Key Configuration
// ============================================================================
// The service role key is used for backend operations and BYPASSES all RLS policies.
// This is critical for:
// - User registration (creating user profiles)
// - Admin operations
// - Database migrations
// 
// SECURITY: NEVER use service role key in frontend code
// ============================================================================

let supabaseService = null;
let supabaseAnon = null;

/**
 * Get Supabase client with SERVICE ROLE key
 * Use this for backend operations that need to bypass RLS
 * Examples: user registration, admin operations, migrations
 */
const getSupabaseServiceClient = () => {
  if (supabaseService) {
    return supabaseService;
  }

  if (!supabaseServiceKey) {
    console.error('❌ SUPABASE SERVICE ROLE KEY NOT CONFIGURED');
    console.error('   This is required for user registration to work!');
    console.error('   Add SUPABASE_SERVICE_ROLE_KEY to your .env file');
    console.error('   Get it from: Supabase Dashboard > Settings > API > Service Role Secret Key');
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured in .env');
    }
    console.warn('[Supabase] Running in development without service role key — using placeholder client (some features may fail)');
  } else {
    console.log('[Supabase] ✓ Using SERVICE ROLE KEY (bypasses RLS policies)');
  }

  // Create client; if service key is missing in dev we use a placeholder string to allow app startup
  const effectiveServiceKey = supabaseServiceKey || 'dev_service_role_placeholder_key';

  supabaseService = createClient(supabaseUrl, effectiveServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return supabaseService;
};

/**
 * Get Supabase client with ANON key
 * Use this for client-side operations (applies RLS policies)
 * Not typically needed on backend
 */
const getSupabaseAnonClient = () => {
  if (supabaseAnon) {
    return supabaseAnon;
  }

  if (!supabaseAnonKey) {
    console.warn('[Supabase] ⚠ ANON KEY NOT CONFIGURED - Some features may not work');
    return null;
  }

  console.log('[Supabase] ✓ Using ANON KEY (RLS policies apply)');

  supabaseAnon = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return supabaseAnon;
};

// Default export uses service role for backend
const supabase = getSupabaseServiceClient();

module.exports = { 
  supabase,
  getSupabaseServiceClient,
  getSupabaseAnonClient,
};
