import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { FiArrowRight, FiBookOpen, FiMail, FiUser, FiLock } from 'react-icons/fi';
// Use backend auth service for registration
import { authService } from '../services/api';
import {
  sanitizeInput,
  validateEmail,
  validatePassword,
  validateFirstName,
  validateLastName,
  validateMiddleInitial,
  validateConfirmPassword,
} from '../services/validation';
import InputField from './InputField';
import Alert from './Alert';
import styles from './Register.module.css';
import './Auth.css';

const supabaseErrorMessages = {
  'email_rate_limit_exceeded': 'Too many signup attempts. Please wait 15–30 minutes before trying again.',
  'email_exists': 'Email already exists. Please use a different email or try logging in.',
  'user_already_exists': 'This email is already registered. Please log in instead.',
  'invalid_credentials': 'Invalid email or password.',
  'invalid_email_or_password': 'Invalid email or password.',
  'over_email_send_rate_limit': 'Too many emails sent. Please wait before trying again.',
  'over_request_rate_limit': 'Too many requests. Please wait before trying again.',
  'email_not_confirmed': 'Please verify your email before logging in.',
  'email_address_already_exists': 'Email already exists. Please use a different email or try logging in.',
};

const firebaseErrorMessages = {
  'auth/email-already-in-use': 'Email already exists. Please use a different email or try logging in.',
  'auth/weak-password': 'Password is too weak. Please use a stronger password.',
  'auth/invalid-email': 'Invalid email address.',
  'auth/operation-not-allowed': 'Email/password registration is not enabled.',
};

export default function Register() {
  const navigate = useNavigate();
  const [formValues, setFormValues] = useState({
    firstName: '',
    lastName: '',
    middleInitial: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [globalError, setGlobalError] = useState('');
  const [slideToLogin, setSlideToLogin] = useState(false);
  const [lastSubmitTime, setLastSubmitTime] = useState(0);

  const getFieldError = (name, value) => {
    switch (name) {
      case 'firstName': {
        const result = validateFirstName(value);
        return result.valid ? '' : result.error;
      }
      case 'lastName': {
        const result = validateLastName(value);
        return result.valid ? '' : result.error;
      }
      case 'middleInitial': {
        const result = validateMiddleInitial(value);
        return result.valid ? '' : result.error;
      }
      case 'email': {
        const result = validateEmail(value);
        return result.valid ? '' : result.error;
      }
      case 'password': {
        const result = validatePassword(value);
        return result.valid ? '' : result.errors[0];
      }
      case 'confirmPassword': {
        const result = validateConfirmPassword(formValues.password, value);
        return result.valid ? '' : result.error;
      }
      default:
        return '';
    }
  };

  const handleFieldChange = (event) => {
    const { name, value } = event.target;
    let nextValue = value;

    if (name === 'firstName' || name === 'lastName') {
      nextValue = sanitizeInput(value, 'name');
    } else if (name === 'email') {
      nextValue = sanitizeInput(value, 'email');
    } else if (name === 'middleInitial') {
      nextValue = value.toUpperCase().slice(0, 1);
    }

    const nextFormValues = {
      ...formValues,
      [name]: nextValue,
    };

    setFormValues(nextFormValues);

    const nextErrors = {
      ...fieldErrors,
      [name]: getFieldError(name, nextValue),
    };

    if (name === 'password' && nextFormValues.confirmPassword) {
      nextErrors.confirmPassword = validateConfirmPassword(nextValue, nextFormValues.confirmPassword).valid
        ? ''
        : validateConfirmPassword(nextValue, nextFormValues.confirmPassword).error;
    }

    setFieldErrors(nextErrors);
    setGlobalError('');
  };

  const handleBlur = (event) => {
    const { name, value } = event.target;
    setTouched((prev) => ({ ...prev, [name]: true }));
    setFieldErrors((prev) => ({
      ...prev,
      [name]: getFieldError(name, value),
    }));
  };

  const handleSignInClick = (event) => {
    event.preventDefault();
    setSlideToLogin(true);
    setTimeout(() => navigate('/login'), 260);
  };

  const mapSupabaseErrorMessage = (error) => {
    // Check for error.message containing common patterns
    if (!error) return 'An unknown error occurred';
    
    const message = (error.message || '').toLowerCase();
    const errorCode = (error.code || '').toLowerCase();
    
    // Check direct message mapping
    if (supabaseErrorMessages[errorCode]) {
      return supabaseErrorMessages[errorCode];
    }
    
    // Check if message contains rate limit keywords
    if (error.status === 429 || message.includes('rate limit') || message.includes('too many requests')) {
      return supabaseErrorMessages['email_rate_limit_exceeded'];
    }
    
    if (message.includes('already exists') || message.includes('already registered')) {
      return supabaseErrorMessages['user_already_exists'];
    }
    
    if (message.includes('invalid') && message.includes('credentials')) {
      return supabaseErrorMessages['invalid_credentials'];
    }
    
    if (message.includes('not confirmed')) {
      return supabaseErrorMessages['email_not_confirmed'];
    }
    
    // Fallback to Firebase errors if available
    if (firebaseErrorMessages[errorCode]) {
      return firebaseErrorMessages[errorCode];
    }
    
    // Return original message if no mapping found
    return error.message || 'Registration failed. Please try again.';
  };

  const validateForm = () => {
    const nextErrors = {
      firstName: getFieldError('firstName', formValues.firstName),
      lastName: getFieldError('lastName', formValues.lastName),
      middleInitial: getFieldError('middleInitial', formValues.middleInitial),
      email: getFieldError('email', formValues.email),
      password: getFieldError('password', formValues.password),
      confirmPassword: getFieldError('confirmPassword', formValues.confirmPassword),
    };

    setFieldErrors(nextErrors);
    setTouched({
      firstName: true,
      lastName: true,
      middleInitial: true,
      email: true,
      password: true,
      confirmPassword: true,
    });

    return !Object.values(nextErrors).some(Boolean);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;
    setGlobalError('');

    // Debounce: Prevent rapid multiple submissions (5 second cooldown)
    const now = Date.now();
    if (now - lastSubmitTime < 5000) {
      console.warn('[Register] Submit called too quickly, ignoring');
      return;
    }
    setLastSubmitTime(now);

    if (!validateForm()) {
      setGlobalError('Please fix the highlighted fields before continuing.');
      return;
    }

    setLoading(true);

    try {
      console.log('[Register] Calling backend auth/register');
      const payload = {
        firstName: formValues.firstName.trim(),
        lastName: formValues.lastName.trim(),
        middleInitial: formValues.middleInitial || null,
        email: formValues.email.toLowerCase(),
        password: formValues.password,
        role: 'parent',
      };

      const result = await authService.register(payload);
      const successMessage = result?.message || 'Registration successful. Please verify your email.';

      localStorage.setItem('verificationEmail', formValues.email.toLowerCase());
      console.log('[Register] Backend registration successful:', successMessage);

      navigate('/verify-email', {
        replace: true,
        state: {
          email: formValues.email.toLowerCase(),
          message: 'Please check your email and enter the verification code to complete registration.',
          otpAutoSent: true,
          otpMessage: 'A 6-digit verification code has been sent to your email.',
        },
      });
    } catch (err) {
      console.error('[Register] Registration error caught:', err);
      console.error('[Register] Error response data:', err.response?.data || err.data);

      let errorMessage = 'Registration failed. Please try again.';
      const responseData = err.response?.data || err.data;
      const statusCode = err.response?.status || err.status;

      if (responseData) {
        if (typeof responseData.message === 'string') {
          errorMessage = responseData.message;
          if (responseData.details) {
            console.error('[Register] Error details:', responseData.details);
          }
        } else if (typeof responseData.error === 'string') {
          errorMessage = responseData.error;
        } else if (Array.isArray(responseData.errors) && responseData.errors.length > 0) {
          errorMessage = responseData.errors.map((item) => item.message || item).join(' ');
        } else if (typeof responseData === 'string') {
          errorMessage = responseData;
        }
      } else if (err.message) {
        errorMessage = err.message;
      }

      // Handle email-specific errors
      if (errorMessage.toLowerCase().includes('email transporter') || 
          errorMessage.toLowerCase().includes('email transport') ||
          errorMessage.toLowerCase().includes('smtp')) {
        errorMessage = 'Email service is temporarily unavailable. Our team has been notified. Please try again in a few minutes.';
      } else if (errorMessage.toLowerCase().includes('sending verification email') ||
                 errorMessage.toLowerCase().includes('failed to send')) {
        errorMessage = 'We couldn\'t send the verification email. Please check your email address or try again in a moment.';
      }

      if (!responseData) {
        errorMessage = mapSupabaseErrorMessage(err);
      }

      if (statusCode === 429 || String(errorMessage).toLowerCase().includes('rate limit')) {
        errorMessage = 'Signup temporarily blocked due to too many attempts. Please wait 15–30 minutes or use a different email/IP.';
      }

      if (errorMessage.toLowerCase().includes('already registered') || errorMessage.toLowerCase().includes('already exists')) {
        errorMessage = 'Email already registered. Please log in instead.';
      }

      setGlobalError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const passwordResult = validatePassword(formValues.password);
  const passwordStrength = formValues.password ? passwordResult.strength : '';
  const strengthPercent = passwordStrength === 'strong'
    ? '100%'
    : passwordStrength === 'medium'
      ? '66%'
      : passwordStrength === 'weak'
        ? '34%'
        : '0%';

  return (
    <div
      className={styles.pageWrapper}
      style={{
        backgroundImage: 'url(/bg.png)',
        backgroundPosition: 'center',
        backgroundSize: 'cover',
        backgroundRepeat: 'no-repeat',
      }}
    >
      <div className={styles.authShell}>
        {/* Minimal Visual Panel */}
        <aside className={styles.visualPanel}>
          <div className={styles.logoSection}>
            <img src="/logo.png" alt="LinawLetra logo" className={styles.logo} />
            <p className={styles.tagline}>Learn with clarity. Read with confidence.</p>
          </div>
          <div className={styles.illustration}>
            <FiBookOpen size={120} />
          </div>
        </aside>

        <main className={styles.formColumn}>
          <div className={styles.pageBrand}>
            <img src="/logo.png" alt="LinawLetra logo" className={styles.brandLogo} />
            <span className={styles.brandName}>LinawLetra</span>
            <p className={styles.brandTagline}>Basahin. Matuto. Lumago.</p>
          </div>
          <div className={`${styles.authCard} ${slideToLogin ? styles.slideLeft : ''}`}>
            <div className={styles.tabRow}>
              <button type="button" onClick={handleSignInClick} className={styles.tabItem}>
                Sign In
              </button>
              <span className={`${styles.tabItem} ${styles.activeTab}`}>Create Account</span>
            </div>

            {globalError && (
              <div className={styles.formAlert}>
                <Alert type="error" message={globalError} />
              </div>
            )}

            <form
              onSubmit={handleSubmit}
              className={styles.formActions}
              noValidate
            >
              <div className={styles.nameRow}>
                <InputField
                  label="First Name"
                  name="firstName"
                  type="text"
                  value={formValues.firstName}
                  onChange={handleFieldChange}
                  onBlur={handleBlur}
                  error={touched.firstName ? fieldErrors.firstName : ''}
                  valid={Boolean(formValues.firstName && !fieldErrors.firstName)}
                  disabled={loading}
                  hint="e.g. María"
                  icon={<FiUser />}
                />

                <InputField
                  label="Last Name"
                  name="lastName"
                  type="text"
                  value={formValues.lastName}
                  onChange={handleFieldChange}
                  onBlur={handleBlur}
                  error={touched.lastName ? fieldErrors.lastName : ''}
                  valid={Boolean(formValues.lastName && !fieldErrors.lastName)}
                  disabled={loading}
                  hint="e.g. Santos"
                  icon={<FiUser />}
                />

                <InputField
                  label="M.I"
                  name="middleInitial"
                  type="text"
                  value={formValues.middleInitial}
                  onChange={handleFieldChange}
                  onBlur={handleBlur}
                  error={touched.middleInitial ? fieldErrors.middleInitial : ''}
                  valid={Boolean(formValues.middleInitial && !fieldErrors.middleInitial)}
                  disabled={loading}
                  hint="Optional"
                  icon={<FiUser />}
                />
              </div>

              <InputField
                label="Email Address"
                name="email"
                type="email"
                value={formValues.email}
                onChange={handleFieldChange}
                onBlur={handleBlur}
                error={touched.email ? fieldErrors.email : ''}
                valid={Boolean(formValues.email && !fieldErrors.email)}
                disabled={loading}
                hint="e.g. parent@email.com"
                icon={<FiMail />}
              />

              <InputField
                label="Password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={formValues.password}
                onChange={handleFieldChange}
                onBlur={handleBlur}
                error={touched.password ? fieldErrors.password : ''}
                valid={Boolean(formValues.password && !fieldErrors.password)}
                disabled={loading}
                showToggle
                isPasswordVisible={showPassword}
                onTogglePassword={() => setShowPassword((prev) => !prev)}
                hint="Minimum 8 characters, include a number and a symbol"
                icon={<FiLock />}
              />

              {formValues.password && (
                <div className={styles.passwordStrength}>
                  <span className={styles.strengthLabel}>Password strength: {passwordStrength || 'weak'}</span>
                  <div className={styles.strengthBar}>
                    <div
                      className={`${styles.strengthFill} ${styles[passwordStrength]}`}
                      style={{ width: strengthPercent }}
                    />
                  </div>
                </div>
              )}

              <InputField
                label="Confirm Password"
                name="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                value={formValues.confirmPassword}
                onChange={handleFieldChange}
                onBlur={handleBlur}
                error={touched.confirmPassword ? fieldErrors.confirmPassword : ''}
                valid={Boolean(formValues.confirmPassword && !fieldErrors.confirmPassword)}
                disabled={loading}
                showToggle
                isPasswordVisible={showConfirmPassword}
                onTogglePassword={() => setShowConfirmPassword((prev) => !prev)}
                hint="Repeat your password"
                icon={<FiLock />}
              />

              <p className={styles.policyCopy}>
                By creating an account, you agree to our{' '}
                <Link to="/terms" className={styles.policyLink}>Terms of Service</Link>{' '}
                and{' '}
                <Link to="/privacy" className={styles.policyLink}>Privacy Policy</Link>.
              </p>

              <button
                type="submit"
                disabled={loading || !formValues.firstName.trim() || !formValues.lastName.trim() || !formValues.email.trim() || !formValues.password || !formValues.confirmPassword || Object.values(fieldErrors).some(Boolean)}
                className={styles.submitButton}
                style={{ pointerEvents: loading ? 'none' : 'auto' }}
              >
                {loading ? 'Creating account...' : 'Create Account'}
                <FiArrowRight aria-hidden="true" />
              </button>
            </form>

            <p className={styles.authFooter}>
              Already have an account? <Link to="/login">Sign In</Link>
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
