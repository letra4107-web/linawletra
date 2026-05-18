/**
 * Supabase Authentication Service
 * Handles user registration, login, password reset,
 * and email OTP verification.
 */

import { supabase } from '../config/supabase';
import { authService } from './api';

const EMAIL_VERIFICATION_EXPIRY_MS = 10 * 60 * 1000;
const EMAIL_VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_EMAIL_VERIFICATION_ATTEMPTS = 5;

const buildDisplayName = (userData = {}) => {
  if (userData.fullName) return userData.fullName;
  if (userData.name) return userData.name;

  return [userData.firstName, userData.middleInitial, userData.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();
};

const generateEmailVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const getAuthenticatedUser = async () => {
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    const error = new Error('Session expired. Please log in again.');
    error.code = 'auth/not-authenticated';
    throw error;
  }

  return user;
};

/**
 * Register new user (Parent/Teacher)
 * Calls backend API which uses service role to bypass RLS
 */
export const registerUser = async (email, password, userData) => {
  try {
    const displayName = buildDisplayName(userData);
    
    // Get API URL with proper base URL (without /api since we add it below)
    const baseUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
    const apiUrl = baseUrl.endsWith('/api') 
      ? baseUrl 
      : `${baseUrl}/api`;
    
    const registrationUrl = `${apiUrl}/auth/register`;

    // Log API call for debugging
    console.log('[Registration] Starting registration process');
    console.log('[Registration] API Base URL:', baseUrl);
    console.log('[Registration] Registration endpoint:', registrationUrl);
    console.log('[Registration] Email:', email);
    console.log('[Registration] Role:', userData.role || 'parent');

    // Call backend API to register user
    // Backend uses service role which bypasses RLS policies
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
    console.log('[Registration] Response status text:', response.statusText);

    // Check if response is JSON
    const contentType = response.headers.get('content-type');
    let result;
    
    if (contentType && contentType.includes('application/json')) {
      result = await response.json();
      console.log('[Registration] Response data:', result);
    } else {
      const text = await response.text();
      console.error('[Registration] Invalid response from API (not JSON):', text);
      throw new Error(
        `Server error: ${response.status} ${response.statusText}. ` +
        `Expected JSON but got ${contentType || 'unknown content type'}. ` +
        `Backend may not be running or route may not exist.`
      );
    }

    if (!response.ok) {
      const errorMsg = result?.message || result?.error || result?.errors?.[0]?.message || `Registration failed: ${response.status}`;
      console.error('[Registration] API returned error:', errorMsg);
      throw new Error(errorMsg);
    }

    console.log('[Registration] Registration successful');
    return {
      success: true,
      user: {
        id: email,
        uid: email,
        email: email,
        displayName: displayName,
        ...userData,
        emailVerified: false,
      },
      verificationEmailSent: result.requiresEmailVerification ?? true,
      message: result.message || 'Registration successful! Please verify your email.',
    };
  } catch (error) {
    console.error('[Registration] Registration error:', error);
    console.error('[Registration] Error stack:', error.stack);
    
    let errorMessage = 'Failed to register user';

    if (error.message?.includes('404')) {
      errorMessage = 'Backend registration endpoint not found (404). Check backend server and route configuration.';
    } else if (error.message?.includes('already registered') || error.message?.includes('already exists')) {
      errorMessage = 'Email already registered';
    } else if (error.message?.includes('Password')) {
      errorMessage = 'Password too weak (min 8 characters with number and symbol)';
    } else if (error.message?.includes('email')) {
      errorMessage = 'Invalid email address';
    } else if (error.message?.includes('not running') || error.message?.includes('ECONNREFUSED')) {
      errorMessage = 'Backend server is not running. Please ensure the server is started on http://localhost:5000.';
    } else if (error.message?.includes('fetch') || error.message?.includes('Failed to fetch')) {
      errorMessage = 'Cannot connect to backend server. Please ensure the server is running and CORS is properly configured.';
    } else if (error.message?.includes('Expected JSON')) {
      errorMessage = error.message;
    } else if (error.message) {
      errorMessage = error.message;
    }

    throw new Error(errorMessage);
  }
};

/**
 * Login user with email and password
 */
export const loginUser = async (email, password) => {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;

    const user = data.user;
    if (!user) throw new Error('Login failed');

    // Get user profile from database
    const { data: userData, error: profileError } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError) throw profileError;

    const normalizedRole = userData?.role || 'parent';
    const isAdminAccount = normalizedRole === 'admin';
    const isStudentAccount = normalizedRole === 'student' || email.toLowerCase().endsWith('@student.linawletra.ph');
    const isEmailVerified = Boolean(isAdminAccount || isStudentAccount || userData?.email_verified || user.email_confirmed_at);

    return {
      success: true,
      user: {
        id: user.id,
        uid: user.id,
        email: user.email,
        displayName: userData?.display_name || user.user_metadata?.display_name,
        ...userData,
        role: normalizedRole,
        emailVerified: isEmailVerified,
      },
      emailVerified: isEmailVerified,
      requiresVerification: !isEmailVerified,
    };
  } catch (error) {
    console.error('Error logging in user:', error);
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
    const { error } = await supabase.auth.signOut();
    if (error && !error.message?.toLowerCase().includes('no active session')) {
      throw error;
    }
    return { success: true };
  } catch (error) {
    console.error('Error logging out:', error);
    throw new Error('Failed to logout');
  }
};

/**
 * Send password reset email
 */
export const sendPasswordReset = async (email) => {
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) throw error;

    return {
      success: true,
      message: 'Password reset email sent',
    };
  } catch (error) {
    console.error('Error sending password reset:', error);
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
 */
export const updateUserProfile = async (userId, updates) => {
  try {
    const { error } = await supabase
      .from('users')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) throw error;

    return { success: true };
  } catch (error) {
    console.error('Error updating profile:', error);
    throw error;
  }
};

/**
 * Update user email
 */
export const updateUserEmail = async (newEmail) => {
  try {
    const { error } = await supabase.auth.updateUser({
      email: newEmail,
    });

    if (error) throw error;

    // Update email in database
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from('users')
        .update({
          email: newEmail.toLowerCase(),
          email_verified: false,
          verified_at: null,
        })
        .eq('id', user.id);
    }

    return { success: true };
  } catch (error) {
    console.error('Error updating email:', error);
    throw error;
  }
};

/**
 * Update user password
 */
export const updateUserPassword = async (newPassword) => {
  try {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) throw error;

    return { success: true };
  } catch (error) {
    console.error('Error updating password:', error);
    throw error;
  }
};

/**
 * Get current user with profile data
 */
export const getCurrentUser = async () => {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) return null;

    const { data: userData, error: profileError } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError) return null;

    return {
      id: user.id,
      uid: user.id,
      email: user.email,
      displayName: userData?.display_name,
      ...userData,
      emailVerified: Boolean(userData?.email_verified),
    };
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
};

export const onAuthStateChanged = (authInstance, callback) => {
  try {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      callback(session?.user || null);
    });

    return () => {
      if (subscription && typeof subscription.unsubscribe === 'function') {
        subscription.unsubscribe();
      }
    };
  } catch (error) {
    console.error('Failed to initialize auth state listener:', error);
    return () => {};
  }
};

export const signOut = async (authInstance) => {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('Error signing out:', error);
    throw error;
  }
};

export const verifyEmailVerificationCode = async (email, code) => {
  const targetEmail = email ? String(email).trim().toLowerCase() : null;
  if (!targetEmail) {
    throw new Error('Email is required to verify your account.');
  }

  await authService.verifyEmail({
    email: targetEmail,
    verificationCode: code,
  });

  return {
    user: {
      email: targetEmail,
      emailVerified: true,
    },
  };
};

export const resendEmailVerificationCode = async (email) => {
  const targetEmail = email ? String(email).trim().toLowerCase() : null;

  if (!targetEmail) {
    throw new Error('Email is required to resend the verification code.');
  }

  await authService.resendVerificationCode(targetEmail);

  return {
    resendAvailableAt: Date.now() + EMAIL_VERIFICATION_RESEND_COOLDOWN_MS,
  };
};

/**
 * Register teacher account (admin only)
 */
export const registerTeacherAccount = async (email, password, userData) => {
  try {
    // Check if current user is admin
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser) {
      throw new Error('Not authenticated. Please log in as admin.');
    }

    const { data: adminData } = await supabase
      .from('users')
      .select('role')
      .eq('id', currentUser.id)
      .single();

    if (!adminData || adminData.role !== 'admin') {
      throw new Error('Admin access required to create teacher accounts.');
    }

    const displayName = buildDisplayName(userData);

    // Create teacher auth account
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName,
          role: 'teacher',
        }
      }
    });

    if (error) throw error;

    const teacherUser = data.user;
    if (!teacherUser) throw new Error('Teacher account creation failed');

    // Create user profile
    const { error: profileError } = await supabase
      .from('users')
      .insert({
        uid: teacherUser.id,
        email: email.toLowerCase(),
        display_name: displayName,
        first_name: userData.firstName || '',
        last_name: userData.lastName || '',
        middle_initial: userData.middleInitial || '',
        role: 'teacher',
        phone: userData.phone || null,
        profile_image: null,
        email_verified: true,
        verified_at: new Date().toISOString(),
        account_status: 'active',
        is_active: true,
      });

    if (profileError) throw profileError;

    // Create teacher record
    const { error: teacherError } = await supabase
      .from('teachers')
      .insert({
        user_id: teacherUser.id,
        status: 'active',
      });

    if (teacherError) throw teacherError;

    return {
      success: true,
      user: {
        id: teacherUser.id,
        email: teacherUser.email,
        displayName,
        ...userData,
        role: 'teacher',
        emailVerified: true,
      },
    };
  } catch (error) {
    console.error('Error registering teacher account:', error);
    let errorMessage = 'Failed to register teacher account';

    if (error.message?.includes('already registered')) {
      errorMessage = 'Email already registered';
    } else if (error.message) {
      errorMessage = error.message;
    }

    throw new Error(errorMessage);
  }
};