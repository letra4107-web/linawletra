const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const config = require('../config');
const { supabase, getSupabaseAuthClient } = require('../config/supabase');
const bcrypt = require('bcryptjs');
const {
  generateVerificationCode,
  hashCode,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendStudentEnrollmentEmail,
  verifyCodeExpiration,
} = require('../services/emailService');

const VERIFICATION_TABLE_MISSING = 'PGRST205';

const buildVerificationRecord = (code, expiresAt, resendAvailableAt) => ({
  code,
  expires_at: expiresAt.toISOString(),
  resend_available_at: resendAvailableAt.toISOString(),
  attempts: 0,
  created_at: new Date().toISOString(),
});

const storeSignupVerificationCode = async (userId, email, code, expiresAt, resendAvailableAt) => {
  const record = buildVerificationRecord(code, expiresAt, resendAvailableAt);

  const { error: tableError } = await supabase
    .from('email_verification_codes')
    .insert({
      user_id: userId,
      email,
      code,
      expires_at: expiresAt,
      resend_available_at: resendAvailableAt,
      attempts: 0,
    });

  if (!tableError) {
    return { source: 'table', record };
  }

  if (tableError.code !== VERIFICATION_TABLE_MISSING) {
    throw tableError;
  }

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('metadata')
    .eq('id', userId)
    .single();

  if (userError) throw userError;

  const metadata = {
    ...(user?.metadata || {}),
    emailVerification: record,
  };

  const { error: updateError } = await supabase
    .from('users')
    .update({ metadata })
    .eq('id', userId);

  if (updateError) throw updateError;

  return { source: 'metadata', record };
};

const getSignupVerificationCode = async (user) => {
  const { data: tableRecord, error: tableError } = await supabase
    .from('email_verification_codes')
    .select('*')
    .eq('user_id', user.id)
    .eq('email', user.email)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!tableError && tableRecord) {
    return { source: 'table', record: tableRecord };
  }

  if (tableError && tableError.code !== VERIFICATION_TABLE_MISSING) {
    throw tableError;
  }

  const metadataRecord = user.metadata?.emailVerification;
  if (!metadataRecord) return null;
  return { source: 'metadata', record: metadataRecord };
};

const updateSignupVerificationAttempts = async (user, record) => {
  const metadata = {
    ...(user.metadata || {}),
    emailVerification: {
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

const clearSignupVerificationCode = async (user) => {
  const nextMetadata = { ...(user.metadata || {}) };
  delete nextMetadata.emailVerification;

  const { error } = await supabase
    .from('users')
    .update({ metadata: nextMetadata })
    .eq('id', user.id);

  if (error) throw error;
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

  const { error: authUpdateError } = await supabase.auth.admin.updateUserById(
    userData.id,
    { email_confirm: true }
  );

  if (authUpdateError) {
    console.warn('[Login] Could not confirm student auth email:', authUpdateError.message);
  }

  return userData;
};

// Register - Creates Supabase Auth user + profile with id set to auth user id
exports.register = async (req, res) => {
  try {
    console.log('[Register API] Request received at:', new Date().toISOString());
    console.log('[Register API] Request body:', {
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

    console.log('[Register API] Checking if user already exists:', normalizedEmail);
    
    // Check if user profile already exists
    const { data: existingUser, error: checkError } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', normalizedEmail)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('[Register API] Error checking existing user:', checkError);
      throw checkError;
    }

    if (existingUser) {
      console.log('[Register API] User already exists:', normalizedEmail);
      return res.status(409).json({
        success: false,
        message: 'This email is already registered. Please log in instead.',
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
      console.error('[Register API] Invalid role provided:', userRole);
      return res.status(400).json({
        success: false,
        message: 'Invalid role specified',
      });
    }

    console.log('[Register API] Creating Supabase Auth user via admin.createUser:', normalizedEmail);

    // Check if service role key is configured
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[Register API] ❌ SUPABASE_SERVICE_ROLE_KEY not found in environment');
      return res.status(500).json({
        success: false,
        message: 'Server configuration error',
      });
    }

    // Use admin.createUser instead of signUp to prevent Supabase auto-email
    // We handle email sending via backend SMTP (Nodemailer + Gmail)
    const { data: { user: authUser }, error: authError } = await supabase.auth.admin.createUser({
      email: normalizedEmail,
      password: password,
      user_metadata: {
        role: userRole,
      },
      email_confirm: false, // User must verify via backend OTP email
    });

    if (authError || !authUser) {
      console.error('[Register API] Failed to create auth user:', authError);
      const duplicateMessage = authError?.message?.toLowerCase().includes('already registered') ||
        authError?.message?.toLowerCase().includes('already exists') ||
        authError?.code === 'auth/email-already-in-use' ||
        authError?.code === 'email_exists';

      return res.status(duplicateMessage ? 409 : 400).json({
        success: false,
        message: duplicateMessage
          ? 'This email is already registered. Please log in instead.'
          : authError?.message || 'Failed to create auth account',
      });
    }

    console.log('[Register API] Auth user created:', { id: authUser.id, email: normalizedEmail, idType: typeof authUser.id });

    // Step 2: Create user profile with id set to auth user id
    console.log('[Register API] Creating user profile with id:', authUser.id);

    const { data: userProfile, error: insertError } = await supabase
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
      .single();

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
        console.error('[Register API] ❌ RLS POLICY BLOCKED INSERT');
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
        console.error('[Register API] ❌ NULL CONSTRAINT - Required column is null');
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
        console.error('[Register API] ❌ DUPLICATE KEY - User already exists');
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
      const storedCode = await storeSignupVerificationCode(
        userProfile.id,
        normalizedEmail,
        verificationCode,
        expiresAt,
        resendAvailableAt
      );
      console.log('[Register API] Verification code stored in:', storedCode.source);
    } catch (codeError) {
      console.error('[Register API] Failed to store verification code:', codeError);
      await supabase.from('users').delete().eq('id', authUser.id);
      await supabase.auth.admin.deleteUser(authUser.id);
      return res.status(500).json({
        success: false,
        message: 'Registration failed because the verification code could not be saved. Please try again.',
      });
    }

    // Send verification email with OTP before returning success
    console.log('[Register API] Sending verification email with OTP');
    try {
      await sendVerificationEmail(normalizedEmail, verificationCode, null, 'signup');
      console.log('[Register API] ✓ Verification email sent successfully');
    } catch (emailError) {
      console.error('[Register API] ❌ Failed to send verification email:', emailError.message);
      console.error('[Register API] ❌ Cleaning up created user because email delivery failed');
      await supabase.from('email_verification_codes').delete().eq('user_id', authUser.id);
      await supabase.from('users').delete().eq('id', authUser.id);
      await supabase.auth.admin.deleteUser(authUser.id);
      return res.status(500).json({
        success: false,
        message: 'Registration failed because we could not send the verification email. Please try again later.',
      });
    }

    console.log('[Register API] ✓ Registration successful for:', normalizedEmail);
    res.status(201).json({
      success: true,
      message: 'Registration successful. Please check your email for verification code.',
      email: normalizedEmail,
      userId: userProfile.id,
      requiresEmailVerification: true,
    });
  } catch (error) {
    console.error('[Register API] ❌ Unexpected registration error:', {
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
exports.createProfile = async (req, res) => {
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

    console.log('[Create Profile API] ✓ Profile created successfully for:', normalizedEmail);
    res.status(201).json({
      success: true,
      message: 'Profile created successfully',
      userId: userProfile.id,
    });
  } catch (error) {
    console.error('[Create Profile API] ❌ Unexpected error:', {
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
exports.sendEmailVerificationCode = async (req, res) => {
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

    // Store verification code in email_verification_codes table
    const { error: codeError } = await supabase
      .from('email_verification_codes')
      .insert({
        user_id: existingUser.id,
        email: normalizedEmail,
        code: code,
        expires_at: expiresAt,
        resend_available_at: new Date(Date.now() + config.emailVerification.resendCooldownSeconds * 1000),
        attempts: 0,
      });

    if (codeError) {
      console.error('[Email Verification] Failed to store code:', codeError);
      throw codeError;
    }

    // Send verification email asynchronously (don't wait for it)
    setImmediate(async () => {
      try {
        await sendVerificationEmail(normalizedEmail, code, null, type);
        console.log(`[Email Verification] ✓ ${type} email sent`);
      } catch (emailError) {
        console.warn(`[Email Verification] ⚠ Failed to send ${type} email:`, emailError.message);
      }
    });

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
exports.sendStudentEnrollmentDetails = async (req, res) => {
  try {
    const { parentEmail, childName, childUsername, childPassword, gradeLevel, readingLevel } = req.body;
    const learnerProfile = [
      gradeLevel ? `Grade ${gradeLevel}` : '',
      readingLevel ? `${readingLevel} reading level` : '',
    ].filter(Boolean).join(' • ');

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
exports.verifyEmail = async (req, res) => {
  try {
    console.log('[Verify Email] Request body:', req.body);
    
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

    // Mark email as verified in database
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

    // Also update Supabase Auth to mark email as confirmed
    console.log('[Verify Email] Updating Supabase Auth email confirmation');
    const { error: authUpdateError } = await supabase.auth.admin.updateUserById(
      user.id,
      {
        email_confirm: true,
      }
    );

    if (authUpdateError) {
      console.error('[Verify Email] Failed to update Supabase Auth:', authUpdateError);
      // Don't throw here - database is updated, auth update is secondary
    } else {
      console.log('[Verify Email] ✓ Supabase Auth email confirmed');
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

    console.log('[Verify Email] ✓ Email verified successfully');
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
exports.resendVerificationCode = async (req, res) => {
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
      console.log('[Resend Verification] ✓ Email sent');
    } catch (emailError) {
      console.error('[Resend Verification] ❌ Failed to send email:', emailError.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to send verification email. Please try again later.',
      });
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
exports.login = async (req, res) => {
  try {
    console.log('[Login] Request received');
    console.log('   Body:', req.body);

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

    const { data: existingProfile, error: existingProfileError } = await supabase
      .from('users')
      .select('*')
      .ilike('email', normalizedEmail)
      .maybeSingle();

    if (existingProfileError) {
      console.error('[Login] Failed to check existing profile:', existingProfileError.message);
      throw existingProfileError;
    }

    if (isStudentVerificationExempt(existingProfile)) {
      await normalizeStudentLoginAccount(existingProfile);
    }

    console.log('[Login] Attempting Supabase auth for:', normalizedEmail);

    const { data: authData, error: authError } = await signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (authError || !authData?.user) {
      console.error('[Login] Supabase authentication failed:', authError?.message || authError);
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

      const requiresFirstLoginOtp =
        userData.role !== 'admin' &&
        !isStudentVerificationExempt(userData) &&
        userData.metadata?.firstLoginOtpCompleted !== true;

      if (requiresFirstLoginOtp) {
        const otpCode = generateVerificationCode();
        await storeLoginOtp(userData, otpCode, authData.session);

        console.log('[Login] Sending first-login OTP for:', normalizedEmail);
        try {
          await sendVerificationEmail(normalizedEmail, otpCode, null, 'login');
        } catch (emailError) {
          console.error('[Login] Failed to send first-login OTP email:', emailError.message);
          return res.status(500).json({
            success: false,
            message: 'Failed to send login OTP email. Please try again later.',
          });
        }

        return res.json({
          success: true,
          message: 'First login verification code sent to your email',
          requiresLoginOTP: true,
          emailSent: true,
        });
      }
    }

    console.log('[Login] ✓ Login successful for:', normalizedEmail);
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
exports.sendLoginOTP = async (req, res) => {
  try {
    console.log('[Send Login OTP] Request received');
    console.log('   Body:', req.body);

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

    const { data: authData, error: authError } = await signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (authError || !authData?.session) {
      console.error('[Send Login OTP] Password verification failed:', authError?.message || authError);
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
      console.log('[Send Login OTP] ✓ OTP email sent');
    } catch (emailError) {
      console.error('[Send Login OTP] ❌ Failed to send OTP email:', emailError.message);
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
exports.verifyLoginOTP = async (req, res) => {
  try {
    console.log('[Verify Login OTP] Request received');
    console.log('   Body:', req.body);

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
    console.log('[Verify Login OTP] ✓ OTP verified for:', normalizedEmail);

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
exports.resendLoginOTP = async (req, res) => {
  try {
    console.log('[Resend Login OTP] Request received');
    console.log('   Body:', req.body);

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
        console.log('[Resend Login OTP] ✓ OTP email sent');
      } catch (emailError) {
        console.warn('[Resend Login OTP] ⚠ Failed to send OTP email:', emailError.message);
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
exports.forgotPassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { email } = req.body;

    const user = await User.findOne({ email });
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

    await User.findOneAndUpdate(
      { email },
      {
        resetCode: hashedCode,
        resetCodeExpires: config.getPasswordResetExpiry()
      },
      { new: true, runValidators: false }
    );

    // Send reset email
    await sendPasswordResetEmail(email, resetCode);

    res.json({
      success: true,
      message: 'Password reset code sent to your email',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Reset Password - Verify Code and Set New Password
exports.resetPassword = async (req, res) => {
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

    // Verify code expiration
    if (!verifyCodeExpiration(user.resetCodeExpires)) {
      return res.status(400).json({
        success: false,
        message: 'Reset code has expired',
      });
    }

    // Verify code
    const hashedInputCode = hashCode(resetCode);
    if (hashedInputCode !== user.resetCode) {
      return res.status(400).json({
        success: false,
        message: 'Invalid reset code',
      });
    }

    // Update password
    user.password = newPassword;
    user.resetCode = null;
    user.resetCodeExpires = null;
    await user.save();

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
exports.verifyResetCode = async (req, res) => {
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

    // Verify code expiration
    if (!verifyCodeExpiration(user.resetCodeExpires)) {
      return res.status(400).json({
        success: false,
        message: 'Reset code has expired',
      });
    }

    // Verify code
    const hashedInputCode = hashCode(resetCode);
    if (hashedInputCode !== user.resetCode) {
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
