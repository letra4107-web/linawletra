/**
 * Supabase Authentication Service
 * Handles user registration, login, password reset, and email verification.
 * 
 * CRITICAL FIXES:
 * - Uses id (UUID) instead of uid (removed from schema)
 * - No TEXT casting of UUID values
 * - Proper error handling for registration
 * - Clean separation between auth and profile
 */

import { supabase } from '../config/supabase';
import { userService } from './api';

const EMAIL_VERIFICATION_EXPIRY_MS = 10 * 60 * 1000;
const EMAIL_VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_EMAIL_VERIFICATION_ATTEMPTS = 5;

/**
 * Build display name from user data
 */
const buildDisplayName = (userData = {}) => {
  if (userData.fullName) return userData.fullName;
  if (userData.name) return userData.name;

  return [userData.firstName, userData.middleInitial, userData.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();
};

/**
 * Generate 6-digit verification code
 */
const generateEmailVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Get authenticated user from Supabase Auth
 */
const getAuthenticatedUser = async () => {
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    const err = new Error('Session expired. Please log in again.');
    err.code = 'auth/not-authenticated';
    throw err;
  }

  return user;
};

/**
 * Register new user (Parent/Teacher/Student)
 * 
 * Flow:
 * 1. Frontend calls backend API (not Supabase Auth directly)
 * 2. Backend creates Supabase Auth user
 * 3. Backend creates user profile with id = auth.users.id
 * 4. Backend sends verification email
 * 5. Frontend redirects to OTP verification
 */
export const registerUser = async (email, password, userData) => {
  try {
    const displayName = buildDisplayName(userData);
    
    // Get backend API URL
    const baseUrl = process.env.REACT_APP_API_URL;
    const apiUrl = baseUrl.endsWith('/api') 
      ? baseUrl 
      : `${baseUrl}/api`;
    
    const registrationUrl = `${apiUrl}/auth/register`;

    console.log('[Registration] Starting registration process');
    console.log('[Registration] Email:', email);
    console.log('[Registration] Role:', userData.role || 'parent');
    console.log('[Registration] Endpoint:', registrationUrl);

    // Call backend registration API
    // Backend uses service role which bypasses RLS
    const response = await fetch(registrationUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        firstName: userData.firstName,
        lastName: userData.lastName,
        middleInitial: userData.middleInitial || null,
        email: email.toLowerCase(),
        password,
        role: userData.role || 'parent',
      }),
    });

    console.log('[Registration] Response status:', response.status);

    const contentType = response.headers.get('content-type');
    let result;
    
    if (contentType && contentType.includes('application/json')) {
      result = await response.json();
    } else {
      const text = await response.text();
      console.error('[Registration] Invalid response (not JSON):', text);
      throw new Error(
        `Server error: ${response.status}. Backend may not be running.`
      );
    }

    if (!response.ok) {
      const errorMsg = result?.message || result?.error || `Registration failed: ${response.status}`;
      console.error('[Registration] API error:', errorMsg);
      throw new Error(errorMsg);
    }

    console.log('[Registration] ✓ Registration successful');
    console.log('[Registration] User ID:', result.userId);

    return {
      success: true,
      userId: result.userId,
      email: email.toLowerCase(),
      displayName: displayName,
      verificationEmailSent: result.requiresEmailVerification ?? true,
      message: result.message || 'Registration successful! Please verify your email.',
    };
  } catch (error) {
    console.error('[Registration] Error:', error);
    
    let errorMessage = 'Failed to register user';

    if (error.message?.includes('404')) {
      errorMessage = 'Backend registration endpoint not found. Check backend server.';
    } else if (error.message?.includes('already registered') || error.message?.includes('already exists')) {
      errorMessage = 'Email already registered';
    } else if (error.message?.includes('Password')) {
      errorMessage = 'Password too weak (min 8 characters)';
    } else if (error.message?.includes('email')) {
      errorMessage = 'Invalid email address';
    } else if (error.message?.includes('not running') || error.message?.includes('ECONNREFUSED')) {
      errorMessage = 'Backend server is not running. Please ensure REACT_APP_API_URL is set.';
    } else if (error.message?.includes('Failed to fetch') || error.message?.includes('fetch')) {
      errorMessage = 'Cannot connect to backend. Check CORS and server status.';
    } else if (error.message) {
      errorMessage = error.message;
    }

    throw new Error(errorMessage);
  }
};

/**
 * Login user with email and password
 * 
 * Returns user profile from database (id matches auth.users.id)
 */
export const loginUser = async (email, password) => {
  try {
    const normalizedEmail = email.toLowerCase();
    console.log('[Login] Attempting login for:', normalizedEmail);

    // Authenticate with Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (error) {
      console.error('[Login] Auth error:', error);
      throw new Error('Invalid email or password');
    }

    if (!data.user) {
      console.error('[Login] No user returned');
      throw new Error('Login failed');
    }

    console.log('[Login] Auth successful, fetching profile');

    // Get user profile from database
    // Query by id (UUID) which matches auth.users.id
    const { data: userProfile, error: profileError } = await supabase
      .from('users')
      .select('*')
      .eq('id', data.user.id)
      .single();

    if (profileError) {
      console.error('[Login] Profile fetch error:', profileError);
      throw profileError;
    }

    if (!userProfile) {
      console.error('[Login] User profile not found');
      throw new Error('User profile not found');
    }

    console.log('[Login] ✓ Login successful for:', normalizedEmail);

    const normalizedRole = userProfile?.role || 'parent';
    const isEmailVerified = Boolean(userProfile?.email_verified || data.user.email_confirmed_at);

    return {
      success: true,
      user: {
        id: data.user.id,
        email: data.user.email,
        displayName: userProfile?.display_name,
        firstName: userProfile?.first_name,
        lastName: userProfile?.last_name,
        role: normalizedRole,
        emailVerified: isEmailVerified,
        profileImage: userProfile?.profile_image,
        accountStatus: userProfile?.account_status,
        ...userProfile,
      },
      emailVerified: isEmailVerified,
      requiresVerification: !isEmailVerified,
    };
  } catch (error) {
    console.error('[Login] Error:', error);
    let errorMessage = 'Failed to login';
    
    if (error.message?.includes('Invalid login credentials')) {
      errorMessage = 'Invalid email or password';
    } else if (error.message?.includes('Email not confirmed')) {
      errorMessage = 'Please verify your email before logging in';
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    throw new Error(errorMessage);
  }
};

/**
 * Logout current user
 */
export const logoutUser = async () => {
  try {
    console.log('[Logout] Logging out user');
    const { error } = await supabase.auth.signOut();
    
    if (error) throw error;

    console.log('[Logout] ✓ Logout successful');
    return { success: true };
  } catch (error) {
    console.error('[Logout] Error:', error);
    throw new Error('Failed to logout');
  }
};

/**
 * Send password reset email
 */
export const sendPasswordReset = async (email) => {
  try {
    console.log('[Password Reset] Sending reset email to:', email);
    
    const { error } = await supabase.auth.resetPasswordForEmail(email.toLowerCase(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) throw error;

    console.log('[Password Reset] ✓ Email sent');
    return {
      success: true,
      message: 'Password reset email sent',
    };
  } catch (error) {
    console.error('[Password Reset] Error:', error);
    let errorMessage = 'Failed to send reset email';
    
    if (error.message?.includes('User not found')) {
      errorMessage = 'User not found';
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    throw new Error(errorMessage);
  }
};

/**
 * Update user profile
 * Uses id (UUID) for database queries
 */
export const updateUserProfile = async (userId, updates) => {
  try {
    console.log('[Profile Update] Updating profile for user:', userId);

    const { error } = await supabase
      .from('users')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);  // Use id (UUID), not uid

    if (error) throw error;

    console.log('[Profile Update] ✓ Profile updated');
    return { success: true };
  } catch (error) {
    console.error('[Profile Update] Error:', error);
    throw error;
  }
};

/**
 * Update user email
 */
export const updateUserEmail = async (newEmail) => {
  try {
    console.log('[Email Update] Updating email to:', newEmail);

    // Update email in Supabase Auth
    const { error: authError } = await supabase.auth.updateUser({
      email: newEmail.toLowerCase(),
    });

    if (authError) throw authError;

    // Update email in user profile
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { error: profileError } = await supabase
        .from('users')
        .update({
          email: newEmail.toLowerCase(),
          email_verified: false,
          verified_at: null,
        })
        .eq('id', user.id);  // Use id (UUID)

      if (profileError) throw profileError;
    }

    console.log('[Email Update] ✓ Email updated');
    return { success: true };
  } catch (error) {
    console.error('[Email Update] Error:', error);
    throw error;
  }
};

/**
 * Update user password
 */
export const updateUserPassword = async (newPassword) => {
  try {
    console.log('[Password Update] Updating password');

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) throw error;

    console.log('[Password Update] ✓ Password updated');
    return { success: true };
  } catch (error) {
    console.error('[Password Update] Error:', error);
    throw error;
  }
};

/**
 * Verify email with OTP code
 */
export const verifyEmailWithOtp = async (email, code) => {
  try {
    console.log('[Email Verification] Verifying OTP for:', email);

    const { data, error } = await supabase.auth.verifyOtp({
      email: email.toLowerCase(),
      token: code,
      type: 'email',
    });

    if (error) throw error;

    console.log('[Email Verification] ✓ Email verified');

    // Update profile to mark as verified
    if (data.user) {
      await supabase
        .from('users')
        .update({
          email_verified: true,
          verified_at: new Date().toISOString(),
        })
        .eq('id', data.user.id);
    }

    return { success: true };
  } catch (error) {
    console.error('[Email Verification] Error:', error);
    throw error;
  }
};

/**
 * Get current authenticated user
 */
export const getCurrentUser = async () => {
  try {
    const authUser = await getAuthenticatedUser();

    // Fetch profile from database
    const { data: profile, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', authUser.id)
      .single();

    if (error || !profile) {
      console.warn('[Get Current User] Profile not found');
      return null;
    }

    return {
      id: authUser.id,
      email: authUser.email,
      displayName: profile.display_name,
      firstName: profile.first_name,
      lastName: profile.last_name,
      role: profile.role,
      emailVerified: profile.email_verified,
      ...profile,
    };
  } catch (error) {
    console.error('[Get Current User] Error:', error);
    return null;
  }
};
