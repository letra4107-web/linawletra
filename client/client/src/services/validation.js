/**
 * Validation Utilities for LinawLetra
 * Dyslexia-friendly validation with clear feedback
 */

// Password strength checker
export const validatePassword = (password) => {
  const errors = [];
  
  if (!password) {
    return { valid: false, errors: ['Password is required'] };
  }
  
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters');
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must include at least 1 uppercase letter');
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('Password must include at least 1 lowercase letter');
  }
  
  if (!/[0-9]/.test(password)) {
    errors.push('Password must include at least 1 number');
  }
  
  // eslint-disable-next-line no-useless-escape
  if (!/[\[\]!@#$%^&*()_+\-={};'":;\\|,.<>/?]/.test(password)) {
    errors.push('Password must include at least 1 special character (!@#$% etc)');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    strength: calculatePasswordStrength(password),
  };
};

// Calculate password strength (weak, moderate, strong)
const calculatePasswordStrength = (password) => {
  let strength = 0;
  
  if (password.length >= 8) strength++;
  if (password.length >= 12) strength++;
  if (password.length >= 16) strength++;
  if (/[A-Z]/.test(password)) strength++;
  if (/[a-z]/.test(password)) strength++;
  if (/[0-9]/.test(password)) strength++;
  // eslint-disable-next-line no-useless-escape
  if (/[\[\]!@#$%^&*()_+\-={};'":;\\|,.<>/?]/.test(password)) strength++;
  
  if (strength <= 2) return 'weak';
  if (strength <= 4) return 'moderate';
  return 'strong';
};

// Email validation
export const validateEmail = (email) => {
  if (!email) {
    return { valid: false, error: 'This field is required' };
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { valid: false, error: 'Invalid email format' };
  }
  
  return { valid: true };
};

// First name validation
export const validateFirstName = (firstName) => {
  if (!firstName || firstName.trim().length < 2) {
    return { valid: false, error: 'First name must be at least 2 characters' };
  }
  if (!/^[a-zA-Z\s]+$/.test(firstName)) {
    return { valid: false, error: 'First name can only contain letters and spaces' };
  }
  return { valid: true };
};

// Last name validation
export const validateLastName = (lastName) => {
  if (!lastName || lastName.trim().length < 2) {
    return { valid: false, error: 'Last name must be at least 2 characters' };
  }
  if (!/^[a-zA-Z\s]+$/.test(lastName)) {
    return { valid: false, error: 'Last name can only contain letters and spaces' };
  }
  return { valid: true };
};

// Middle initial validation
export const validateMiddleInitial = (middleInitial) => {
  if (!middleInitial) return { valid: true }; // Optional field
  if (middleInitial.length > 1) {
    return { valid: false, error: 'Middle initial must be a single character' };
  }
  if (!/^[a-zA-Z]$/.test(middleInitial)) {
    return { valid: false, error: 'Middle initial must be a letter' };
  }
  return { valid: true };
};

// Confirm password validation
export const validateConfirmPassword = (password, confirmPassword) => {
  if (!confirmPassword) {
    return { valid: false, error: 'Please confirm your password' };
  }
  if (password !== confirmPassword) {
    return { valid: false, error: 'Passwords do not match' };
  }
  return { valid: true };
};

// OTP validation (6 digits)
export const validateOTP = (code) => {
  if (!code) {
    return { valid: false, error: 'OTP code is required' };
  }
  if (!/^\d{6}$/.test(code)) {
    return { valid: false, error: 'OTP code must be 6 digits' };
  }
  return { valid: true };
};

// Format code input (add spaces for readability, only digits)
export const formatCodeInput = (value) => {
  let formatted = value.replace(/\D/g, ''); // Remove non-digits
  if (formatted.length > 6) {
    formatted = formatted.slice(0, 6); // Limit to 6 digits
  }
  return formatted;
};

// Full name validation (letters and spaces only)
export const validateFullName = (name) => {
  if (!name || name.trim().length < 2) {
    return { valid: false, error: 'Full name must be at least 2 characters' };
  }
  if (!/^[a-zA-Z\s]+$/.test(name)) {
    return { valid: false, error: 'Full name can only contain letters and spaces' };
  }
  return { valid: true };
};

// Letter input validation (Tagalog alphabet)
export const validateLetterInput = (input) => {
  const tagalogLetters = /^[A-Za-z\s]*$/;
  return tagalogLetters.test(input);
};

// Assessment numeric input (0-100)
export const validateScore = (score) => {
  const num = parseInt(score);
  if (isNaN(num) || num < 0 || num > 100) {
    return { valid: false, error: 'Score must be between 0 and 100' };
  }
  return { valid: true };
};

// Form field validation
export const validateField = (fieldName, value) => {
  switch (fieldName) {
    case 'fullName':
      return validateFullName(value);
    case 'email':
      return validateEmail(value);
    case 'password':
      return validatePassword(value);
    case 'letterInput':
      return validateLetterInput(value) ? { valid: true } : { valid: false, error: 'Only letters and spaces allowed' };
    case 'score':
      return validateScore(value);
    default:
      return { valid: true };
  }
};

// Real-time input sanitization
export const sanitizeInput = (input, type = 'text') => {
  if (!input) return '';
  
  // Remove XSS attempts
  const sanitized = input
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '');
  
  switch (type) {
    case 'email':
      return sanitized.toLowerCase().trim();
    case 'name':
      return sanitized.replace(/[^a-zA-Z\s]/g, '').trim();
    case 'letterOnly':
      return sanitized.replace(/[^a-zA-Z\s]/g, '');
    case 'alphanumeric':
      return sanitized.replace(/[^a-zA-Z0-9\s]/g, '');
    default:
      return sanitized;
  }
};

// Verification code validation
export const validateVerificationCode = (code) => {
  if (!code) {
    return { valid: false, error: 'Verification code is required' };
  }
  
  if (!/^\d{6}$/.test(code)) {
    return { valid: false, error: 'Verification code must be 6 digits' };
  }
  
  return { valid: true };
};

const validationUtils = {
  validatePassword,
  validateEmail,
  validateFirstName,
  validateLastName,
  validateMiddleInitial,
  validateConfirmPassword,
  validateFullName,
  validateLetterInput,
  validateScore,
  validateField,
  validateVerificationCode,
  validateOTP,
  sanitizeInput,
  formatCodeInput,
};

export default validationUtils;
