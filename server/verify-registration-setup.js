#!/usr/bin/env node

/**
 * REGISTRATION FIX VERIFICATION SCRIPT
 * 
 * This script verifies that all components are correctly configured
 * for new user registration to work without RLS policy errors.
 * 
 * Run: node server/verify-registration-setup.js
 */

import fs from 'fs';
import path from 'path';

console.log('\n' + '='.repeat(80));
console.log('REGISTRATION SETUP VERIFICATION SCRIPT');
console.log('='.repeat(80) + '\n');

let passCount = 0;
let failCount = 0;
let warningCount = 0;

// Helper functions
const pass = (message) => {
  console.log('✓ PASS:', message);
  passCount++;
};

const fail = (message) => {
  console.log('✗ FAIL:', message);
  failCount++;
};

const warn = (message) => {
  console.log('⚠ WARN:', message);
  warningCount++;
};

const info = (message) => {
  console.log('ℹ INFO:', message);
};

// Test 1: Check if service role key is in server/.env
console.log('\n[TEST 1] Checking Environment Variables');
console.log('-'.repeat(80));

const envPaths = [
  path.resolve(__dirname, '.env'),
  path.resolve(__dirname, '.env.local'),
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '../.env.local'),
];

let envFound = false;
let serviceRoleKeyFound = false;
let supabaseUrlFound = false;

for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    console.log(`Found .env file: ${envPath}`);
    const content = fs.readFileSync(envPath, 'utf8');
    
    if (content.includes('SUPABASE_SERVICE_ROLE_KEY')) {
      serviceRoleKeyFound = true;
      const match = content.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/);
      const key = match ? match[1].substring(0, 20) : '';
      info(`Service role key configured: ${key}...`);
    }
    
    if (content.includes('SUPABASE_URL')) {
      supabaseUrlFound = true;
      const match = content.match(/SUPABASE_URL=(.+)/);
      const url = match ? match[1] : '';
      info(`Supabase URL: ${url}`);
    }
    
    envFound = true;
    break;
  }
}

if (!envFound) {
  fail('No .env file found in server directory');
} else {
  pass('Server .env file exists');
}

if (!serviceRoleKeyFound) {
  fail('SUPABASE_SERVICE_ROLE_KEY not found in server/.env');
  info('  → Add to server/.env: SUPABASE_SERVICE_ROLE_KEY=<your_service_role_key>');
  info('  → Get from: Supabase Dashboard → Settings → API → Service Role Secret');
} else {
  pass('SUPABASE_SERVICE_ROLE_KEY is configured');
}

if (!supabaseUrlFound) {
  warn('SUPABASE_URL not found in server/.env');
} else {
  pass('SUPABASE_URL is configured');
}

// Test 2: Check backend files exist
console.log('\n[TEST 2] Checking Backend Files');
console.log('-'.repeat(80));

const backendFiles = [
  { path: path.resolve(__dirname, 'config/supabase.js'), name: 'server/config/supabase.js' },
  { path: path.resolve(__dirname, 'controllers/authController.js'), name: 'server/controllers/authController.js' },
  { path: path.resolve(__dirname, 'routes/auth.js'), name: 'server/routes/auth.js' },
  { path: path.resolve(__dirname, 'services/emailService.js'), name: 'server/services/emailService.js' },
];

for (const { path: filePath, name } of backendFiles) {
  if (fs.existsSync(filePath)) {
    pass(`${name} exists`);
  } else {
    fail(`${name} missing`);
  }
}

// Test 3: Check frontend files exist
console.log('\n[TEST 3] Checking Frontend Files');
console.log('-'.repeat(80));

const frontendFiles = [
  { path: path.resolve(__dirname, '../client/src/components/Register.js'), name: 'client/src/components/Register.js' },
  { path: path.resolve(__dirname, '../client/src/services/api.js'), name: 'client/src/services/api.js' },
  { path: path.resolve(__dirname, '../client/.env.local'), name: 'client/.env.local' },
];

for (const { path: filePath, name } of frontendFiles) {
  if (fs.existsSync(filePath)) {
    pass(`${name} exists`);
  } else {
    fail(`${name} missing`);
  }
}

// Test 4: Check Supabase client initialization
console.log('\n[TEST 4] Checking Supabase Client Configuration');
console.log('-'.repeat(80));

try {
  const { default: supabaseConfig } = await import(path.resolve(__dirname, 'config/supabase.js'));
  
  if (supabaseConfig.supabase) {
    pass('Supabase client is exported');
  } else {
    fail('Supabase client not exported from config');
  }
  
  if (supabaseConfig.getSupabaseServiceClient) {
    pass('getSupabaseServiceClient function exists');
  } else {
    fail('getSupabaseServiceClient function not found');
  }
} catch (err) {
  fail(`Error loading supabase config: ${err.message}`);
}

// Test 5: Check auth routes exist
console.log('\n[TEST 5] Checking Auth Routes');
console.log('-'.repeat(80));

try {
  const content = fs.readFileSync(path.resolve(__dirname, 'routes/auth.js'), 'utf8');
  
  if (content.includes('register')) {
    pass('Register route exists');
  } else {
    fail('Register route not found');
  }
  
  if (content.includes('verify-email') || content.includes('verifyEmail')) {
    pass('Email verification route exists');
  } else {
    warn('Email verification route not found');
  }
} catch (err) {
  fail(`Error reading auth routes: ${err.message}`);
}

// Test 6: Check Register component uses backend service
console.log('\n[TEST 6] Checking Frontend Register Component');
console.log('-'.repeat(80));

try {
  const content = fs.readFileSync(
    path.resolve(__dirname, '../client/src/components/Register.js'),
    'utf8'
  );
  
  if (content.includes('authService.register')) {
    pass('Register component calls authService.register()');
  } else {
    fail('Register component does not call authService.register()');
  }
  
  if (content.includes('/email-verification')) {
    pass('Register component navigates to email verification');
  } else {
    warn('Email verification navigation not found');
  }
} catch (err) {
  fail(`Error reading Register component: ${err.message}`);
}

// Test 7: Check RLS policy file exists
console.log('\n[TEST 7] Checking RLS Policy Files');
console.log('-'.repeat(80));

const policyFiles = [
  { path: path.resolve(__dirname, '../SUPABASE_RLS_POLICIES_REGISTRATION_FIX.sql'), name: 'SUPABASE_RLS_POLICIES_REGISTRATION_FIX.sql' },
  { path: path.resolve(__dirname, '../RLS_REGISTRATION_FIX_GUIDE.md'), name: 'RLS_REGISTRATION_FIX_GUIDE.md' },
];

for (const { path: filePath, name } of policyFiles) {
  if (fs.existsSync(filePath)) {
    pass(`${name} exists`);
  } else {
    warn(`${name} not found - This is the RLS policy file that needs to be applied in Supabase`);
  }
}

// Summary
console.log('\n' + '='.repeat(80));
console.log('VERIFICATION SUMMARY');
console.log('='.repeat(80));
console.log(`✓ Passed:  ${passCount}`);
console.log(`✗ Failed:  ${failCount}`);
console.log(`⚠ Warned:  ${warningCount}`);
console.log('='.repeat(80));

// Recommendations
console.log('\nRECOMMENDATIONS:');
console.log('-'.repeat(80));

if (failCount === 0) {
  console.log('✓ All critical checks passed!');
  console.log('\nNext steps:');
  console.log('1. Ensure SUPABASE_SERVICE_ROLE_KEY is valid and matches Supabase');
  console.log('2. Apply RLS policies in Supabase Dashboard using SQL file');
  console.log('3. Restart backend server: npm start');
  console.log('4. Test registration: http://localhost:3001/register');
} else {
  console.log('✗ Configuration issues found. Please fix the FAILs above before testing.');
  console.log('\nSteps:');
  console.log('1. Fix all FAIL items above');
  console.log('2. Ensure all required environment variables are set');
  console.log('3. Run this script again to verify');
}

if (warningCount > 0) {
  console.log('\n⚠ Warnings found - these may affect functionality:');
  console.log('  Check the WARN items above and address if needed');
}

console.log('\nFor detailed help, see: RLS_REGISTRATION_FIX_GUIDE.md');
console.log('='.repeat(80) + '\n');

// Exit with appropriate code
process.exit(failCount > 0 ? 1 : 0);
