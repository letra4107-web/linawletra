/**
 * Client Configuration
 * Frontend environment variables
 */

const getApiBaseUrl = () => {
  return process.env.REACT_APP_API_URL || process.env.EXPO_PUBLIC_API_URL || process.env.API_BASE_URL || 'http://localhost:5002/api';
};

const config = {
  // API Configuration
  api: {
    baseURL: getApiBaseUrl(),
    timeout: 10000, // 10 seconds
    headers: {
      'Content-Type': 'application/json',
    },
  },

  // Authentication
  auth: {
    tokenKey: 'linawletra_token',
    userKey: 'linawletra_user',
    tokenExpiry: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
  },

  // Email Verification
  emailVerification: {
    codeLength: 6,
    resendCooldown: 5 * 60 * 1000, // 5 minutes
    timerDuration: 5 * 60, // 5 minutes in seconds
  },

  // Password Reset
  passwordReset: {
    codeLength: 6,
    timerDuration: 1 * 60 * 60, // 1 hour in seconds
    password: {
      minLength: 8,
      requireUppercase: true,
      requireLowercase: true,
      requireNumber: true,
      requireSpecialChar: true,
    },
  },

  // Form Validation
  validation: {
    fullName: {
      minLength: 2,
      maxLength: 50,
      pattern: /^[a-zA-Z\s]+$/, // Letters and spaces only
    },
    email: {
      pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, // Simple email validation
      maxLength: 120,
    },
    password: {
      minLength: 8,
      maxLength: 128,
      pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^])[a-zA-Z\d@$!%*?&#^]/,
    },
    file: {
      maxSize: 5 * 1024 * 1024, // 5MB
      allowedTypes: ['image/jpeg', 'image/png', 'application/pdf'],
      allowedExtensions: ['jpg', 'jpeg', 'png', 'pdf'],
    },
  },

  // Assessment Configuration
  assessment: {
    maxScore: 100,
    minScore: 0,
    categories: [
      'alphabetRecognition',
      'letterIdentification',
      'letterFormation',
      'readingAbility',
      'writingAbility',
    ],
    sessionTypes: [
      'assessment',
      'lesson',
      'review',
      'practice',
    ],
  },

  // UI Configuration
  ui: {
    defaultPageSize: 10,
    toastDuration: 3000, // milliseconds
    animationDuration: 300, // milliseconds
    breakpoints: {
      mobile: 320,
      tablet: 768,
      desktop: 1024,
    },
  },

  // Feature Flags
  features: {
    emailVerification: true,
    passwordReset: true,
    twoFactorAuth: false,
    socialLogin: false,
  },

  // Dyslexia-Friendly Settings
  accessibility: {
    font: 'Josefin Sans', // Dyslexia-friendly font
    fontSize: '16px', // Readable default
    lineHeight: 1.8, // Increased line height for readability
    letterSpacing: '0.06em', // Increased letter spacing
    colors: {
      primary: '#2d9c78', // Green
      secondary: '#1e5a96', // Blue
      error: '#ef4444', // Red
      warning: '#f59e0b', // Amber
      success: '#10b981', // Green
    },
  },

  // Logging
  logging: {
    enabled: process.env.NODE_ENV === 'development',
    level: process.env.NODE_ENV === 'production' ? 'error' : 'debug',
  },
};

// Validate required variables
const validateClientConfig = () => {
  const apiEnvKeys = ['REACT_APP_API_URL', 'EXPO_PUBLIC_API_URL', 'API_BASE_URL'];
  const hasApiUrl = apiEnvKeys.some((key) => Boolean(process.env[key]));

  if (!hasApiUrl && process.env.NODE_ENV === 'production') {
    console.error('Missing required environment variable: REACT_APP_API_URL, EXPO_PUBLIC_API_URL, or API_BASE_URL');
  }
};

// Validate on module load
validateClientConfig();

export default config;
