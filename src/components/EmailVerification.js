import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  FiAlertCircle,
  FiCheckCircle,
  FiLock,
  FiMail,
  FiRefreshCw,
  FiArrowRight,
} from 'react-icons/fi';
import { authService } from '../services/api';
import { validateVerificationCode } from '../services/validation';
import { AuthContext } from '../context/AuthContext';
import styles from './Login.module.css';
import verificationStyles from './EmailVerification.module.css';
import './Auth.css';

export default function EmailVerification() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, login } = useContext(AuthContext);
  const inputRefs = useRef([]);

  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);

  const email = useMemo(
    () =>
      location.state?.email ||
      user?.email ||
      localStorage.getItem('verificationEmail') ||
      '',
    [location.state?.email, user?.email]
  );

  const isLoginFlow = location.state?.isLoginFlow || false;

  const getDashboardRoute = (role) => {
    const normalizedRole = String(role || '').toLowerCase();
    if (normalizedRole === 'parent') return '/parent/summary';
    if (normalizedRole === 'student') return '/student-dashboard';
    if (normalizedRole === 'teacher') return '/teacher-dashboard';
    if (normalizedRole === 'admin') return '/admin-dashboard/overview';
    return '/login';
  };

  const message =
    location.state?.message ||
    (isLoginFlow
      ? 'A verification code has been sent to your email. Enter it to complete login.'
      : 'We sent a 6-digit verification code to your email. Enter it below to verify your account.');

  useEffect(() => {
    if (!email && !user) {
      navigate('/login', {
        replace: true,
        state: {
          message: 'Email address missing. Please log in and try again.'
        }
      });
      return;
    }

    if (user?.emailVerified) {
      setSuccess(true);
      const redirectTimer = setTimeout(() => navigate('/dashboard'), 1200);
      return () => clearTimeout(redirectTimer);
    }

    inputRefs.current[0]?.focus();
  }, [email, navigate, user, user?.emailVerified]);

  useEffect(() => {
    const updateCountdown = () => {
      const resendAvailableAt = Number(
        localStorage.getItem('verificationResendAvailableAt') || 0
      );

      if (!resendAvailableAt) {
        setResendCountdown(0);
        return;
      }

      const secondsLeft = Math.max(
        0,
        Math.ceil((resendAvailableAt - Date.now()) / 1000)
      );
      setResendCountdown(secondsLeft);

      if (secondsLeft === 0) {
        localStorage.removeItem('verificationResendAvailableAt');
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, []);

  // Registration and login already send the OTP before navigating here.
  // Only auto-send as a recovery path when the page is opened directly.
  useEffect(() => {
    const autoSendOTP = async () => {
      const otpAlreadySent = localStorage.getItem('verificationOtpSent');
      const locationState = location.state?.otpAutoSent;

      if (otpAlreadySent || locationState) {
        console.log('[EmailVerification] OTP already auto-sent, skipping');
        localStorage.removeItem('verificationOtpSent');
        return;
      }

      if (location.state?.email || isLoginFlow) {
        console.log('[EmailVerification] OTP was sent before navigation, skipping auto resend');
        return;
      }

      if (!email) {
        setError('Email address is missing. Please go back and try again.');
        return;
      }

      console.log('[EmailVerification] Auto-sending OTP for:', email);
      try {
        setLoading(true);
        await authService.resendVerificationCode(email.toLowerCase());
        console.log('[EmailVerification] ✓ OTP auto-sent successfully');
        setEmailSent(true);
        setTimeout(() => setEmailSent(false), 5000);
        localStorage.setItem('verificationResendAvailableAt', new Date(Date.now() + 60 * 1000).getTime());
        setResendCountdown(60);
      } catch (error) {
        console.warn('[EmailVerification] ⚠ Failed to auto-send OTP:', error.message);
        setError('Failed to send verification code automatically. Please use the Resend button.');
      } finally {
        setLoading(false);
      }
    };
    const timer = setTimeout(autoSendOTP, 500);
    return () => clearTimeout(timer);
  }, [email, isLoginFlow]);

  const focusInput = (index) => {
    if (index >= 0 && index < inputRefs.current.length) {
      inputRefs.current[index]?.focus();
      inputRefs.current[index]?.select?.();
    }
  };

  const updateCodeFromValue = (value) => {
    const digits = value.replace(/\D/g, '').slice(0, 6).split('');
    const nextDigits = Array(6).fill('');

    digits.forEach((digit, index) => {
      nextDigits[index] = digit;
    });

    setOtpDigits(nextDigits);
    return nextDigits;
  };

  const handleOTPChange = (index, value) => {
    const sanitizedValue = value.replace(/\D/g, '');
    setError('');

    if (sanitizedValue.length > 1) {
      const nextDigits = updateCodeFromValue(sanitizedValue);
      const filledDigits = nextDigits.join('');
      focusInput(Math.min(filledDigits.length, 5));

      if (filledDigits.length === 6) {
        handleVerifyCode(filledDigits);
      }
      return;
    }

    const nextDigits = [...otpDigits];
    nextDigits[index] = sanitizedValue;
    setOtpDigits(nextDigits);

    if (sanitizedValue && index < 5) {
      focusInput(index + 1);
    }

    const joinedCode = nextDigits.join('');
    if (joinedCode.length === 6) {
      handleVerifyCode(joinedCode);
    }
  };

  const handleKeyDown = (index, event) => {
    if (event.key === 'Backspace' && !otpDigits[index] && index > 0) {
      focusInput(index - 1);
    }

    if (event.key === 'ArrowLeft' && index > 0) {
      focusInput(index - 1);
    }

    if (event.key === 'ArrowRight' && index < 5) {
      focusInput(index + 1);
    }
  };

  const handlePaste = (event) => {
    event.preventDefault();
    const pastedText = event.clipboardData.getData('text');
    const nextDigits = updateCodeFromValue(pastedText);
    const joinedCode = nextDigits.join('');

    focusInput(Math.min(joinedCode.length, 5));

    if (joinedCode.length === 6) {
      handleVerifyCode(joinedCode);
    }
  };

  const handleVerifyCode = async (providedCode) => {
    const verificationCode = providedCode || otpDigits.join('');
    const validation = validateVerificationCode(verificationCode);

    if (!validation.valid) {
      setError(validation.error);
      return;
    }

    if (!email) {
      setError('Email address is missing. Please go back and try again.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      let result;
      
      if (isLoginFlow) {
        // Verify login OTP (uses otpCode parameter for 2FA)
        result = await authService.verifyLoginOTP({
          email: email.toLowerCase(),
          otpCode: verificationCode,
        });
      } else {
        // Verify email registration OTP (uses code parameter for email verification)
        result = await authService.verifyEmail({
          email: email.toLowerCase(),
          code: verificationCode,
        });
      }

      if (result.data.success) {
        setSuccess(true);

        // If backend provided a session token and user object, auto-login (signup or login flow)
        if (result.data.token && result.data.user) {
          const userObject = {
            ...result.data.user,
            role: String(result.data.user.role || '').toLowerCase(),
            emailVerified: true,
          };

          login(userObject, result.data.token);

          const dashboardRoute = getDashboardRoute(userObject.role);
          setTimeout(() => {
            navigate(dashboardRoute, { replace: true });
          }, 1200);
        } else if (isLoginFlow && result.data.token && result.data.user) {
          // redundant fallback for older backend responses
          const userObject = {
            ...result.data.user,
            role: String(result.data.user.role || '').toLowerCase(),
            emailVerified: true,
          };
          login(userObject, result.data.token);
          const dashboardRoute = getDashboardRoute(userObject.role);
          setTimeout(() => navigate(dashboardRoute, { replace: true }), 1200);
        } else {
          // No token provided — redirect to login as a fallback
          setTimeout(() => {
            navigate('/login', {
              replace: true,
              state: {
                message: 'Email verified successfully! Please log in to continue.',
                email: email,
              },
            });
          }, 1200);
        }
      }
    } catch (err) {
      console.error('Email verification failed:', err);
      setError(err.response?.data?.message || 'Invalid or expired code. Please try again.');
      setOtpDigits(['', '', '', '', '', '']);
      focusInput(0);
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (resendCountdown > 0 || resendLoading) {
      return;
    }

    if (!email) {
      setError('Email address is missing. Please go back and try again.');
      return;
    }

    setResendLoading(true);
    setError('');

    try {
      if (isLoginFlow) {
        // Resend login OTP
        await authService.resendLoginOTP(email.toLowerCase());
      } else {
        // Resend registration verification code
        const resp = await authService.resendVerificationCode(email.toLowerCase());
        // If backend returned cooldownRemaining, use it (seconds)
        if (resp?.data?.cooldownRemaining) {
          setResendCountdown(Number(resp.data.cooldownRemaining));
          localStorage.setItem('verificationResendAvailableAt', new Date(Date.now() + Number(resp.data.cooldownRemaining) * 1000).getTime());
        }
      }
      
      // If backend didn't provide cooldown, fallback to 60 seconds
      if (resendCountdown === 0) {
        setResendCountdown(60);
        localStorage.setItem('verificationResendAvailableAt', new Date(Date.now() + 60 * 1000).getTime());
      }
      setEmailSent(true);
      setOtpDigits(['', '', '', '', '', '']);
      focusInput(0);
      setTimeout(() => setEmailSent(false), 5000);
    } catch (err) {
      console.error('Error resending verification code:', err);
      setError(err.response?.data?.message || 'Unable to resend code. Please try again.');
    } finally {
      setResendLoading(false);
    }
  };

  const handleContinueToLogin = () => {
    navigate('/login');
  };

  if (success) {
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
          <main className={styles.formColumn}>
            <div className={styles.pageBrand}>
              <img src="/logo.png" alt="LinawLetra logo" className={styles.brandLogo} />
              <span className={styles.brandName}>LinawLetra</span>
              <p className={styles.brandTagline}>Basahin. Matuto. Lumago.</p>
            </div>
            <section className={styles.authCard}>
              <div className={styles.successCard}>
                <FiCheckCircle className={verificationStyles.successIcon} />
                <h1 className={verificationStyles.successTitle}>
                  {isLoginFlow ? 'Login Verified!' : 'Email Verified!'}
                </h1>
                <p className={verificationStyles.successMessage}>
                  {isLoginFlow
                    ? 'Your login has been verified successfully. Redirecting to your dashboard...'
                    : 'Your account has been verified successfully. Redirecting to your dashboard...'}
                </p>
              </div>
            </section>
          </main>
        </div>
      </div>
    );
  }

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
        <main className={styles.formColumn}>
          <div className={styles.pageBrand}>
            <img src="/logo.png" alt="LinawLetra logo" className={styles.brandLogo} />
            <span className={styles.brandName}>LinawLetra</span>
            <p className={styles.brandTagline}>Basahin. Matuto. Lumago.</p>
          </div>
          <section className={styles.authCard}>
            <div className={styles.cardHeader}>
              <FiMail style={{ width: '2rem', height: '2rem', color: 'var(--color-indigo-500)', marginBottom: 'var(--space-2)' }} />
              <h1 className={styles.cardTitle}>Verify Your Email</h1>
              <p className={styles.cardSubtitle}>{message}</p>
            </div>

            <div className={verificationStyles.emailInfoBox}>
              <div className={verificationStyles.emailAddress}>{email || 'Your email address'}</div>
              <div className={verificationStyles.emailSource}>
                Check for a message from <strong>letra4107@gmail.com</strong>
              </div>
            </div>

            {error && (
              <div className={verificationStyles.alert}>
                <FiAlertCircle className={verificationStyles.alertIcon} />
                <span>{error}</span>
              </div>
            )}

            {emailSent && (
              <div className={verificationStyles.alert}>
                <FiCheckCircle className={verificationStyles.alertIcon} />
                <span>A new verification code has been sent. Please check your inbox.</span>
              </div>
            )}

            <form
              onSubmit={(event) => {
                event.preventDefault();
                handleVerifyCode();
              }}
            >
              <div style={{ marginBottom: 'var(--space-4)' }}>
                <label className={verificationStyles.otpLabel}>Enter 6-Digit Code</label>

                <div className={verificationStyles.otpGrid}>
                  {otpDigits.map((digit, index) => (
                    <input
                      key={`otp-${index}`}
                      ref={(element) => {
                        inputRefs.current[index] = element;
                      }}
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={1}
                      value={digit}
                      disabled={loading}
                      onChange={(event) => handleOTPChange(index, event.target.value)}
                      onKeyDown={(event) => handleKeyDown(index, event)}
                      onPaste={handlePaste}
                      className={`${verificationStyles.otpInput} ${error ? verificationStyles.error : ''}`}
                    />
                  ))}
                </div>

                <p className={verificationStyles.otpExpiry}>
                  Code expires in <strong>10 minutes</strong>
                </p>
              </div>

              <div className={styles.formActions}>
                <button
                  type="submit"
                  disabled={loading || otpDigits.join('').length !== 6}
                  className={styles.submitButton}
                >
                  {loading ? 'Verifying...' : 'Verify Account'}
                  {!loading && <FiArrowRight />}
                </button>

                <button
                  type="button"
                  onClick={handleResendVerification}
                  disabled={resendLoading || resendCountdown > 0}
                  className={styles.secondaryButton}
                >
                  {resendLoading ? (
                    <>
                      <FiRefreshCw className={verificationStyles.spinning} />
                      Sending...
                    </>
                  ) : (
                    <>
                      <FiMail />
                      {resendCountdown > 0
                        ? `Resend Code in ${resendCountdown}s`
                        : 'Resend Code'}
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleContinueToLogin}
                  className={styles.secondaryButton}
                >
                  Back to Login
                </button>
              </div>
            </form>

            <div className={verificationStyles.securityNotice}>
              <FiLock className={verificationStyles.securityIcon} />
              <span>
                For security, only verified accounts can access LinawLetra. Never share your OTP code with anyone.
              </span>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
