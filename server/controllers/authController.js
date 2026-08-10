import User from '../models/User.js';
import jwt from 'jsonwebtoken';
import { validationResult } from 'express-validator';
import configModule from '../config.js';
const config = configModule.default || configModule;
import { supabase, getSupabaseAuthClient } from '../config/supabase.js';
import bcrypt from 'bcryptjs';
import { generateVerificationCode,
  hashCode,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendStudentEnrollmentEmail,
  verifyCodeExpiration, } from '../services/emailService.js';

const storeSignupVerificationCode = async (userId, email, code, expiresAt, resendAvailableAt) => {
  const expiresAtISO = expiresAt instanceof Date ? expiresAt.toISOString() : expiresAt;
  const resendAvailableAtISO = resendAvailableAt instanceof Date
    ? resendAvailableAt.toISOString()
    : resendAvailableAt;

  const { error } = await supabase
    .from('email_verification_codes')
    .insert({
      user_id: userId,
      email: String(email || '').toLowerCase().trim(),
      code,
      expires_at: expiresAtISO,
      resend_available_at: resendAvailableAtISO,
      attempts: 0,
    });

  if (error) {
    // Log the raw Supabase/PostgREST error distinctly (code/message/details/hint) so a
    // schema-cache mismatch (e.g. missing table, PGRST205) is diagnosable from server logs
    // alone — the generic Error thrown below is what the client sees, but it discards this
    // detail once it reaches the outer catch in register().
    console.error('[authController] Failed to store verification code:', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    const shouldUseMetadataFallback =
      ['PGRST205', '42P01', '42703'].includes(error.code) ||
      String(error.message || '').toLowerCase().includes('schema cache') ||
      String(error.message || '').toLowerCase().includes('does not exist');

    if (!shouldUseMetadataFallback) {
      throw new Error('Could not send verification email. Please try again.');
    }

    const { data: currentUser, error: fetchError } = await supabase
      .from('users')
      .select('metadata')
      .eq('id', userId)
      .single();

    if (fetchError) throw new Error('Could not send verification email. Please try again.');

    const { error: fallbackError } = await supabase
      .from('users')
      .update({
        metadata: {
          ...(currentUser?.metadata || {}),
          signupVerification: {
            email: String(email || '').toLowerCase().trim(),
            code,
            expires_at: expiresAtISO,
            resend_available_at: resendAvailableAtISO,
            attempts: 0,
            created_at: new Date().toISOString(),
          },
        },
      })
      .eq('id', userId);

    if (fallbackError) {
      console.error('[authController] Metadata fallback for verification code failed:', fallbackError);
      throw new Error('Could not send verification email. Please try again.');
    }

    return { source: 'metadata' };
  }

  console.log('[authController] Verification code stored in email_verification_codes table');
  return { source: 'table' };
};

const getSignupVerificationCode = async (user) => {
  const { data: tableRecord, error } = await supabase
    .from('email_verification_codes')
    .select('*')
    .eq('user_id', user.id)
    .eq('email', user.email)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    const fallbackRecord = user.metadata?.signupVerification;
    if (fallbackRecord?.email === user.email) {
      return { source: 'metadata', record: fallbackRecord };
    }
    throw error;
  }
  if (!tableRecord) {
    const fallbackRecord = user.metadata?.signupVerification;
    if (fallbackRecord?.email === user.email) {
      return { source: 'metadata', record: fallbackRecord };
    }
    return null;
  }
  return { source: 'table', record: tableRecord };
};

const updateSignupVerificationAttempts = async (user, record) => {
  if (!record?.id) {
    const metadata = {
      ...(user.metadata || {}),
      signupVerification: {
        ...(record || {}),
        attempts: (record?.attempts || 0) + 1,
      },
    };

    const { error } = await supabase
      .from('users')
      .update({ metadata })
      .eq('id', user.id);

    if (error) throw error;
    return;
  }

  const { error } = await supabase
    .from('email_verification_codes')
    .update({ attempts: (record.attempts || 0) + 1 })
    .eq('id', record.id)
    .eq('user_id', user.id);

  if (error) throw error;
};

const clearSignupVerificationCode = async (user) => {
  if (user.metadata?.signupVerification) {
    const metadata = { ...(user.metadata || {}) };
    delete metadata.signupVerification;
    const { error } = await supabase
      .from('users')
      .update({ metadata })
      .eq('id', user.id);
    if (error) throw error;
  }

  const { error } = await supabase
    .from('email_verification_codes')
    .delete()
    .eq('user_id', user.id)
    .eq('email', user.email);

  if (error && !['PGRST205', '42P01'].includes(error.code)) throw error;
};

const findAuthUserByEmail = async (email) => {
  const normalizedEmail = String(email || '').toLowerCase();
  let page = 1;
  const perPage = 1000;

  while (page <= 10) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.warn('[authController] Could not check Supabase Auth user by email:', error.message);
      return null;
    }

    const users = data?.users || [];
    const match = users.find((user) => String(user.email || '').toLowerCase() === normalizedEmail);
    if (match) return match;
    if (users.length < perPage) return null;
    page += 1;
  }

  console.warn('[authController] Auth user lookup stopped after 10 pages:', normalizedEmail);
  return null;
};

const sendEmailFailureResponse = (res, message, emailError) => {
  const status = emailError?.status === 504 || emailError?.code === 'EMAIL_SEND_TIMEOUT'
    ? 504
    : 503;
  return res.status(status).json({
    success: false,
    message,
    code: emailError?.code || 'EMAIL_SEND_FAILED',
    providerStatus: emailError?.status,
    details: process.env.NODE_ENV === 'development'
      ? (emailError?.response || emailError?.message)
      : undefined,
  });
};

const runTimedRegistrationStep = async (requestId, label, step) => {
  const startedAt = Date.now();
  console.log(`[Register API] [${requestId}] ${label} started`);
  try {
    const result = await step();
    console.log(`[Register API] [${requestId}] ${label} completed in ${Date.now() - startedAt}ms`);
    return result;
  } catch (error) {
    console.error(`[Register API] [${requestId}] ${label} failed in ${Date.now() - startedAt}ms`, {
      message: error?.message,
      code: error?.code,
      status: error?.status,
      details: error?.details,
      hint: error?.hint,
      response: error?.response,
    });
    throw error;
  }
};

const buildLoginOtpRecord = (code, session = null) => ({
  code,
  expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  resend_available_at: new Date(Date.now() + 60 * 1000).toISOString(),
  attempts: 0,
  created_at: new Date().toISOString(),
  access_token: session?.access_token || null,
  refresh_token: session?.refresh_token || null,
});

const storeLoginOtp = async (user, code, session = null) => {
  const record = buildLoginOtpRecord(code, session);
  const metadata = {
    ...(user.metadata || {}),
    loginOtp: record,
  };

  const { error } = await supabase
    .from('users')
    .update({ metadata })
    .eq('id', user.id);

  if (error) throw error;
  return record;
};

const updateLoginOtpAttempts = async (user, record) => {
  const metadata = {
    ...(user.metadata || {}),
    loginOtp: {
      ...record,
      attempts: (record.attempts || 0) + 1,
    },
  };

  const { error } = await supabase
    .from('users')
    .update({ metadata })
    .eq('id', user.id);

  if (error) throw error;
};

const clearLoginOtp = async (user) => {
  const metadata = { ...(user.metadata || {}) };
  delete metadata.loginOtp;

  const { error } = await supabase
    .from('users')
    .update({ metadata })
    .eq('id', user.id);

  if (error) throw error;
};

const markFirstLoginOtpCompleted = async (user) => {
  const metadata = { ...(user.metadata || {}) };
  delete metadata.loginOtp;
  metadata.firstLoginOtpCompleted = true;
  metadata.firstLoginOtpCompletedAt = new Date().toISOString();

  const { error } = await supabase
    .from('users')
    .update({ metadata })
    .eq('id', user.id);

  if (error) throw error;
};

const buildAuthUserPayload = (userData) => ({
  id: userData.id,
  uid: userData.id,
  email: userData.email,
  displayName: userData.metadata?.displayName || userData.name || '',
  firstName: userData.metadata?.firstName || '',
  lastName: userData.metadata?.lastName || '',
  role: userData.role,
  emailVerified: Boolean(userData.email_verified),
});

const signInWithPassword = (credentials) =>
  getSupabaseAuthClient().auth.signInWithPassword(credentials);

const isEmailNotConfirmedAuthError = (error) => {
  const message = String(error?.message || error?.error_description || '').toLowerCase();
  return message.includes('email not confirmed') || message.includes('not confirmed');
};

const confirmSupabaseAuthEmail = async (userData, context = 'Login') => {
  if (!userData?.id) return false;

  const { data: currentAuthData, error: currentAuthError } = await supabase.auth.admin.getUserById(userData.id);
  if (!currentAuthError && currentAuthData?.user?.email_confirmed_at) {
    return true;
  }

  if (currentAuthError) {
    console.warn(`[${context}] Could not read Supabase Auth email confirmation:`, currentAuthError.message);
  }

  const { error } = await supabase.auth.admin.updateUserById(
    userData.id,
    { email_confirm: true }
  );

  if (error) {
    console.warn(`[${context}] Could not confirm Supabase Auth email:`, error.message);
    return false;
  }

  console.log(`[${context}] Supabase Auth email confirmation synchronized for:`, userData.email);
  return true;
};

const ensureSupabaseAuthEmailConfirmed = async (userData, context = 'Verify Email') => {
  const confirmed = await confirmSupabaseAuthEmail(userData, context);
  if (!confirmed) {
    const error = new Error('Supabase Auth email confirmation failed');
    error.code = 'AUTH_EMAIL_CONFIRMATION_FAILED';
    throw error;
  }
};

const signInWithVerifiedProfileRetry = async ({ email, password, profile, context = 'Login' }) => {
  let result = await signInWithPassword({ email, password });

  if (
    isEmailNotConfirmedAuthError(result.error) &&
    profile?.email_verified === true
  ) {
    console.warn(`[${context}] Supabase Auth email was not confirmed although profile is verified. Synchronizing and retrying once.`);
    const confirmed = await confirmSupabaseAuthEmail(profile, context);
    if (confirmed) {
      result = await signInWithPassword({ email, password });
    }
  }

  return result;
};

const isSystemGeneratedStudentEmail = (email = '') => {
  const normalizedEmail = String(email).toLowerCase();
  return normalizedEmail.endsWith('@linaw.local') || normalizedEmail.endsWith('@student.linawletra.ph');
};

const isStudentVerificationExempt = (userData) =>
  String(userData?.role || '').toLowerCase() === 'student' ||
  isSystemGeneratedStudentEmail(userData?.email);

const normalizeStudentLoginAccount = async (userData) => {
  if (!userData || !isStudentVerificationExempt(userData)) return userData;

  const metadata = {
    ...(userData.metadata || {}),
    firstLoginOtpCompleted: true,
    firstLoginOtpCompletedAt: userData.metadata?.firstLoginOtpCompletedAt || new Date().toISOString(),
  };

  const needsProfileUpdate =
    userData.email_verified !== true ||
    userData.metadata?.firstLoginOtpCompleted !== true;

  if (needsProfileUpdate) {
    const { data: updatedUser, error: updateError } = await supabase
      .from('users')
      .update({
        email_verified: true,
        metadata,
      })
      .eq('id', userData.id)
      .select('*')
      .single();

    if (updateError) throw updateError;
    userData = updatedUser;
  }

  await confirmSupabaseAuthEmail(userData, 'Login');

  return userData;
};

// Register - Creates Supabase Auth user + profile with id set to auth user id
export const register =async (req, res) => {
  const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const requestStartedAt = Date.now();
  const timedStep = (label, step) => runTimedRegistrationStep(requestId, label, step);

  try {
    console.log(`[Register API] [${requestId}] Request received at:`, new Date().toISOString());
    console.log(`[Register API] [${requestId}] Request body:`, {
      email: req.body.email,
      firstName: req.body.firstName,
      lastName: req.body.lastName,
      role: req.body.role,
    });

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error('[Register API] Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        errors: errors.array().map(err => ({
          field: err.param,
          message: err.msg,
        })),
      });
    }

    const { firstName, lastName, middleInitial, email, password, role } = req.body;
    const normalizedEmail = email.toLowerCase();

    if (!config.email.enabled) {
      console.error('[Register API] Email verification is not configured; refusing to create unverified account.');
      return res.status(503).json({
        success: false,
        message: 'Email verification is not configured on the server. Please contact support.',
        code: 'EMAIL_NOT_CONFIGURED',
      });
    }

    console.log(`[Register API] [${requestId}] Checking if user already exists:`, normalizedEmail);
    
    // Check if user profile already exists
    const { data: existingUser, error: checkError } = await timedStep('profile duplicate lookup', () =>
      supabase
        .from('users')
        .select('id, email, email_verified, metadata')
        .eq('email', normalizedEmail)
        .single()
    );

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('[Register API] Error checking existing user:', checkError);
      throw checkError;
    }

    if (existingUser) {
      console.log('[Register API] User already exists:', normalizedEmail);

      const existingAuthUser = await timedStep('existing auth user lookup', () => findAuthUserByEmail(normalizedEmail));
      if (!existingAuthUser) {
        console.warn('[Register API] Found stale profile without Supabase Auth user; removing profile before re-register:', normalizedEmail);
        await supabase.from('email_verification_codes').delete().eq('user_id', existingUser.id);
        const { error: staleDeleteError } = await supabase
          .from('users')
          .delete()
          .eq('id', existingUser.id);

        if (staleDeleteError) {
          console.error('[Register API] Failed to remove stale user profile:', staleDeleteError);
          return res.status(500).json({
            success: false,
            message: 'A stale account record is blocking registration. Please try again.',
          });
        }
      } else if (existingUser.email_verified) {
        return res.status(409).json({
          success: false,
          message: 'This email is already registered. Please log in instead.',
        });
      } else {
        const verificationCode = generateVerificationCode();
        const expiresAt = new Date(Date.now() + config.emailVerification.expiresInMinutes * 60 * 1000);
        const resendAvailableAt = new Date(Date.now() + config.emailVerification.resendCooldownSeconds * 1000);

        console.log('[Register API] Existing account is unverified; resending verification code:', normalizedEmail);

        try {
          const storedCode = await timedStep('store existing-user verification code', () => storeSignupVerificationCode(
            existingUser.id,
            normalizedEmail,
            verificationCode,
            expiresAt,
            resendAvailableAt
          ));
          console.log('[Register API] Verification code stored for existing unverified user in:', storedCode.source);
        } catch (codeError) {
          console.error('[Register API] Failed to store verification code for existing unverified user:', {
            message: codeError?.message,
            code: codeError?.code,
            hint: codeError?.hint,
            details: codeError?.details,
          });
          return res.status(500).json({
            success: false,
            message: process.env.NODE_ENV === 'development'
              ? `Registration failed: ${codeError?.message || 'Verification code save error'} (code: ${codeError?.code || 'N/A'}) - check server logs`
              : 'Registration failed. Please try again or contact support.',
          });
        }

        try {
          await timedStep('send existing-user verification email', () =>
            sendVerificationEmail(normalizedEmail, verificationCode, null, 'signup')
          );
          console.log('[Register API] Verification email resent for existing unverified user:', normalizedEmail);
        } catch (emailError) {
          console.error('[Register API] Failed to resend verification email for existing unverified user:', {
            message: emailError.message,
            code: emailError.code,
            status: emailError.status,
            response: emailError.response,
          });
          return sendEmailFailureResponse(
            res,
            'Registration found an unverified account, but the email service did not send the verification code. Please try again later.',
            emailError
          );
        }

        return res.status(200).json({
          success: true,
          message: 'This email already has an unverified account. We sent a new verification code.',
          email: normalizedEmail,
          userId: existingUser.id,
          requiresEmailVerification: true,
        });
      }
    }

    const fullName = `${firstName} ${middleInitial ? middleInitial + ' ' : ''}${lastName}`.trim();
    const userRole = role || 'parent';
    const profileMetadata = {
      displayName: fullName,
      firstName,
      lastName,
      middleInitial: middleInitial || null,
    };

    // Validate role
    const validRoles = ['admin', 'teacher', 'parent', 'student'];
    if (!validRoles.includes(userRole)) {
      console.error('[Register API] Invalid role provided:', userRole);
      return res.status(400).json({
        success: false,
        message: 'Invalid role specified',
      });
    }

    console.log(`[Register API] [${requestId}] Creating Supabase Auth user via admin.createUser:`, normalizedEmail);

    // Check if service role key is configured
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[Register API] âŒ SUPABASE_SERVICE_ROLE_KEY not found in environment');
      return res.status(500).json({
        success: false,
        message: 'Server configuration error',
      });
    }

    // Use admin.createUser instead of signUp to prevent Supabase auto-email.
    // LinawLetra sends and verifies its own OTP, then confirms Supabase Auth.
    let { data: authCreateData, error: authError } = await timedStep('create Supabase auth user', () => supabase.auth.admin.createUser({
      email: normalizedEmail,
      password: password,
      user_metadata: {
        role: userRole,
      },
      email_confirm: false,
    }));
    let authUser = authCreateData?.user;

    if (authError || !authUser) {
      console.error('[Register API] Failed to create auth user:', authError);
      const duplicateMessage = authError?.message?.toLowerCase().includes('already registered') ||
        authError?.message?.toLowerCase().includes('already exists') ||
        authError?.code === 'auth/email-already-in-use' ||
        authError?.code === 'email_exists';

      if (duplicateMessage) {
        const orphanAuthUser = await findAuthUserByEmail(normalizedEmail);
        if (orphanAuthUser?.id) {
          console.warn('[Register API] Found orphan Supabase Auth user without profile; deleting and retrying:', normalizedEmail);
          const { error: deleteOrphanError } = await supabase.auth.admin.deleteUser(orphanAuthUser.id);
          if (deleteOrphanError) {
            console.error('[Register API] Failed to delete orphan auth user:', deleteOrphanError);
          } else {
            const retryResult = await supabase.auth.admin.createUser({
              email: normalizedEmail,
              password,
              user_metadata: {
                role: userRole,
              },
              email_confirm: false,
            });
            authCreateData = retryResult.data;
            authError = retryResult.error;
            authUser = authCreateData?.user;
          }
        }
      }

      if (!authError && authUser) {
        console.log('[Register API] Auth user created after orphan cleanup:', { id: authUser.id, email: normalizedEmail });
      } else {
        return res.status(duplicateMessage ? 409 : 400).json({
          success: false,
          message: duplicateMessage
            ? 'This email is already registered. Please log in instead.'
            : authError?.message || 'Failed to create auth account',
        });
      }
    }

    console.log('[Register API] Auth user created:', { id: authUser.id, email: normalizedEmail, idType: typeof authUser.id });

    // Step 2: Create user profile with id set to auth user id
    console.log('[Register API] Creating user profile with id:', authUser.id);

    const { data: userProfile, error: insertError } = await timedStep('upsert user profile', () =>
      supabase
        .from('users')
        .upsert({
          id: authUser.id,
          email: normalizedEmail,
          name: fullName,
          role: userRole,
          email_verified: false,
          metadata: profileMetadata,
        }, { onConflict: 'id' })
        .select()
        .single()
    );

    if (insertError) {
      console.error('[Register API] Failed to create user profile:', {
        message: insertError.message,
        code: insertError.code,
        details: insertError.details,
        hint: insertError.hint,
      });
      console.error('[Register API] Insert payload was:', {
        id: authUser.id,
        email: normalizedEmail,
        name: fullName,
        role: role || 'parent',
        email_verified: false,
        metadata: profileMetadata,
      });

      // Clean up: delete auth user if profile creation fails
      console.log('[Register API] Cleaning up: Deleting auth user');
      await supabase.auth.admin.deleteUser(authUser.id);

      if (insertError.message.includes('row-level security policy')) {
        console.error('[Register API] âŒ RLS POLICY BLOCKED INSERT');
        console.error('[Register API] RLS Error Details:', {
          message: insertError.message,
          code: insertError.code,
          details: insertError.details,
          hint: insertError.hint,
        });
        return res.status(500).json({
          success: false,
          message: 'RLS policy is blocking user creation. Please ensure RLS is disabled or properly configured for inserts.',
          error: 'RLS_POLICY_BLOCKED',
          details: insertError.hint || insertError.message,
        });
      }

      if (insertError.message.includes('null value in column')) {
        console.error('[Register API] âŒ NULL CONSTRAINT - Required column is null');
        console.error('[Register API] Null Constraint Details:', {
          message: insertError.message,
          code: insertError.code,
          details: insertError.details,
          hint: insertError.hint,
        });
        return res.status(500).json({
          success: false,
          message: 'A required field is missing. Please ensure all required profile fields are provided.',
          error: 'NULL_CONSTRAINT',
          details: insertError.hint || insertError.message,
        });
      }

      if (insertError.message.includes('duplicate key value')) {
        console.error('[Register API] âŒ DUPLICATE KEY - User already exists');
        return res.status(400).json({
          success: false,
          message: 'Email already registered',
        });
      }

      return res.status(400).json({
        success: false,
        message: insertError.message || 'Failed to create user profile',
      });
    }

    if (!userProfile) {
      console.error('[Register API] No data returned from insert');
      await supabase.auth.admin.deleteUser(authUser.id);
      return res.status(500).json({
        success: false,
        message: 'User created but could not retrieve profile',
      });
    }

    console.log('[Register API] User profile created successfully:', {
      id: userProfile.id,
      email: userProfile.email,
      role: userProfile.role,
    });

    // Generate OTP verification code
    const verificationCode = generateVerificationCode();
    const expiresAt = new Date(Date.now() + config.emailVerification.expiresInMinutes * 60 * 1000);
    const resendAvailableAt = new Date(Date.now() + config.emailVerification.resendCooldownSeconds * 1000);

    console.log('[Register API] Storing verification code for:', normalizedEmail);

    try {
      const storedCode = await timedStep('store verification code', () => storeSignupVerificationCode(
        userProfile.id,
        normalizedEmail,
        verificationCode,
        expiresAt,
        resendAvailableAt
      ));
      console.log('[Register API] Verification code stored in:', storedCode.source);
    } catch (codeError) {
      console.error('[Register API] Failed to store verification code:', {
        message: codeError?.message,
        code: codeError?.code,
        hint: codeError?.hint,
        details: codeError?.details,
      });
      await supabase.from('users').delete().eq('id', authUser.id);
      await supabase.auth.admin.deleteUser(authUser.id);
      return res.status(500).json({
        success: false,
        message: process.env.NODE_ENV === 'development'
          ? `Registration failed: ${codeError?.message || 'Verification code save error'} (code: ${codeError?.code || 'N/A'}) - check server logs`
          : 'Registration failed. Please try again or contact support.',
      });
    }

    // Send verification email with OTP before returning success
    console.log('[Register API] Sending verification email with OTP');
    try {
      await timedStep('send verification email', () =>
        sendVerificationEmail(normalizedEmail, verificationCode, null, 'signup')
      );
      console.log('[Register API] âœ“ Verification email sent successfully');
    } catch (emailError) {
      console.error('[Register API] âŒ Failed to send verification email:', {
        message: emailError.message,
        code: emailError.code,
        status: emailError.status,
        response: emailError.response,
      });
      console.error('[Register API] âŒ Cleaning up created user because email delivery failed');
      await supabase.from('email_verification_codes').delete().eq('user_id', authUser.id);
      await supabase.from('users').delete().eq('id', authUser.id);
      await supabase.auth.admin.deleteUser(authUser.id);
      return sendEmailFailureResponse(
        res,
        'Registration failed because the email service did not send the verification code. Please try again later.',
        emailError
      );
    }

    console.log(`[Register API] [${requestId}] Registration successful for: ${normalizedEmail} in ${Date.now() - requestStartedAt}ms`);
    res.status(201).json({
      success: true,
      message: 'Registration successful. Please check your email for verification code.',
      email: normalizedEmail,
      userId: userProfile.id,
      requiresEmailVerification: true,
    });
  } catch (error) {
    console.error(`[Register API] [${requestId}] Unexpected registration error after ${Date.now() - requestStartedAt}ms:`, {
      message: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      success: false,
      message: error.message || 'Registration failed',
    });
  }
};

// Create user profile after Supabase signUp
export const createProfile =async (req, res) => {
  try {
    console.log('[Create Profile API] Request received at:', new Date().toISOString());
    console.log('[Create Profile API] Request headers:', req.headers);
    console.log('[Create Profile API] Request body:', req.body);
    console.log('[Create Profile API] Request URL:', req.originalUrl);

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error('[Create Profile API] Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        errors: errors.array().map(err => ({
          field: err.param,
          message: err.msg,
        })),
      });
    }

    const { userId, firstName, lastName, middleInitial, email, role } = req.body;
    const normalizedEmail = email.toLowerCase();

    console.log('[Create Profile API] Creating profile for userId:', userId);

    // Check if profile already exists by userId
    const { data: existingProfile, error: checkError } = await supabase
      .from('users')
      .select('id')
      .eq('id', userId)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('[Create Profile API] Error checking existing profile:', checkError);
      throw checkError;
    }

    if (existingProfile) {
      console.log('[Create Profile API] Profile already exists for userId:', userId);
      return res.status(200).json({
        success: true,
        message: 'Profile already exists',
      });
    }

    // Check if email already exists (from orphaned profile or duplicate registration)
    const { data: existingEmail, error: emailCheckError } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', normalizedEmail)
      .single();

    if (emailCheckError && emailCheckError.code !== 'PGRST116') {
      console.error('[Create Profile API] Error checking email:', emailCheckError);
      throw emailCheckError;
    }

    if (existingEmail) {
      console.warn('[Create Profile API] Email already exists in database:', normalizedEmail);
      console.warn('[Create Profile API] Existing user ID:', existingEmail.id);
      
      // If it's the same user ID, return success (it was created successfully before)
      if (existingEmail.id === userId) {
        return res.status(200).json({
          success: true,
          message: 'Profile already exists',
        });
      }
      
      // If it's a different user ID, this is a duplicate email error
      return res.status(409).json({
        success: false,
        message: 'Email already registered. Please use a different email or log in.',
      });
    }

    const fullName = `${firstName} ${middleInitial ? middleInitial + ' ' : ''}${lastName}`.trim();
    const userRole = role || 'parent';
    const profileMetadata = {
      displayName: fullName,
      firstName,
      lastName,
      middleInitial: middleInitial || null,
    };

    // Validate role
    const validRoles = ['admin', 'teacher', 'parent', 'student'];
    if (!validRoles.includes(userRole)) {
      console.error('[Create Profile API] Invalid role provided:', userRole);
      return res.status(400).json({
        success: false,
        message: 'Invalid role specified',
      });
    }

    console.log('[Create Profile API] Inserting user profile:', {
      userId,
      email: normalizedEmail,
      fullName,
      role: userRole,
    });

    // Create user profile
    const { data: userProfile, error: insertError } = await supabase
      .from('users')
      .upsert({
        id: userId,
        email: normalizedEmail,
        name: fullName,
        role: userRole,
        email_verified: false,
        metadata: profileMetadata,
      }, { onConflict: 'id' })
      .select()
      .single();

    if (insertError) {
      console.error('[Create Profile API] Failed to create user profile:', {
        message: insertError.message,
        code: insertError.code,
        details: insertError.details,
        hint: insertError.hint,
        fullError: JSON.stringify(insertError),
      });
      
      // Handle specific error codes
      if (insertError.code === '23505') {
        // Unique constraint violation
        return res.status(409).json({
          success: false,
          message: 'This email is already registered. Please use a different email.',
        });
      }
      
      // Attempt to clean up the corresponding Supabase Auth user so email can be reused
      try {
        console.log('[Create Profile API] Cleaning up auth user due to profile insert failure:', userId);
        const { error: deleteAuthErr } = await supabase.auth.admin.deleteUser(userId);
        if (deleteAuthErr) {
          console.error('[Create Profile API] Failed to delete auth user during cleanup:', deleteAuthErr);
        } else {
          console.log('[Create Profile API] Auth user deleted during cleanup:', userId);
        }
      } catch (cleanupErr) {
        console.error('[Create Profile API] Cleanup deleteUser error:', cleanupErr);
      }

      throw insertError;
    }

    console.log('[Create Profile API] âœ“ Profile created successfully for:', normalizedEmail);
    res.status(201).json({
      success: true,
      message: 'Profile created successfully',
      userId: userProfile.id,
    });
  } catch (error) {
    console.error('[Create Profile API] âŒ Unexpected error:', {
      message: error.message,
      code: error.code,
      details: error.details,
      stack: error.stack,
    });
    res.status(500).json({
      success: false,
      message: error.message || 'Profile creation failed. Please ensure you are using valid credentials.',
    });
  }
};

// Send email verification code for Supabase signup flow
export const sendEmailVerificationCode =async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { email, code, type = 'signup' } = req.body;
    console.log(`[Email Verification] Sending ${type} code to: ${email}`);

    const normalizedEmail = email.toLowerCase();
    const verificationCode = code || generateVerificationCode();
    const expiresAt = new Date(Date.now() + config.emailVerification.expiresInMinutes * 60 * 1000);

    const { data: existingUser, error: findError } = await supabase
      .from('users')
      .select('id')
      .eq('email', normalizedEmail)
      .single();

    if (findError && findError.code !== 'PGRST116') {
      console.error('[Email Verification] User lookup failed:', findError);
      throw findError;
    }

    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: 'Email not found',
      });
    }

    try {
      const storedCode = await storeSignupVerificationCode(
        existingUser.id,
        normalizedEmail,
        verificationCode,
        expiresAt,
        new Date(Date.now() + config.emailVerification.resendCooldownSeconds * 1000)
      );
      console.log('[Email Verification] Verification code stored in:', storedCode.source);
    } catch (codeError) {
      console.error('[Email Verification] Failed to store code:', codeError);
      throw codeError;
    }

    try {
      await sendVerificationEmail(normalizedEmail, verificationCode, null, type);
      console.log(`[Email Verification] ${type} email sent`);
    } catch (emailError) {
      console.error(`[Email Verification] Failed to send ${type} email:`, emailError.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to send verification email. Please try again later.',
      });
    }

    res.json({
      success: true,
      message: 'Verification code sent successfully.',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Send newly generated student credentials to the parent email address
export const sendStudentEnrollmentDetails =async (req, res) => {
  try {
    const { parentEmail, childName, childUsername, childPassword, gradeLevel, readingLevel } = req.body;
    const learnerProfile = [
      gradeLevel ? `Grade ${gradeLevel}` : '',
      readingLevel ? `${readingLevel} reading level` : '',
    ].filter(Boolean).join(' â€¢ ');

    const emailSent = await sendStudentEnrollmentEmail(
      parentEmail,
      childName,
      childUsername,
      childPassword,
      learnerProfile
    );

    if (!emailSent) {
      return res.status(500).json({
        success: false,
        message: 'Student credentials were generated, but the email could not be sent.',
      });
    }

    return res.json({
      success: true,
      message: 'Student credentials sent to the parent email successfully.',
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Verify Email
export const verifyEmail =async (req, res) => {
  try {
    console.log('[Verify Email] Request body:', {
      email: req.body?.email,
      hasCode: Boolean(req.body?.code || req.body?.verificationCode),
    });
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error('[Verify Email] Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array().map(err => ({
          field: err.param,
          message: err.msg,
        })),
      });
    }

    const { email, code, verificationCode } = req.body;
    const providedCode = code || verificationCode;
    const normalizedEmail = email.toLowerCase();

    if (!providedCode) {
      return res.status(400).json({
        success: false,
        message: 'Verification code is required',
      });
    }

    console.log('[Verify Email] Verifying code for:', normalizedEmail);

    // Get user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, name, role, email_verified, metadata')
      .eq('email', normalizedEmail)
      .single();

    if (userError || !user) {
      console.error('[Verify Email] User not found:', userError);
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Check if already verified
    if (user.email_verified) {
      return res.status(400).json({
        success: false,
        message: 'Email already verified',
      });
    }

    const codeLookup = await getSignupVerificationCode(user);
    const codeRecord = codeLookup?.record;

    if (!codeRecord) {
      console.error('[Verify Email] No verification code found for:', normalizedEmail);
      return res.status(404).json({
        success: false,
        message: 'Verification code not found or has expired',
      });
    }

    // Check expiration
    if (new Date() > new Date(codeRecord.expires_at)) {
      console.warn('[Verify Email] Verification code expired');
      return res.status(400).json({
        success: false,
        message: 'Verification code has expired',
      });
    }

    // Verify code (plain text comparison since we store it plainly)
    if (codeRecord.code !== providedCode) {
      console.warn('[Verify Email] Invalid verification code provided');
      if (codeLookup.source === 'table' && codeRecord.id) {
        await supabase
          .from('email_verification_codes')
          .update({ attempts: (codeRecord.attempts || 0) + 1 })
          .eq('id', codeRecord.id);
      } else {
        await updateSignupVerificationAttempts(user, codeRecord);
      }
      
      return res.status(400).json({
        success: false,
        message: 'Invalid verification code',
      });
    }

    // Confirm Supabase Auth first. If this fails, do not mark the app profile
    // as verified; both auth systems must agree before verification succeeds.
    try {
      await ensureSupabaseAuthEmailConfirmed(user, 'Verify Email');
    } catch (authConfirmError) {
      console.error('[Verify Email] Failed to confirm Supabase Auth email:', {
        message: authConfirmError.message,
        code: authConfirmError.code,
      });
      return res.status(503).json({
        success: false,
        message: 'We could not finish email verification right now. Please try again.',
        code: authConfirmError.code || 'AUTH_EMAIL_CONFIRMATION_FAILED',
      });
    }

    // Mark email as verified in database only after Supabase Auth is confirmed.
    console.log('[Verify Email] Marking email verified for:', normalizedEmail);
    const { error: updateError } = await supabase
      .from('users')
      .update({
        email_verified: true,
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('[Verify Email] Failed to update user:', updateError);
      throw updateError;
    }

    // Delete used verification code
    if (codeLookup.source === 'table' && codeRecord.id) {
      await supabase
        .from('email_verification_codes')
        .delete()
        .eq('id', codeRecord.id);
    } else {
      await clearSignupVerificationCode(user);
    }

    console.log('[Verify Email] âœ“ Email verified successfully');
    // Generate a Supabase access token for the user so frontend can use it
    try {
      const { data: { session } = {}, error: sessionError } = await supabase.auth.admin.generateAccessTokenForUser(
        user.id
      );

      if (sessionError || !session?.access_token) {
        console.warn('[Verify Email] Failed to generate access token:', sessionError);
        // Return success without token (frontend will redirect to login)
        return res.json({
          success: true,
          message: 'Email verified successfully',
        });
      }

      const token = session.access_token;

      // Prepare user payload to return to frontend
      const userPayload = {
        id: user.id,
        uid: user.id,
        email: user.email,
        displayName: user.metadata?.displayName || user.name || null,
        firstName: user.metadata?.firstName || null,
        lastName: user.metadata?.lastName || null,
        role: user.role || null,
        emailVerified: true,
      };

      return res.json({
        success: true,
        message: 'Email verified successfully',
        token,
        user: userPayload,
      });
    } catch (tokenErr) {
      console.error('[Verify Email] Token generation error:', tokenErr);
      return res.json({ success: true, message: 'Email verified successfully' });
    }
  } catch (error) {
    console.error('[Verify Email] Unexpected error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Resend Verification Code
// Resend Verification Code
export const resendVerificationCode =async (req, res) => {
  try {
    console.log('[Resend Verification] Request body:', req.body);
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error('[Resend Verification] Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array().map(err => ({
          field: err.param,
          message: err.msg,
        })),
      });
    }

    const { email } = req.body;
    const normalizedEmail = email.toLowerCase();
    console.log('[Resend Verification] Processing for:', normalizedEmail);

    // Get user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, email_verified, metadata')
      .eq('email', normalizedEmail)
      .single();

    if (userError || !user) {
      console.error('[Resend Verification] User not found:', userError);
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // If already verified, no need to resend
    if (user.email_verified) {
      return res.status(400).json({
        success: false,
        message: 'Email already verified',
      });
    }

    // Generate new verification code
    const verificationCode = generateVerificationCode();
    const expiresAt = new Date(Date.now() + config.emailVerification.expiresInMinutes * 60 * 1000);
    const resendAvailableAt = new Date(Date.now() + config.emailVerification.resendCooldownSeconds * 1000);

    console.log('[Resend Verification] Checking last code for rate limit:', user.id);

    // Check last code for resend cooldown
    const lastCodeLookup = await getSignupVerificationCode(user);
    const lastCode = lastCodeLookup?.record;

    if (lastCode?.resend_available_at) {
      const resendAt = new Date(lastCode.resend_available_at).getTime();
      const now = Date.now();
      if (now < resendAt) {
        const remaining = Math.ceil((resendAt - now) / 1000);
        console.log('[Resend Verification] Rate limited, remaining seconds:', remaining);
        return res.status(429).json({
          success: false,
          message: `Please wait ${remaining} seconds before requesting another verification email.`,
          cooldownRemaining: remaining,
        });
      }
    }

    console.log('[Resend Verification] Storing new code for:', user.id);

    try {
      const storedCode = await storeSignupVerificationCode(
        user.id,
        normalizedEmail,
        verificationCode,
        expiresAt,
        resendAvailableAt
      );
      console.log('[Resend Verification] Verification code stored in:', storedCode.source);
    } catch (storeError) {
      console.error('[Resend Verification] Failed to store code:', storeError);
      throw storeError;
    }

    console.log('[Resend Verification] Sending email to:', normalizedEmail);
    try {
      await sendVerificationEmail(normalizedEmail, verificationCode);
      console.log('[Resend Verification] âœ“ Email sent');
    } catch (emailError) {
      console.error('[Resend Verification] âŒ Failed to send email:', {
        message: emailError.message,
        code: emailError.code,
        status: emailError.status,
        response: emailError.response,
      });
      return sendEmailFailureResponse(
        res,
        'Email service did not send the verification code. Please try again later.',
        emailError
      );
    }

    res.json({
      success: true,
      message: 'Verification code sent to your email. Please check your inbox and spam folder.',
    });
  } catch (error) {
    console.error('[Resend Verification] Error:', error.message, error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to send verification code. Please try again later.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// Login - Authenticate with Supabase Auth and return profile data
export const login =async (req, res) => {
  try {
    console.log('[Login] Request received');
    console.log('   Body:', {
      email: req.body?.email,
      hasPassword: Boolean(req.body?.password),
    });

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error('[Login] Validation failed:', errors.array());
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { email, password } = req.body;
    const normalizedEmail = email.toLowerCase();

    let { data: existingProfile, error: existingProfileError } = await supabase
      .from('users')
      .select('*')
      .ilike('email', normalizedEmail)
      .maybeSingle();

    if (existingProfileError) {
      console.error('[Login] Failed to check existing profile:', existingProfileError.message);
      throw existingProfileError;
    }

    if (isStudentVerificationExempt(existingProfile)) {
      existingProfile = await normalizeStudentLoginAccount(existingProfile);
    }

    if (existingProfile?.email_verified === true) {
      await confirmSupabaseAuthEmail(existingProfile, 'Login');
    }

    console.log('[Login] Attempting Supabase auth for:', normalizedEmail);

    const { data: authData, error: authError } = await signInWithVerifiedProfileRetry({
      email: normalizedEmail,
      password,
      profile: existingProfile,
    });

    if (authError || !authData?.user) {
      console.error('[Login] Supabase authentication failed:', authError?.message || authError);
      if (isEmailNotConfirmedAuthError(authError) && existingProfile) {
        if (existingProfile.email_verified) {
          return res.status(503).json({
            success: false,
            message: 'Your account verification is out of sync. Please contact support to repair the account confirmation state.',
            code: 'AUTH_EMAIL_CONFIRMATION_SYNC_FAILED',
          });
        }

        return res.status(403).json({
          success: false,
          message: 'Please verify your email before logging in.',
          requiresEmailVerification: true,
        });
      }
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    console.log('[Login] Auth successful, fetching profile for user id:', authData.user.id);


    let { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (userError || !userData) {
      console.warn('[Login] User profile not found for auth user id:', authData.user.id, userError?.message || 'no profile. Attempting auto-create.');
      // Try to auto-create the missing user profile
      const newProfile = {
        id: authData.user.id,
        email: authData.user.email,
        name: authData.user.user_metadata?.displayName || authData.user.email,
        role: authData.user.user_metadata?.role || 'student',
        email_verified: authData.user.email_confirmed_at ? true : false,
        metadata: authData.user.user_metadata || {},
      };
      const { data: inserted, error: insertError } = await supabase
        .from('users')
        .insert([newProfile])
        .select()
        .single();
      if (insertError || !inserted) {
        console.error('[Login] Failed to auto-create user profile:', insertError?.message || 'insert failed');
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch or create user profile',
        });
      }
      userData = inserted;
    }

    userData = await normalizeStudentLoginAccount(userData);


    // TEACHER: Skip email verification and OTP
    if (userData.role === 'teacher') {
      console.log('[Login] Teacher login: bypassing email verification and OTP.');
    } else {
      if (!userData.email_verified && !isStudentVerificationExempt(userData)) {
        return res.status(403).json({
          success: false,
          message: 'Please verify your email before logging in.',
          requiresEmailVerification: true,
        });
      }

      if (userData.role !== 'admin' &&
        !isStudentVerificationExempt(userData) &&
        userData.metadata?.firstLoginOtpCompleted !== true) {
        try {
          await markFirstLoginOtpCompleted(userData);
          userData = {
            ...userData,
            metadata: {
              ...(userData.metadata || {}),
              firstLoginOtpCompleted: true,
              firstLoginOtpCompletedAt: new Date().toISOString(),
            },
          };
        } catch (metadataError) {
          console.warn('[Login] Could not mark first-login OTP as completed:', metadataError.message);
        }
      }
    }

    console.log('[Login] âœ“ Login successful for:', normalizedEmail);
    res.json({
      success: true,
      message: 'Login successful',
      token: authData.session?.access_token,
      user: buildAuthUserPayload(userData),
      session: authData.session,
    });
  } catch (error) {
    console.error('[Login] Error:', error.message, error.stack);
    res.status(500).json({
      success: false,
      message: error.message || 'Login failed',
    });
  }
};

// Send OTP for Login (2FA)
export const sendLoginOTP =async (req, res) => {
  try {
    console.log('[Send Login OTP] Request received');
    console.log('   Body:', {
      email: req.body?.email,
      hasPassword: Boolean(req.body?.password),
    });

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error('[Send Login OTP] Validation failed:', errors.array());
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { email, password } = req.body;
    const normalizedEmail = email.toLowerCase();

    console.log('[Send Login OTP] Processing for:', normalizedEmail);

    // Get user from database (case-insensitive email lookup)
    let { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .ilike('email', normalizedEmail)
      .single();

    if (userError || !userData) {
      console.log('[Send Login OTP] User not found:', normalizedEmail);
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    if (isStudentVerificationExempt(userData)) {
      userData = await normalizeStudentLoginAccount(userData);
    }

    // Check if email is verified
    if (!userData.email_verified && !isStudentVerificationExempt(userData)) {
      console.log('[Send Login OTP] Email not verified for:', normalizedEmail);
      return res.status(403).json({
        success: false,
        message: 'Please verify your email before logging in',
        requiresEmailVerification: true,
      });
    }

    const { data: authData, error: authError } = await signInWithVerifiedProfileRetry({
      email: normalizedEmail,
      password,
      profile: userData,
      context: 'Send Login OTP',
    });

    if (authError || !authData?.session) {
      console.error('[Send Login OTP] Password verification failed:', authError?.message || authError);
      if (isEmailNotConfirmedAuthError(authError) && !userData.email_verified) {
        return res.status(403).json({
          success: false,
          message: 'Please verify your email before logging in',
          requiresEmailVerification: true,
        });
      }
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    // Generate OTP code for 2FA
    if (userData.role === 'admin' || isStudentVerificationExempt(userData) || userData.metadata?.firstLoginOtpCompleted === true) {
      console.log('[Send Login OTP] OTP no longer required for:', normalizedEmail);
      return res.json({
        success: true,
        message: 'Login successful',
        skipOtp: true,
        token: authData.session?.access_token,
        user: buildAuthUserPayload(userData),
        session: authData.session,
      });
    }

    const otpCode = generateVerificationCode();
    await storeLoginOtp(userData, otpCode, authData.session);

    console.log('[Send Login OTP] Generated OTP for:', normalizedEmail);

    console.log('[Send Login OTP] Sending OTP email...');
    try {
      await sendVerificationEmail(normalizedEmail, otpCode, null, 'login');
      console.log('[Send Login OTP] âœ“ OTP email sent');
    } catch (emailError) {
      console.error('[Send Login OTP] âŒ Failed to send OTP email:', emailError.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to send login OTP email. Please try again later.',
      });
    }

    res.json({
      success: true,
      message: 'OTP sent to your email',
      emailSent: true,
    });
  } catch (error) {
    console.error('[Send Login OTP] Error:', error.message, error.stack);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to send OTP',
    });
  }
};

// Verify Login OTP
export const verifyLoginOTP =async (req, res) => {
  try {
    console.log('[Verify Login OTP] Request received');
    console.log('   Body:', {
      email: req.body?.email,
      hasOtpCode: Boolean(req.body?.otpCode),
    });

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error('[Verify Login OTP] Validation failed:', errors.array());
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { email, otpCode } = req.body;
    const normalizedEmail = email.toLowerCase();

    console.log('[Verify Login OTP] Verifying OTP for:', normalizedEmail);

    // Get user
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('email', normalizedEmail)
      .single();

    if (userError || !userData) {
      console.error('[Verify Login OTP] User not found:', userError);
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    if (userData.role === 'admin') {
      console.warn('[Verify Login OTP] Admin account does not require OTP:', normalizedEmail);
      return res.status(400).json({
        success: false,
        message: 'Admin accounts do not require OTP verification',
      });
    }

    const otpRecord = userData.metadata?.loginOtp;

    if (!otpRecord) {
      console.error('[Verify Login OTP] No OTP found for:', normalizedEmail);
      return res.status(404).json({
        success: false,
        message: 'OTP not found or has expired',
      });
    }

    // Check expiration
    if (new Date() > new Date(otpRecord.expires_at)) {
      console.warn('[Verify Login OTP] OTP expired');
      return res.status(400).json({
        success: false,
        message: 'OTP has expired. Please request a new one.',
      });
    }

    // Check attempts (max 5)
    if ((otpRecord.attempts || 0) >= 5) {
      console.warn('[Verify Login OTP] Too many attempts');
      return res.status(429).json({
        success: false,
        message: 'Too many failed attempts. Please request a new OTP.',
      });
    }

    // Verify OTP
    if (otpRecord.code !== otpCode) {
      console.warn('[Verify Login OTP] Invalid OTP provided');
      await updateLoginOtpAttempts(userData, otpRecord);

      return res.status(400).json({
        success: false,
        message: 'Invalid OTP code',
      });
    }

    // OTP verified successfully
    console.log('[Verify Login OTP] âœ“ OTP verified for:', normalizedEmail);

    const token = otpRecord.access_token;

    if (!token) {
      console.error('[Verify Login OTP] Stored OTP is missing session token');
      return res.status(500).json({
        success: false,
        message: 'Failed to create session. Please try again.',
      });
    }

    await markFirstLoginOtpCompleted(userData);

    // Store token in localStorage equivalent (you might want to use Redis in production)
    // For now, we'll just return the user data

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: userData.id,
        uid: userData.id, // Add uid field for compatibility with frontend
        email: userData.email,
        displayName: userData.metadata?.displayName || userData.name || '',
        firstName: userData.metadata?.firstName || '',
        lastName: userData.metadata?.lastName || '',
        role: userData.role,
        emailVerified: true, // User has verified email by completing OTP verification
      },
    });
  } catch (error) {
    console.error('[Verify Login OTP] Error:', error.message, error.stack);
    res.status(500).json({
      success: false,
      message: error.message || 'OTP verification failed',
    });
  }
};

// Resend Login OTP (for existing login attempts)
export const resendLoginOTP =async (req, res) => {
  try {
    console.log('[Resend Login OTP] Request received');
    console.log('   Body:', {
      email: req.body?.email,
    });

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error('[Resend Login OTP] Validation failed:', errors.array());
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { email } = req.body;
    const normalizedEmail = email.toLowerCase();

    console.log('[Resend Login OTP] Processing for:', normalizedEmail);

    // Get user from database
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('email', normalizedEmail)
      .single();

    if (userError || !userData) {
      console.log('[Resend Login OTP] User not found:', normalizedEmail);
      return res.status(401).json({
        success: false,
        message: 'Invalid email',
      });
    }

    if (isStudentVerificationExempt(userData)) {
      await normalizeStudentLoginAccount(userData);
      return res.status(400).json({
        success: false,
        message: 'Student accounts do not require a login verification code.',
        skipOtp: true,
      });
    }

    // Check if email is verified
    if (!userData.email_verified) {
      console.log('[Resend Login OTP] Email not verified for:', normalizedEmail);
      return res.status(403).json({
        success: false,
        message: 'Please verify your email before logging in',
        requiresEmailVerification: true,
      });
    }

    const existingOtp = userData.metadata?.loginOtp;

    if (existingOtp) {
      // Check rate limit (60 seconds cooldown)
      const lastSent = new Date(existingOtp.created_at);
      const cooldownPeriod = 60 * 1000; // 60 seconds
      const timeSinceLastSend = Date.now() - lastSent.getTime();

      if (timeSinceLastSend < cooldownPeriod) {
        const remainingTime = Math.ceil((cooldownPeriod - timeSinceLastSend) / 1000);
        console.log('[Resend Login OTP] Rate limited, remaining:', remainingTime, 'seconds');
        return res.status(429).json({
          success: false,
          message: `Please wait ${remainingTime} seconds before requesting another OTP`,
          cooldownRemaining: remainingTime,
        });
      }
    }

    const tokenSession = existingOtp && existingOtp.access_token
      ? {
          access_token: existingOtp.access_token,
          refresh_token: existingOtp.refresh_token || null,
        }
      : null;

    // Generate new OTP code
    const otpCode = generateVerificationCode();
    await storeLoginOtp(userData, otpCode, tokenSession);

    console.log('[Resend Login OTP] Generated new OTP for:', normalizedEmail);

    // Send OTP email asynchronously (don't wait for it)
    console.log('[Resend Login OTP] Queuing OTP email...');
    setImmediate(async () => {
      try {
        await sendVerificationEmail(normalizedEmail, otpCode, null, 'login');
        console.log('[Resend Login OTP] âœ“ OTP email sent');
      } catch (emailError) {
        console.warn('[Resend Login OTP] âš  Failed to send OTP email:', emailError.message);
      }
    });

    res.json({
      success: true,
      message: 'OTP sent successfully',
      emailSent: true,
    });
  } catch (error) {
    console.error('[Resend Login OTP] Error:', error.message, error.stack);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to resend OTP',
    });
  }
};

// Forgot Password - Request Reset Code
export const forgotPassword =async (req, res) => {
  try {
    console.log('[Forgot Password] Request received for:', req.body?.email);

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { email } = req.body;
    const normalizedEmail = String(email).toLowerCase().trim();

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      // Don't reveal if email exists for security
      return res.json({
        success: true,
        message: 'If email exists, reset code will be sent',
      });
    }

    // Generate reset code
    const resetCode = generateVerificationCode();
    const hashedCode = hashCode(resetCode);

    const resetRecord = {
      code: hashedCode,
      expires_at: config.getPasswordResetExpiry().toISOString(),
      attempts: 0,
      created_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabase
      .from('users')
      .update({
        metadata: {
          ...(user.metadata || {}),
          passwordReset: resetRecord,
        },
      })
      .eq('id', user.id);

    if (updateError) throw updateError;

    // Send reset email
    const emailSent = await sendPasswordResetEmail(normalizedEmail, resetCode);
    if (!emailSent) {
      return res.status(503).json({
        success: false,
        message: 'Password reset email service is temporarily unavailable. Please try again shortly.',
      });
    }

    res.json({
      success: true,
      message: 'If email exists, reset code will be sent',
    });
  } catch (error) {
    console.error('[Forgot Password] Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Password reset request failed. Please try again shortly.',
    });
  }
};

// Reset Password - Verify Code and Set New Password
export const resetPassword =async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { email, resetCode, newPassword } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const resetRecord = user.metadata?.passwordReset;

    if (!resetRecord) {
      return res.status(400).json({
        success: false,
        message: 'Reset code not found. Please request a new one.',
      });
    }

    // Verify code expiration
    if (!verifyCodeExpiration(new Date(resetRecord.expires_at))) {
      return res.status(400).json({
        success: false,
        message: 'Reset code has expired',
      });
    }

    if ((resetRecord.attempts || 0) >= 5) {
      return res.status(429).json({
        success: false,
        message: 'Too many failed attempts. Please request a new reset code.',
      });
    }

    // Verify code
    const hashedInputCode = hashCode(resetCode);
    if (hashedInputCode !== resetRecord.code) {
      await supabase
        .from('users')
        .update({
          metadata: {
            ...(user.metadata || {}),
            passwordReset: {
              ...resetRecord,
              attempts: (resetRecord.attempts || 0) + 1,
            },
          },
        })
        .eq('id', user.id);

      return res.status(400).json({
        success: false,
        message: 'Invalid reset code',
      });
    }

    const { error: authUpdateError } = await supabase.auth.admin.updateUserById(
      user.id,
      { password: newPassword }
    );

    if (authUpdateError) throw authUpdateError;

    const metadata = { ...(user.metadata || {}) };
    delete metadata.passwordReset;

    const { error: clearError } = await supabase
      .from('users')
      .update({ metadata })
      .eq('id', user.id);

    if (clearError) throw clearError;

    res.json({
      success: true,
      message: 'Password reset successfully. Please log in.',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Verify Reset Code Only
export const verifyResetCode =async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { email, resetCode } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const resetRecord = user.metadata?.passwordReset;

    if (!resetRecord) {
      return res.status(400).json({
        success: false,
        message: 'Reset code not found. Please request a new one.',
      });
    }

    // Verify code expiration
    if (!verifyCodeExpiration(new Date(resetRecord.expires_at))) {
      return res.status(400).json({
        success: false,
        message: 'Reset code has expired',
      });
    }

    // Verify code
    const hashedInputCode = hashCode(resetCode);
    if (hashedInputCode !== resetRecord.code) {
      return res.status(400).json({
        success: false,
        message: 'Invalid reset code',
      });
    }

    res.json({
      success: true,
      message: 'Reset code verified successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

