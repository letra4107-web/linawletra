#!/usr/bin/env node

/**
 * Cleanup Email Registration
 * 
 * This utility script helps resolve "Email already registered" errors by removing
 * duplicate emails from Supabase Auth when they shouldn't be there.
 * 
 * Use cases:
 * - User was deleted from custom users table but still in Supabase Auth
 * - Manual cleanup of orphaned email accounts
 * - Re-registering deleted users with the same email
 * 
 * SECURITY: Uses SUPABASE_SERVICE_ROLE_KEY (server-side only)
 * Never expose this key in client-side code or public repositories.
 * 
 * Usage:
 *   node cleanup-email-registration.js <email>
 *   node cleanup-email-registration.js --list-all
 *   node cleanup-email-registration.js --check <email>
 */

import path from 'path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
[
  path.resolve(__dirname, '.env'),
  path.resolve(__dirname, '.env.local'),
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '../.env.local'),
].forEach((envPath) => {
  dotenv.config({ path: envPath, override: false });
});

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('ERROR: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * List all users in Supabase Auth
 */
async function listAllUsers() {
  try {
    console.log('\n📋 Fetching all users from Supabase Auth...\n');
    const { data, error } = await supabase.auth.admin.listUsers();

    if (error) {
      console.error('❌ Error fetching users:', error.message);
      process.exit(1);
    }

    if (!data.users || data.users.length === 0) {
      console.log('No users found in Supabase Auth');
      return;
    }

    console.log(`✓ Found ${data.users.length} users:\n`);
    data.users.forEach((user, index) => {
      console.log(`${index + 1}. ${user.email} (${user.id})`);
      console.log(`   Created: ${new Date(user.created_at).toLocaleString()}`);
      console.log(`   Email verified: ${!!user.email_confirmed_at}\n`);
    });
  } catch (error) {
    console.error('ERROR:', error.message);
    process.exit(1);
  }
}

/**
 * Check if an email exists in Supabase Auth
 */
async function checkEmail(email) {
  try {
    console.log(`\n🔍 Checking if "${email}" exists in Supabase Auth...\n`);
    const { data, error } = await supabase.auth.admin.listUsers();

    if (error) {
      console.error('❌ Error fetching users:', error.message);
      process.exit(1);
    }

    const user = data.users.find((u) => u.email.toLowerCase() === email.toLowerCase());

    if (!user) {
      console.log(`✓ Email "${email}" is NOT registered in Supabase Auth (safe to register)`);
      return;
    }

    console.log(`❌ Email "${email}" is still registered in Supabase Auth:`);
    console.log(`   User ID: ${user.id}`);
    console.log(`   Created: ${new Date(user.created_at).toLocaleString()}`);
    console.log(`   Email verified: ${!!user.email_confirmed_at}`);
    console.log(`\nTo delete this email, run:`);
    console.log(`   node cleanup-email-registration.js "${email}"\n`);
  } catch (error) {
    console.error('ERROR:', error.message);
    process.exit(1);
  }
}

/**
 * Delete a user by email from Supabase Auth
 */
async function deleteByEmail(email) {
  try {
    console.log(`\n🗑️  Looking for user with email: ${email}\n`);
    const { data, error } = await supabase.auth.admin.listUsers();

    if (error) {
      console.error('❌ Error fetching users:', error.message);
      process.exit(1);
    }

    const user = data.users.find((u) => u.email.toLowerCase() === email.toLowerCase());

    if (!user) {
      console.log(`✓ Email "${email}" is NOT registered in Supabase Auth`);
      console.log(`  No user to delete.\n`);
      return;
    }

    console.log(`✓ Found user: ${user.email} (${user.id})`);
    console.log(`⏳ Deleting from Supabase Auth...\n`);

    const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id);

    if (deleteError) {
      console.error('❌ Error deleting user:', deleteError.message);
      process.exit(1);
    }

    console.log(`✓ Successfully deleted user from Supabase Auth`);
    console.log(`✓ Email "${email}" can now be re-registered\n`);
  } catch (error) {
    console.error('ERROR:', error.message);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log(`\n❓ Usage:`);
  console.log(`   node cleanup-email-registration.js <email>       - Delete user by email`);
  console.log(`   node cleanup-email-registration.js --check <email> - Check if email exists`);
  console.log(`   node cleanup-email-registration.js --list-all     - List all users\n`);
  console.log(`⚠️  SECURITY: This script uses SUPABASE_SERVICE_ROLE_KEY (server-side only)`);
  console.log(`   Never expose this key in client-side code.\n`);
  process.exit(0);
}

const command = args[0];

if (command === '--list-all') {
  listAllUsers();
} else if (command === '--check' && args[1]) {
  checkEmail(args[1]);
} else if (command === '--check' && !args[1]) {
  console.error('❌ Error: Please provide an email after --check');
  process.exit(1);
} else {
  // Treat first arg as email to delete
  deleteByEmail(command);
}
