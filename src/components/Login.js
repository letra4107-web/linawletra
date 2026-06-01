import React, { useState, useContext } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { validateEmail } from '../services/validation';
import { authService } from '../services/api';
import { AuthContext } from '../context/AuthContext';
import { FiArrowRight, FiBookOpen, FiMail, FiLock } from 'react-icons/fi';
import Alert from './Alert';
import InputField from './InputField';
import styles from './Login.module.css';
import './Auth.css';

const supabaseErrorMessages = {
  'invalid_credentials': 'Invalid email or password.',
  'invalid_email_or_password': 'Invalid email or password.',
  'user_not_found': 'No account found with this email address.',
  'over_request_rate_limit': 'Too many login attempts. Please wait before trying again.',
};

const firebaseErrorMessages = {
  'auth/user-not-found': 'No account found with this email address.',
  'auth/wrong-password': 'Incorrect password.',
  'auth/too-many-requests': 'Too many login attempts. Please try again later.',
  'auth/user-disabled': 'This account has been disabled.',
};

export default function Login() {
  const [formValues, setFormValues] = useState({ email: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [touched, setTouched] = useState({ email: false, password: false });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [globalError, setGlobalError] = useState('');
  const [submitAttempts, setSubmitAttempts] = useState(0);
  const [slideToRegister, setSlideToRegister] = useState(false);
  const [lastSubmitTime, setLastSubmitTime] = useState(0);
  const navigate = useNavigate();
  const { login } = useContext(AuthContext);

  const rateLimitExceeded = submitAttempts >= 5;

  const handleCreateAccountClick = (event) => {
    event.preventDefault();
    setSlideToRegister(true);
    setTimeout(() => navigate('/register'), 260);
  };

  const validateField = (name, value) => {
    const errors = {};

    if (name === 'email') {
      if (!value.trim()) {
        errors.email = 'Email is required.';
      } else {
        const emailResult = validateEmail(value);
        if (!emailResult.valid) {
          errors.email = emailResult.error;
        }
      }
    }

    if (name === 'password') {
      if (!value) {
        errors.password = 'Password is required.';
      } else if (value.length < 6) {
        errors.password = 'Password must be at least 6 characters.';
      }
    }

    return errors;
  };

  const validateForm = () => {
    const emailErrors = validateField('email', formValues.email);
    const passwordErrors = validateField('password', formValues.password);
    const errors = { ...emailErrors, ...passwordErrors };
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const getAuthErrorMessage = (err) => {
    if (!err) return 'An unknown error occurred.';

    const message = (err.message || '').toLowerCase();
    const errorCode = (err.code || '').toLowerCase();

    if (errorCode && supabaseErrorMessages[errorCode]) {
      return supabaseErrorMessages[errorCode];
    }

    if (message.includes('not confirmed') || message.includes('email not confirmed')) {
      return 'Please verify your email before logging in. Check your inbox for the 6-digit code.';
    }

    if (message.includes('invalid') && message.includes('credentials')) {
      return supabaseErrorMessages['invalid_credentials'];
    }

    if (message.includes('user not found') || message.includes('no account')) {
      return supabaseErrorMessages['user_not_found'];
    }

    if (message.includes('rate limit')) {
      return supabaseErrorMessages['over_request_rate_limit'];
    }

    if (err.status === 400) {
      return supabaseErrorMessages['invalid_credentials'];
    }

    if (err.code && firebaseErrorMessages[err.code]) {
      return firebaseErrorMessages[err.code];
    }

    if (message.includes('auth/user-not-found')) {
      return firebaseErrorMessages['auth/user-not-found'];
    }
    if (message.includes('auth/wrong-password')) {
      return firebaseErrorMessages['auth/wrong-password'];
    }
    if (message.includes('auth/too-many-requests')) {
      return firebaseErrorMessages['auth/too-many-requests'];
    }
    if (message.includes('auth/user-disabled')) {
      return firebaseErrorMessages['auth/user-disabled'];
    }

    return err.message || 'Invalid email or password.';
  };

  const handleFieldChange = (event) => {
    const { name, value } = event.target;
    setFormValues((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => ({ ...prev, ...validateField(name, value) }));
    setGlobalError('');
  };

  const handleBlur = (event) => {
    const { name, value } = event.target;
    setTouched((prev) => ({ ...prev, [name]: true }));
    setFieldErrors((prev) => ({ ...prev, ...validateField(name, value) }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setGlobalError('');
    setTouched({ email: true, password: true });

    if (!validateForm()) {
      setGlobalError('Please fix the highlighted fields.');
      return;
    }

    // Debounce: Prevent rapid multiple submissions (5 second cooldown)
    const now = Date.now();
    if (now - lastSubmitTime < 5000) {
      console.warn('[Login] Submit called too quickly, ignoring');
      return;
    }
    setLastSubmitTime(now);

    if (rateLimitExceeded) {
      setGlobalError('Too many login attempts. Try again in 1 hour.');
      return;
    }

    setLoading(true);

    try {
      const email = formValues.email.toLowerCase();
      console.log('[Login] Signing in via backend for:', email);

      const response = await authService.login({
        email,
        password: formValues.password,
      });

      if (response.data?.requiresLoginOTP) {
        navigate('/verify-login-otp', {
          state: {
            email,
            message: response.data.message || 'A verification code has been sent to your email. Enter it to complete login.',
            isLoginFlow: true,
            otpSent: response.data.emailSent !== false,
          },
          replace: true,
        });
        return;
      }

      if (response.data?.requiresEmailVerification) {
        navigate('/verify-email', {
          state: {
            email,
            message: 'Please verify your email before logging in. A verification code was sent to your inbox.',
            isLoginFlow: true,
            otpAutoSent: true,
          },
          replace: true,
        });
        return;
      }

      if (response.data?.success && response.data?.user) {
        const token = response.data.token || response.data.session?.access_token;
        login(response.data.user, token);

        const normalizedRole = String(response.data.user.role || '').toLowerCase();
        if (normalizedRole === 'parent') navigate('/parent/summary', { replace: true });
        else if (normalizedRole === 'student') navigate('/student-dashboard', { replace: true });
        else if (normalizedRole === 'teacher') navigate('/teacher-dashboard', { replace: true });
        else navigate('/admin-dashboard/overview', { replace: true });
        return;
      }

      setGlobalError(response.data?.message || 'Login failed.');
    } catch (err) {
      console.error('[Login] Unexpected login error:', err);
      if (err.response?.data?.requiresEmailVerification) {
        navigate('/verify-email', {
          state: {
            email: formValues.email.toLowerCase(),
            message: 'Please verify your email before logging in. A verification code was sent to your inbox.',
            isLoginFlow: true,
            otpAutoSent: true,
          },
          replace: true,
        });
        return;
      }
      setGlobalError(err.response?.data?.message || err.message || 'Unexpected login error.');
    } finally {
        setLoading(false);
      }
    };
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

        {/* Login Form Column */}
        <main className={styles.formColumn}>
          <div className={styles.pageBrand}>
            <img src="/logo.png" alt="LinawLetra logo" className={styles.brandLogo} />
            <span className={styles.brandName}>LinawLetra</span>
            <p className={styles.brandTagline}>Basahin. Matuto. Lumago.</p>
          </div>
          <section className={`${styles.authCard} ${slideToRegister ? styles.slideRight : ''}`}>
            <div className={styles.tabRow}>
              <span className={`${styles.tabItem} ${styles.activeTab}`}>Sign In</span>
              <button type="button" onClick={handleCreateAccountClick} className={styles.tabItem}>Create Account</button>
            </div>

            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>Welcome back</h2>
              <p className={styles.cardSubtitle}>Sign in to continue your literacy journey.</p>
            </div>

            {globalError && <Alert type="error" message={globalError} />}

            <form onSubmit={handleSubmit} className={styles.formActions} noValidate>
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
                icon={<FiLock />}
                showToggle
                isPasswordVisible={showPassword}
                onTogglePassword={() => setShowPassword((prev) => !prev)}
              />

              <div className={styles.linkGroup}>
                <Link to="/forgot-password" className={styles.actionLink}>Forgot Password?</Link>
                <Link to="/resend-verification" className={styles.actionLink}>Need a new verification code?</Link>
              </div>

              <button
                type="submit"
                disabled={loading || !formValues.email.trim() || !formValues.password || rateLimitExceeded}
                className={styles.submitButton}
              >
                {loading ? 'Logging in...' : 'Sign In'}
                <FiArrowRight aria-hidden="true" />
              </button>
            </form>

            <p className={styles.authFooter}>
              Don't have an account?{' '}
              <Link to="/register">Create one now</Link>
            </p>
          </section>
        </main>
      </div>
    </div>
  );
}
