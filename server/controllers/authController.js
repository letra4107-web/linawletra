const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const config = require('../config');
const { supabase } = require('../config/supabase');
const bcrypt = require('bcryptjs');
const {
  generateVerificationCode,
  hashCode,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendStudentEnrollmentEmail,
  verifyCodeExpiration,
} = require('../services/emailService');

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
      .insert({
        uid: authUser.id,
        id: authUser.id,
        email: normalizedEmail,
        display_name: fullName,
        first_name: firstName,
        last_name: lastName,
        middle_initial: middleInitial || null,
        role: userRole,
        email_verified: false,
        verified_at: null,
        account_status: 'active',
        is_active: true,
        profile_image: null,
      })
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
        uid: authUser.id,
        id: authUser.id,
        email: normalizedEmail,
        display_name: fullName,
        first_name: firstName,
        last_name: lastName,
        middle_initial: middleInitial || null,
        role: role || 'parent',
        email_verified: false,
        verified_at: null,
        account_status: 'active',
        is_active: true,
        profile_image: null,
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

    // Store verification code in email_verification_codes table
    const { error: codeError } = await supabase
      .from('email_verification_codes')
      .insert({
        user_id: userProfile.id,
        email: normalizedEmail,
        code: verificationCode,
        expires_at: expiresAt,
        resend_available_at: resendAvailableAt,
        attempts: 0,
      });

    if (codeError) {
      console.error('[Register API] Failed to store verification code:', codeError);
      // Don't fail registration if code storage fails, but log it
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
      .insert({
        id: userId,
        email: normalizedEmail,
        display_name: fullName,
        first_name: firstName,
        last_name: lastName,
        middle_initial: middleInitial || null,
        role: userRole,
        account_status: 'active',
        is_active: true,
      })
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
      .select('id, email, display_name, first_name, last_name, role, email_verified')
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

    // Get latest verification code record
    const { data: codeRecord, error: codeError } = await supabase
      .from('email_verification_codes')
      .select('*')
      .eq('user_id', user.id)
      .eq('email', normalizedEmail)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (codeError) {
      console.error('[Verify Email] No verification code found:', codeError);
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
      // Increment attempts
      await supabase
        .from('email_verification_codes')
        .update({ attempts: (codeRecord.attempts || 0) + 1 })
        .eq('id', codeRecord.id);
      
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
        verified_at: new Date().toISOString(),
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
    await supabase
      .from('email_verification_codes')
      .delete()
      .eq('id', codeRecord.id);

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
        displayName: user.display_name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || null,
        firstName: user.first_name || null,
        lastName: user.last_name || null,
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
      .select('id, email_verified')
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
    const { data: lastCode, error: lastCodeError } = await supabase
      .from('email_verification_codes')
      .select('*')
      .eq('user_id', user.id)
      .eq('email', normalizedEmail)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!lastCodeError && lastCode && lastCode.resend_available_at) {
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
    
    // Store new code in email_verification_codes table
    const { error: storeError } = await supabase
      .from('email_verification_codes')
      .insert({
        user_id: user.id,
        email: normalizedEmail,
        code: verificationCode,
        expires_at: expiresAt,
        resend_available_at: resendAvailableAt,
        attempts: 0,
      });

    if (storeError) {
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

    console.log('[Login] Attempting Supabase auth for:', normalizedEmail);

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
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

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (userError || !userData) {
      console.error('[Login] User profile not found for auth user id:', authData.user.id, userError?.message || 'no profile');
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch user profile',
      });
    }

    const accountStatus = userData.account_status || 'active';
    const isActive = userData.is_active !== false;

    if (userData.role !== 'admin' && accountStatus === 'suspended') {
      return res.status(403).json({
        success: false,
        message: 'Account has been suspended. Please contact support.',
      });
    }

    if (!isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account has been disabled. Please contact support.',
      });
    }

    if (!userData.email_verified) {
      return res.status(403).json({
        success: false,
        message: 'Please verify your email before logging in.',
        requiresEmailVerification: true,
      });
    }

    console.log('[Login] ✓ Login successful for:', normalizedEmail);
    res.json({
      success: true,
      message: 'Login successful',
      user: {
        id: userData.id,
        uid: userData.id,
        email: userData.email,
        displayName: userData.display_name || `${userData.first_name || ''} ${userData.last_name || ''}`.trim(),
        firstName: userData.first_name,
        lastName: userData.last_name,
        role: userData.role,
        emailVerified: Boolean(userData.email_verified),
      },
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
    const { data: userData, error: userError } = await supabase
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

    if (userData.role === 'admin') {
      console.log('[Send Login OTP] Admin login bypass, skipping OTP for:', normalizedEmail);
      return res.json({
        success: true,
        message: 'Admin login bypasses OTP verification.',
        skipOtp: true,
        user: {
          id: userData.id,
          uid: userData.id,
          email: userData.email,
          displayName: userData.display_name || `${userData.first_name || ''} ${userData.last_name || ''}`.trim(),
          firstName: userData.first_name,
          lastName: userData.last_name,
          role: userData.role,
          emailVerified: true,
        },
      });
    }

    // Check if email is verified
    if (!userData.email_verified) {
      console.log('[Send Login OTP] Email not verified for:', normalizedEmail);
      return res.status(403).json({
        success: false,
        message: 'Please verify your email before logging in',
        requiresEmailVerification: true,
      });
    }

    // Generate OTP code for 2FA
    const otpCode = generateVerificationCode();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store OTP in email_verification_codes table for login
    const { error: storeError } = await supabase
      .from('email_verification_codes')
      .insert({
        user_id: userData.id,
        email: normalizedEmail,
        code: otpCode,
        expires_at: otpExpires,
        resend_available_at: new Date(Date.now() + 60 * 1000), // 1 minute cooldown
        attempts: 0,
      });

    if (storeError) {
      console.error('[Send Login OTP] Failed to store OTP:', storeError);
      throw storeError;
    }

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

    // Get latest OTP record
    const { data: otpRecord, error: otpError } = await supabase
      .from('email_verification_codes')
      .select('*')
      .eq('user_id', userData.id)
      .eq('email', normalizedEmail)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (otpError || !otpRecord) {
      console.error('[Verify Login OTP] No OTP found:', otpError);
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

      // Increment attempts
      await supabase
        .from('email_verification_codes')
        .update({ attempts: (otpRecord.attempts || 0) + 1 })
        .eq('id', otpRecord.id);

      return res.status(400).json({
        success: false,
        message: 'Invalid OTP code',
      });
    }

    // OTP verified successfully
    console.log('[Verify Login OTP] ✓ OTP verified for:', normalizedEmail);

    // Delete used OTP
    await supabase
      .from('email_verification_codes')
      .delete()
      .eq('id', otpRecord.id);

    // Issue a Supabase-compatible session token so `server/middleware/auth.js` can validate it.
    // We mint a short-lived custom JWT signed by the Supabase secret.
    // The middleware expects `Authorization: Bearer <token>` and calls `supabase.auth.getUser(token)`.
    const { data: { session } = {}, error: sessionError } = await supabase.auth.admin.generateAccessTokenForUser(
      userData.id
    );

    if (sessionError || !session?.access_token) {
      console.error('[Verify Login OTP] Failed to generate Supabase access token:', sessionError);
      return res.status(500).json({
        success: false,
        message: 'Failed to create session. Please try again.',
      });
    }

    const token = session.access_token;


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
        displayName: userData.display_name,
        firstName: userData.first_name,
        lastName: userData.last_name,
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

    // Check if email is verified
    if (!userData.email_verified) {
      console.log('[Resend Login OTP] Email not verified for:', normalizedEmail);
      return res.status(403).json({
        success: false,
        message: 'Please verify your email before logging in',
        requiresEmailVerification: true,
      });
    }

    // Check for existing OTP and rate limiting
    const { data: existingOtp, error: otpError } = await supabase
      .from('email_verification_codes')
      .select('*')
      .eq('user_id', userData.id)
      .eq('email', normalizedEmail)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (existingOtp && !otpError) {
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

      // Delete old OTP
      await supabase
        .from('email_verification_codes')
        .delete()
        .eq('id', existingOtp.id);
    }

    // Generate new OTP code
    const otpCode = generateVerificationCode();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store new OTP in email_verification_codes table
    const { error: storeError } = await supabase
      .from('email_verification_codes')
      .insert({
        user_id: userData.id,
        email: normalizedEmail,
        code: otpCode,
        expires_at: otpExpires,
        resend_available_at: new Date(Date.now() + 60 * 1000), // 1 minute cooldown
        attempts: 0,
      });

    if (storeError) {
      console.error('[Resend Login OTP] Failed to store OTP:', storeError);
      throw storeError;
    }

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
