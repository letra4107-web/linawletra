const path = require('path');
import dotenv from 'dotenv';
import { supabase } from './config/supabase.js';

['.env', '.env.local', '../.env', '../.env.local'].forEach((envFile) => {
  dotenv.config({ path: path.resolve(__dirname, envFile), override: false });
});

const normalizeEmail = (email) => String(email || '').toLowerCase();

const findAuthUserByEmail = async (email) => {
  const normalizedEmail = normalizeEmail(email);
  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) {
    throw error;
  }
  return (data?.users || []).find((user) => String(user.email || '').toLowerCase() === normalizedEmail) || null;
};

const createOrUpdateAuthUser = async (email, password) => {
  const normalizedEmail = normalizeEmail(email);
  let authUser = await findAuthUserByEmail(normalizedEmail);

  if (authUser) {
    console.log(`Auth user already exists for ${normalizedEmail}`);
    if (password) {
      const { error: updateError } = await supabase.auth.admin.updateUserById(authUser.id, {
        password,
      });
      if (updateError) {
        throw updateError;
      }
      console.log(`Updated password for auth user ${normalizedEmail}`);
    }
    return authUser;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: normalizedEmail,
    password,
    email_confirm: true,
  });

  if (error || !data?.user) {
    throw error || new Error('Failed to create auth user');
  }

  return data.user;
};

const createOrUpdateUserProfile = async (authUser, profileData) => {
  const insertData = {
    id: authUser.id,
    email: normalizeEmail(authUser.email),
    name: profileData.displayName,
    role: profileData.role,
    email_verified: true,
    metadata: {
      displayName: profileData.displayName,
      firstName: profileData.firstName,
      lastName: profileData.lastName,
      profileImage: profileData.profileImage || null,
    },
  };

  const { data, error } = await supabase
    .from('users')
    .upsert(insertData, { onConflict: 'id' })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
};

const createAdmin = async () => {
  const email = 'admin@linawletra.app';
  const password = 'Admin123!';
  const profile = {
    firstName: 'Admin',
    lastName: 'User',
    displayName: 'Admin User',
    role: 'admin',
  };

  const authUser = await createOrUpdateAuthUser(email, password);
  const userProfile = await createOrUpdateUserProfile(authUser, profile);

  return { authUser, userProfile, email, password };
};

async function seedDatabase() {
  try {
    console.log('🔧 Starting Supabase admin seed run...');

    const admin = await createAdmin();

    console.log('\n✅ Admin account created or updated successfully');
    console.log(` - Email: ${admin.email}`);
    console.log(` - Password: ${admin.password}`);
    console.log(` - User ID: ${admin.authUser.id}`);
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Supabase admin seed failed');
    console.error(error);
    process.exit(1);
  }
}

seedDatabase();
