import rateLimit from 'express-rate-limit';

// General API rate limiter (100 requests per 15 minutes per IP)
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  skip: (req) => process.env.NODE_ENV === 'development', // Skip in development
});

// Strict rate limiter for Authentication endpoints (5 attempts per 15 minutes)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Stricter: only 5 attempts per windowMs
  message: {
    success: false,
    message: 'Too many registration/login attempts. Please try again in 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === 'development',
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'Too many registration/login attempts. Please try again in 15 minutes.',
    });
  },
});

// Email verification resend limiter (3 attempts per hour)
const verificationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Only 3 resend attempts per hour
  message: {
    success: false,
    message: 'Too many verification attempts. Please try again in 1 hour.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === 'development',
  keyGenerator: (req) => req.body?.email || req.ip, // Rate limit by email if available
});

// Password reset limiter (3 attempts per hour)
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Only 3 reset attempts per hour
  message: {
    success: false,
    message: 'Too many password reset attempts. Please try again in 1 hour.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === 'development',
  keyGenerator: (req) => req.body?.email || req.ip, // Rate limit by email if available
});

export {
  generalLimiter,
  authLimiter,
  verificationLimiter,
  passwordResetLimiter,
};
