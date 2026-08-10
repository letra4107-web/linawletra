
import express from 'express';
import { body } from 'express-validator';
import { validateRegister,
  validateLogin,
  validateStudentEnrollmentEmail,
  validateForgotPasswordRequest,
  validateResetPassword,
  handleValidationErrors, } from '../middleware/validation.js';
import { register,
  createProfile,
  sendStudentEnrollmentDetails,
  sendEmailVerificationCode,
  verifyEmail,
  resendVerificationCode,
  login,
  sendLoginOTP,
  verifyLoginOTP,
  resendLoginOTP,
  forgotPassword,
  resetPassword,
  verifyResetCode, } from '../controllers/authController.js';

const router = express.Router();
const normalizeAppEmail = (value) => String(value || '').trim().toLowerCase();


router.post(
  '/register',
  validateRegister,
  handleValidationErrors,
  register
);

// Create user profile after Supabase signUp
router.post(
  '/create-profile',
  [
    body('userId').isUUID().withMessage('Valid user ID is required'),
    body('firstName').trim().isLength({ min: 1 }).withMessage('First name is required'),
    body('lastName').trim().isLength({ min: 1 }).withMessage('Last name is required'),
    body('email').isEmail().withMessage('Valid email is required').customSanitizer(normalizeAppEmail),
    body('role').optional().isIn(['admin', 'teacher', 'parent', 'student']).withMessage('Invalid role'),
  ],
  handleValidationErrors,
  createProfile
);

// Send student account credentials to the parent after enrollment
router.post(
  '/send-student-enrollment-email',
  validateStudentEnrollmentEmail,
  handleValidationErrors,
  sendStudentEnrollmentDetails
);

// Login
router.post(
  '/login',
  validateLogin,
  handleValidationErrors,
  login
);

// Forgot Password (Request Reset Code)
router.post(
  '/forgot-password',
  validateForgotPasswordRequest,
  handleValidationErrors,
  forgotPassword
);

// Verify Reset Code (checked before showing the new-password form)
router.post(
  '/verify-reset-code',
  [
    body('email').isEmail().withMessage('Valid email is required').customSanitizer(normalizeAppEmail),
    body('resetCode').isLength({ min: 6, max: 6 }).isNumeric().withMessage('Valid 6-digit code is required'),
  ],
  handleValidationErrors,
  verifyResetCode
);

// Reset Password (Verify Code and Set New Password)
router.post(
  '/reset-password',
  validateResetPassword,
  handleValidationErrors,
  resetPassword
);

// Send Email Verification Code (OTP)
router.post(
  '/send-email-verification-code',
  [
    body('email').isEmail().withMessage('Valid email is required').customSanitizer(normalizeAppEmail),
  ],
  handleValidationErrors,
  sendEmailVerificationCode
);

// Verify Email OTP
router.post(
  '/verify-email',
  [
    body('email').isEmail().withMessage('Valid email is required').customSanitizer(normalizeAppEmail),
    body('code').isLength({ min: 6, max: 6 }).isNumeric().withMessage('Valid 6-digit code is required'),
  ],
  handleValidationErrors,
  verifyEmail
);

// Resend Verification Code
router.post(
  '/resend-verification-code',
  [
    body('email').isEmail().withMessage('Valid email is required').customSanitizer(normalizeAppEmail),
  ],
  handleValidationErrors,
  resendVerificationCode
);

// Send Login OTP (when email is not verified)
router.post(
  '/send-login-otp',
  [
    body('email').isEmail().withMessage('Valid email is required').customSanitizer(normalizeAppEmail),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  handleValidationErrors,
  sendLoginOTP
);

// Verify Login OTP (for email-not-confirmed users)
router.post(
  '/verify-login-otp',
  [
    body('email').isEmail().withMessage('Valid email is required').customSanitizer(normalizeAppEmail),
    body('otpCode').isLength({ min: 6, max: 6 }).isNumeric().withMessage('Valid 6-digit OTP code is required'),
  ],
  handleValidationErrors,
  verifyLoginOTP
);

// Resend Login OTP
router.post(
  '/resend-login-otp',
  [
    body('email').isEmail().withMessage('Valid email is required').customSanitizer(normalizeAppEmail),
  ],
  handleValidationErrors,
  resendLoginOTP
);

export default router;


