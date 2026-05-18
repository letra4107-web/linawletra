/**
 * Configuration Module
 * Supabase migration complete: MongoDB and Firebase legacy configuration removed
 * All authentication and database operations now use Supabase
 */

const path = require('path');
const dotenv = require('dotenv');

[
  path.resolve(__dirname, '.env'),
  path.resolve(__dirname, '.env.local'),
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '../.env.local'),
].forEach((envPath) => {
  dotenv.config({ path: envPath, override: false });
});

// Validate required environment variables
const validateConfig = () => {
  // Supabase migration: MongoDB is no longer required
  const optional = [
    'EMAIL_HOST',
    'EMAIL_PORT',
    'EMAIL_USER',
    'EMAIL_PASS',
    'EMAIL_FROM',
    'CLIENT_URL',
    'SERVER_URL',
  ];

  if (!process.env.PORT) {
    console.warn('PORT is not set. Using default port 5000.');
  }

  if (!process.env.NODE_ENV) {
    console.warn('NODE_ENV is not set. Using development mode.');
  }

  console.log('✓ Core environment values loaded');
  if (supabaseUrl) {
    console.log('✓ Database: Supabase');
    console.log('✓ Supabase URL:', supabaseUrl);
  } else {
    console.warn('⚠ Supabase URL is not configured. Database access may fail.');
  }

  if (!hasRealEmailPassword) {
    console.warn('⚠ Gmail App Password is missing, too short, or still using a placeholder. OTP emails from linawletra@gmail.com will not send until EMAIL_PASS is set correctly.');
  }
};

const supabaseUrl = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY || '';

// Config object - simplified for Firebase/Supabase
const emailUser = (process.env.EMAIL_USER || 'linawletra@gmail.com').trim().toLowerCase();
const rawEmailPassword = process.env.EMAIL_PASS || process.env.EMAIL_PASSWORD || '';
const emailPassword = rawEmailPassword
  .trim()
  .replace(/^['"]|['"]$/g, '')
  .replace(/[\s-]+/g, '');
const hasRealEmailPassword = Boolean(
  emailPassword.length >= 16 && !/replace_with|your_app_password|app_password_here/i.test(emailPassword)
);
const emailPort = parseInt(process.env.EMAIL_PORT, 10) || 587;
const emailVerificationMinutes = parseInt(process.env.EMAIL_VERIFICATION_EXP_MINUTES, 10) || 10;
const emailResendSeconds = parseInt(process.env.EMAIL_VERIFICATION_RESEND_SECONDS, 10) || 60;
const passwordResetMinutes = parseInt(process.env.PASSWORD_RESET_EXP_MINUTES, 10) || 10;

const config = {
  // Application
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 5000,
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',

  // MongoDB: DISABLED - Using Supabase instead
  // mongodb: { uri: null }, // No longer used

  // URLs
  urls: {
    client: process.env.CLIENT_URL || 'http://localhost:3000',
    server: process.env.SERVER_URL || 'http://localhost:5000',
  },

  frontendUrl: process.env.CLIENT_URL || 'http://localhost:3000',

  supabase: {
    url: supabaseUrl,
    key: supabaseKey,
  },

  // Email delivery using the official LinawLetra Gmail account
  email: {
    service: process.env.EMAIL_SERVICE || 'gmail',
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: emailPort,
    secure: process.env.EMAIL_SECURE === 'true' || emailPort === 465,
    user: emailUser,
    password: emailPassword,
    from: process.env.EMAIL_FROM || `LinawLetra <${emailUser}>`,
    enabled: Boolean(emailUser && hasRealEmailPassword),
    // Whether to reject unauthorized TLS certificates. Default `true` in production.
    // Set EMAIL_TLS_REJECT_UNAUTHORIZED=false in development only to bypass self-signed certs.
    rejectUnauthorized: process.env.EMAIL_TLS_REJECT_UNAUTHORIZED !== 'false',
  },

  emailVerification: {
    expiresInMinutes: emailVerificationMinutes,
    resendCooldownSeconds: emailResendSeconds,
  },

  passwordReset: {
    expiresInMinutes: passwordResetMinutes,
    expiresIn: `${passwordResetMinutes} minutes`,
  },
};

/**
 * Log configuration (safe, no secrets)
 */
config.logConfig = () => {
  console.log('\n🔥 === Backend Configuration ===');
  console.log(`Environment: ${config.nodeEnv}`);
  console.log(`Port: ${config.port}`);
  console.log(`Database: ${config.supabase.url ? 'Supabase' : 'Not configured'}`);
  if (config.supabase.url) {
    console.log(`Supabase URL: ${config.supabase.url}`);
  }
  console.log(`Client URL: ${config.urls.client}`);
  console.log(`Server URL: ${config.urls.server}`);
  console.log(`OTP Sender: ${config.email.from}`);
  console.log(`Email Service Ready: ${config.email.enabled ? 'Yes' : 'No - set EMAIL_PASS'}`);
  console.log('=====================================\n');
};

config.getEmailVerificationExpiry = () => {
  return new Date(Date.now() + config.emailVerification.expiresInMinutes * 60 * 1000);
};

config.getPasswordResetExpiry = () => {
  return new Date(Date.now() + config.passwordReset.expiresInMinutes * 60 * 1000);
};

// Validate on load
validateConfig();

module.exports = config;
