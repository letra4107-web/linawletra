/**
 * Backend Validation Middleware for LinawLetra
 * Uses express-validator for robust server-side validation
 */

import { body, validationResult, query, param } from 'express-validator';
import validator from 'validator';

const redactSensitiveBody = (body = {}) => {
  if (!body || typeof body !== 'object') return body;

  const sensitivePattern = /(password|token|code|otp|secret|key)/i;
  return Object.fromEntries(
    Object.entries(body).map(([key, value]) => [
      key,
      sensitivePattern.test(key) ? '[REDACTED]' : value,
    ])
  );
};

// Middleware to handle validation result
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorArray = errors.array().map((err) => ({
      field: err.path || err.param,
      message: err.msg,
    }));
    console.error('❌ Validation error on', req.path);
    console.error('   Body received:', redactSensitiveBody(req.body));
    console.error('   Errors:', errorArray);
    return res.status(400).json({
      success: false,
      errors: errorArray,
    });
  }
  next();
};

// Custom sanitizers & validators
const sanitizeInput = (value) => {
  return validator.trim(validator.escape(value));
};

const normalizeAppEmail = (value) => String(value || '').trim().toLowerCase();

const isValidTagalogLetters = (value) => {
  // Only letters and spaces allowed
  return /^[a-zA-Z\s]*$/.test(value);
};

// Authentication Validations
const validateRegister = [
  body('firstName')
    .notEmpty().withMessage('First name is required')
    .isLength({ min: 2 }).withMessage('First name must be at least 2 characters')
    .matches(/^[a-zA-Z\s]+$/).withMessage('First name can only contain letters and spaces')
    .trim(),
  
  body('lastName')
    .notEmpty().withMessage('Last name is required')
    .isLength({ min: 2 }).withMessage('Last name must be at least 2 characters')
    .matches(/^[a-zA-Z\s]+$/).withMessage('Last name can only contain letters and spaces')
    .trim(),
  
  body('middleInitial')
    .optional()
    .isLength({ max: 1 }).withMessage('Middle initial must be a single character')
    .matches(/^[a-zA-Z]$/).withMessage('Middle initial must be a letter')
    .toUpperCase()
    .trim(),
  
  body('email')
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .customSanitizer(normalizeAppEmail),
  
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Password must include at least 1 uppercase letter')
    .matches(/[a-z]/).withMessage('Password must include at least 1 lowercase letter')
    .matches(/[0-9]/).withMessage('Password must include at least 1 number')
    .matches(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/)
    .withMessage('Password must include at least 1 special character'),
  
  body('confirmPassword')
    .optional()
    .custom((value, { req }) => !value || value === req.body.password)
    .withMessage('Passwords do not match'),
  
  body('termsAccepted')
    .optional(),
  
  body('role')
    .optional()
    .isIn(['parent', 'teacher', 'admin'])
    .withMessage('Invalid role'),
];

const validateLogin = [
  body('email')
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .customSanitizer(normalizeAppEmail),
  
  body('password')
    .notEmpty().withMessage('Password is required'),
];

const validateEmailVerification = [
  body('email')
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .customSanitizer(normalizeAppEmail),
  
  body('verificationCode')
    .notEmpty().withMessage('Verification code is required')
    .isLength({ min: 6, max: 6 }).withMessage('Verification code must be 6 digits')
    .isNumeric().withMessage('Verification code must contain only numbers'),
];

const validateSendEmailVerificationCode = [
  body('email')
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .customSanitizer(normalizeAppEmail),

  body('code')
    .notEmpty().withMessage('Verification code is required')
    .isLength({ min: 6, max: 6 }).withMessage('Verification code must be 6 digits')
    .isNumeric().withMessage('Verification code must contain only numbers'),

  body('type')
    .optional()
    .isIn(['signup', 'login'])
    .withMessage('Invalid verification email type'),
];

const validateStudentEnrollmentEmail = [
  body('parentEmail')
    .notEmpty().withMessage('Parent email is required')
    .isEmail().withMessage('Please provide a valid parent email address')
    .customSanitizer(normalizeAppEmail),

  body('childName')
    .notEmpty().withMessage('Child name is required')
    .isLength({ min: 2 }).withMessage('Child name must be at least 2 characters')
    .trim(),

  body('childUsername')
    .notEmpty().withMessage('Student username is required')
    .isEmail().withMessage('Student username must be a valid email format')
    .customSanitizer(normalizeAppEmail),

  body('childPassword')
    .notEmpty().withMessage('Student password is required')
    .isLength({ min: 8 }).withMessage('Student password must be at least 8 characters long'),

  body('gradeLevel')
    .optional()
    .isIn(['1', '2', '3', '4', '5', '6'])
    .withMessage('Grade level must be between Grade 1 and Grade 6'),
];

const validateLoginOTP = [
  body('email')
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .customSanitizer(normalizeAppEmail),
  
  body('otpCode')
    .notEmpty().withMessage('OTP code is required')
    .isLength({ min: 6, max: 6 }).withMessage('OTP code must be 6 digits')
    .isNumeric().withMessage('OTP code must contain only numbers'),
];

const validateResendVerificationCode = [
  body('email')
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .customSanitizer(normalizeAppEmail),
];

const validateForgotPasswordRequest = [
  body('email')
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .customSanitizer(normalizeAppEmail),
];

const validateResetPassword = [
  body('email')
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .customSanitizer(normalizeAppEmail),
  
  body('resetCode')
    .notEmpty().withMessage('Reset code is required')
    .isLength({ min: 6, max: 6 }).withMessage('Reset code must be 6 digits')
    .isNumeric().withMessage('Reset code must contain only numbers'),
  
  body('newPassword')
    .notEmpty().withMessage('New password is required')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Password must include at least 1 uppercase letter')
    .matches(/[a-z]/).withMessage('Password must include at least 1 lowercase letter')
    .matches(/[0-9]/).withMessage('Password must include at least 1 number')
    .matches(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/)
    .withMessage('Password must include at least 1 special character'),
  
  body('confirmPassword')
    .notEmpty().withMessage('Please confirm your password')
    .custom((value, { req }) => value === req.body.newPassword)
    .withMessage('Passwords do not match'),
];

// Assessment Validations
const validateAssessmentInput = [
  body('studentId')
    .notEmpty().withMessage('Student ID is required')
    .isMongoId().withMessage('Invalid student ID'),
  
  body('alphabetRecognition')
    .isInt({ min: 0, max: 100 }).withMessage('Alphabet recognition score must be 0-100'),
  
  body('letterIdentification')
    .isInt({ min: 0, max: 100 }).withMessage('Letter identification score must be 0-100'),
  
  body('letterFormation')
    .isInt({ min: 0, max: 100 }).withMessage('Letter formation score must be 0-100'),
  
  body('readingAbility')
    .isInt({ min: 0, max: 100 }).withMessage('Reading ability score must be 0-100'),
  
  body('writingAbility')
    .isInt({ min: 0, max: 100 }).withMessage('Writing ability score must be 0-100'),
];

const validateLetterInput = [
  body('input')
    .notEmpty().withMessage('Input is required')
    .custom(isValidTagalogLetters).withMessage('Only letters and spaces are allowed')
    .customSanitizer(() => sanitizeInput),
];

// Lesson/Activity Validations
const validateLessonCreation = [
  body('title')
    .notEmpty().withMessage('Lesson title is required')
    .isLength({ max: 100 }).withMessage('Title must not exceed 100 characters')
    .customSanitizer(() => sanitizeInput),
  
  body('description')
    .notEmpty().withMessage('Description is required')
    .isLength({ max: 500 }).withMessage('Description must not exceed 500 characters')
    .customSanitizer(() => sanitizeInput),
  
  body('level')
    .notEmpty().withMessage('Difficulty level is required')
    .isIn(['1', '2', '3']).withMessage('Level must be 1, 2, or 3'),
  
  body('category')
    .notEmpty().withMessage('Category is required')
    .isIn(['alphabetRecognition', 'letterIdentification', 'letterFormation', 'readingAbility', 'writingAbility'])
    .withMessage('Invalid category'),
];

const validateActivityCreation = [
  body('title')
    .notEmpty().withMessage('Activity title is required')
    .isLength({ max: 100 }).withMessage('Title must not exceed 100 characters')
    .customSanitizer(() => sanitizeInput),
  
  body('instructions')
    .notEmpty().withMessage('Instructions are required')
    .isLength({ max: 300 }).withMessage('Instructions must not exceed 300 characters')
    .customSanitizer(() => sanitizeInput),
  
  body('activityType')
    .notEmpty().withMessage('Activity type is required')
    .isIn(['fillInBlank', 'multipleChoice', 'matching', 'writing', 'pronunciation'])
    .withMessage('Invalid activity type'),
];

// Schedule Validations
const validateScheduleCreation = [
  body('studentId')
    .notEmpty().withMessage('Student ID is required')
    .isMongoId().withMessage('Invalid student ID'),
  
  body('teacherId')
    .notEmpty().withMessage('Teacher ID is required')
    .isMongoId().withMessage('Invalid teacher ID'),
  
  body('lessonId')
    .notEmpty().withMessage('Lesson ID is required')
    .isMongoId().withMessage('Invalid lesson ID'),
  
  body('scheduledDate')
    .notEmpty().withMessage('Date is required')
    .isISO8601().withMessage('Please provide a valid date')
    .custom((value) => {
      const date = new Date(value);
      if (date < new Date()) {
        throw new Error('Scheduled date cannot be in the past');
      }
      return true;
    }),
  
  body('scheduledTime')
    .notEmpty().withMessage('Time is required')
    .matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Please provide a valid time (HH:MM)'),
  
  body('sessionType')
    .notEmpty().withMessage('Session type is required')
    .isIn(['assessment', 'lesson', 'review', 'practice'])
    .withMessage('Invalid session type'),
];

// Student Management Validations
const validateStudentEnrollment = [
  body('name')
    .notEmpty().withMessage('Student name is required')
    .matches(/^[a-zA-Z\s]+$/).withMessage('Name can only contain letters and spaces')
    .customSanitizer(() => sanitizeInput),
  
  body('age')
    .notEmpty().withMessage('Age is required')
    .isInt({ min: 5, max: 18 }).withMessage('Age must be between 5 and 18'),
  
  body('dateOfBirth')
    .notEmpty().withMessage('Date of birth is required')
    .isISO8601().withMessage('Please provide a valid date'),
  
  body('gender')
    .notEmpty().withMessage('Gender is required')
    .isIn(['male', 'female', 'other']).withMessage('Invalid gender selection'),
];

export {
  handleValidationErrors,
  validateRegister,
  validateLogin,
  validateEmailVerification,
  validateSendEmailVerificationCode,
  validateStudentEnrollmentEmail,
  validateLoginOTP,
  validateResendVerificationCode,
  validateForgotPasswordRequest,
  validateResetPassword,
  validateAssessmentInput,
  validateLetterInput,
  validateLessonCreation,
  validateActivityCreation,
  validateScheduleCreation,
  validateStudentEnrollment,
  sanitizeInput,
};

