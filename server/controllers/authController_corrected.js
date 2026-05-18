// --- TEST ENDPOINT: Send verification email to any address (for debugging) ---
exports.testSendVerification = async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, message: 'Email required.' });
  try {
    const code = generateVerificationCode();
    await sendVerificationEmail(email, code);
    return res.json({ success: true, message: 'Verification email sent.', email, code });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to send verification email.', error: err.message });
  }
};
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

// Register new user (creates auth user and profile)
exports.register = async (req, res) => {
  try {
    console.log('[Register API] Request received at:', new Date().toISOString());
    console.log('[Register API] Request body:', {
      email: req.body.email,
      firstName: req.body.firstName,
      lastName: req.body.lastName,
      middleInitial: req.body.middleInitial,
      role: req.body.role,
      password: req.body.password ? '[REDACTED]' : undefined,
    });

    // Validate input
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
    
    // Check if user profile already exists in users table
    const { data: existingUser, error: checkError } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', normalizedEmail)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      // PGRST116 = "No rows found" which is expected
      console.error('[Register API] Error checking existing user:', checkError);
      throw checkError;
    }

    if (existingUser) {
      console.log('[Register API] User profile already exists:', normalizedEmail);
      return res.status(400).json({
        success: false,
        message: 'Email already registered',
      });
    }

    console.log('[Register API] Checking Supabase Auth for existing account:', normalizedEmail);
    
    // Check if auth user exists
    const { data: { users: authUsers }, error: authCheckError } = await supabase.auth.admin.listUsers();
    const existingAuthUser = authUsers?.find(u => u.email === normalizedEmail);
    
    if (existingAuthUser) {
      console.log('[Register API] Auth user already exists:', normalizedEmail);
      return res.status(400).json({
        success: false,
        message: 'Email already registered',
      });
    }

    console.log('[Register API] Creating Supabase Auth user:', normalizedEmail);
    
    // Create auth user via Supabase Admin API
    const { data: { user: authUser }, error: signUpError } = await supabase.auth.admin.createUser({
      email: normalizedEmail,
      password: password,
      email_confirm: false,
    });

    if (signUpError || !authUser) {
      console.error('[Register API] Failed to create auth user:', signUpError);
      return res.status(400).json({
        success: false,
        message: signUpError?.message || 'Failed to create auth account',
      });
    }

    console.log('[Register API] Auth user created successfully:', {
      id: authUser.id,
      email: authUser.email,
    });

    // Create fullName from components
    const fullName = `${firstName} ${middleInitial ? middleInitial + ' ' : ''}${lastName}`.trim();

    console.log('[Register API] Creating user profile in Supabase:', {
      id: authUser.id,
      email: normalizedEmail,
      displayName: fullName,
      role: role || 'parent',
    });

    // Insert user profile with id matching auth.users.id
    // Using service role which BYPASSES all RLS policies
    const { data: userProfile, error: insertError } = await supabase
      .from('users')
      .insert({
        id: authUser.id,  // CRITICAL: Must match auth.users.id
        email: normalizedEmail,
        display_name: fullName,
        first_name: firstName,
        last_name: lastName,
        middle_initial: middleInitial || null,
        role: role || 'parent',
        email_verified: false,
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

      // Clean up: delete auth user if profile creation fails
      console.log('[Register API] Cleaning up: Deleting auth user due to profile creation failure');
      await supabase.auth.admin.deleteUser(authUser.id);

      if (insertError.message.includes('row-level security policy')) {
        console.error('[Register API] ❌ RLS POLICY BLOCKED INSERT');
        console.error('   This indicates RLS policies are not configured correctly');
        console.error('   Ensure SUPABASE_SERVICE_ROLE_KEY is valid in .env');
        return res.status(500).json({
          success: false,
          message: 'Database configuration error. Please contact support.',
          error: 'RLS_POLICY_BLOCKED',
        });
      }

      if (insertError.message.includes('null value in column')) {
        console.error('[Register API] ❌ NULL CONSTRAINT VIOLATION');
        console.error('   A required column received null value');
        console.error('   Ensure schema has no NOT NULL columns without defaults');
      }

      if (insertError.message.includes('duplicate key')) {
        console.error('[Register API] ❌ DUPLICATE KEY');
        console.error('   User already exists');
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

    // Send verification email
    try {
      console.log('[Register API] Sending verification email to:', normalizedEmail);
      const verificationCode = generateVerificationCode();
      await sendVerificationEmail(normalizedEmail, verificationCode);
      console.log('[Register API] ✓ Verification email sent successfully');
    } catch (emailError) {
      console.warn('[Register API] ⚠ Failed to send verification email:', emailError.message);
      // Don't fail registration if email fails
    }

    console.log('[Register API] ✓ Registration successful for:', normalizedEmail);
    
    res.status(201).json({
      success: true,
      message: 'Registration successful. Please verify your email.',
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

// Send email verification code
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

    await sendVerificationEmail(email, code, type);

    res.json({
      success: true,
      message: 'Verification code sent successfully.',
    });
  } catch (error) {
    console.error('[Email Verification] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Verify email (called after user receives code)
exports.verifyEmail = async (req, res) => {
  try {
    const { email, code } = req.body;
    console.log('[Email Verification] Verifying code for:', email);

    // Verify with Supabase
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: 'email',
    });

    if (error) {
      console.error('[Email Verification] Verification failed:', error);
      return res.status(400).json({
        success: false,
        message: 'Invalid verification code',
      });
    }

    console.log('[Email Verification] ✓ Email verified for:', email);

    // Mark user profile as verified
    await supabase
      .from('users')
      .update({
        email_verified: true,
        verified_at: new Date().toISOString(),
      })
      .eq('email', email.toLowerCase());

    res.json({
      success: true,
      message: 'Email verified successfully',
    });
  } catch (error) {
    console.error('[Email Verification] Unexpected error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Login user
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('[Login] Attempting login for:', email);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase(),
      password,
    });

    if (error || !data.user) {
      console.error('[Login] Authentication failed:', error);
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    console.log('[Login] Auth successful, fetching profile');

    // Get user profile
    const { data: userProfile, error: profileError } = await supabase
      .from('users')
      .select('*')
      .eq('id', data.user.id)
      .single();

    if (profileError || !userProfile) {
      console.error('[Login] Failed to fetch profile:', profileError);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch user profile',
      });
    }

    console.log('[Login] ✓ Login successful for:', email);

    res.json({
      success: true,
      message: 'Login successful',
      user: {
        id: data.user.id,
        email: data.user.email,
        displayName: userProfile.display_name,
        firstName: userProfile.first_name,
        lastName: userProfile.last_name,
        role: userProfile.role,
        emailVerified: userProfile.email_verified,
        ...userProfile,
      },
      session: data.session,
    });
  } catch (error) {
    console.error('[Login] Unexpected error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
