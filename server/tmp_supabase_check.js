import { createClient } from '@supabase/supabase-js';
const sb = createClient('https://example.supabase.co', 'anon');
console.log('getUser:', typeof sb.auth.getUser);
console.log('getUserByCookie:', typeof sb.auth.getUserByCookie);
console.log('admin:', typeof sb.auth.admin);
console.log('auth functions:', Object.keys(sb.auth).filter(k => typeof sb.auth[k] === 'function'));
