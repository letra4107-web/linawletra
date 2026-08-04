import { createClient } from '@supabase/supabase-js';
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars');
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

async function findAndDeleteByEmail(email) {
  const normalized = normalizeEmail(email);
  console.log(`Searching for user: ${normalized}`);

  let page = 1;
  const perPage = 100;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw error;
    }

    const users = data?.users ?? data;
    if (!Array.isArray(users) || users.length === 0) {
      break;
    }

    const found = users.find((u) => normalizeEmail(u.email) === normalized);
    if (found) {
      console.log('Deleting user:', found.email, found.id);
      const { error: deleteError } = await admin.auth.admin.deleteUser(found.id);
      if (deleteError) {
        throw deleteError;
      }
      console.log('Deleted user:', found.email, found.id);
      return true;
    }

    if (users.length < perPage) {
      break;
    }
    page += 1;
  }

  console.log('No user found for', normalized);
  return false;
}

(async () => {
  try {
    const emails = [
      'lowerperri@gmail.com',
      'letra4107@gmail.com',
      'test+dev@example.com',
    ];

    for (const email of emails) {
      await findAndDeleteByEmail(email);
    }

    console.log('Done');
  } catch (err) {
    console.error('Error:', err);
    process.exitCode = 1;
  }
})();
