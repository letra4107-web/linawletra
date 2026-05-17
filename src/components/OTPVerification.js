import React, { useState, useEffect, useContext } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { authService } from '../services/api';
import { validateOTP, formatCodeInput } from '../services/validation';
import { FiArrowRight, FiBookOpen, FiMail, FiLock, FiArrowLeft, FiAlertCircle } from 'react-icons/fi';
import { AuthContext } from '../context/AuthContext';
import styles from './Login.module.css';
import './Auth.css';

export default function OTPVerification() {
  const [otpCode, setOtpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendCountdown, setResendCountdown] = useState(0);
  const [email, setEmail] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpSendMessage, setOtpSendMessage] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useContext(AuthContext);

  const getDashboardRoute = (role) => {
    const normalizedRole = String(role || '').toLowerCase();
    if (normalizedRole === 'parent') return '/parent/summary';
    if (normalizedRole === 'student') return '/student-dashboard';
    if (normalizedRole === 'teacher') return '/teacher-dashboard';
    if (normalizedRole === 'admin') return '/admin-dashboard/overview';
    return '/login';
  };

  useEffect(() => {
    const state = location.state;
    if (!state?.email) {
      navigate('/login');
      return;
    }

    setEmail(state.email);
    setOtpSent(state.otpSent !== false);
    setOtpSendMessage(state.otpMessage || 'Enter the verification code sent to your email.');
  }, [location, navigate]);

  useEffect(() => {
    let interval;
    if (resendCountdown > 0) {
      interval = setInterval(() => {
        setResendCountdown((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [resendCountdown]);

  const handleOTPChange = (event) => {
    let value = formatCodeInput(event.target.value);
    setOtpCode(value);
    setError('');

    if (value.length === 6) {
      handleVerifyOTP(value);
    }
  };

  const handleVerifyOTP = async (code = otpCode) => {
    setError('');
    const validation = validateOTP(code);

    if (!validation.valid) {
      setError(validation.error);
      return;
    }

    setLoading(true);

    try {
      const response = await authService.verifyLoginOTP({
        email: email.toLowerCase(),
        // Ensure backend-required field name and exact 6-digit value
        otpCode: String(code).replace(/\D/g, '').slice(0, 6),
      });

      if (response.data.success && response.data.token && response.data.user) {
        console.log('[OTPVerification] Login successful, storing token and user');
        
        // Ensure user object has required fields
        const userObject = {
          ...response.data.user,
          emailVerified: true, // Mark as verified since OTP was successful
        };
        
        // Store in localStorage
        localStorage.setItem('token', response.data.token);
        localStorage.setItem('user', JSON.stringify(userObject));
        
        // Update auth context
        login(userObject, response.data.token);
        
        const dashboardRoute = getDashboardRoute(userObject.role);
        console.log('[OTPVerification] Navigating to role dashboard:', dashboardRoute, 'role:', userObject.role);
        navigate(dashboardRoute, { replace: true });

      } else {
        setError('Login failed. Please try again.');
      }
    } catch (err) {
      // Always show backend error message if available
      let backendMsg = err?.response?.data?.message || err?.message || 'Failed to verify OTP. Please try again.';
      setError(backendMsg);
      setOtpCode('');
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (resendCountdown > 0) return;

    setLoading(true);
    setError('');
    setOtpSendMessage('');

    try {
      const response = await authService.resendLoginOTP(email.toLowerCase());

      if (response.data.success) {
        setResendCountdown(60);
        setOtpCode('');
        setOtpSendMessage(response.data.message || 'OTP sent successfully');
        setOtpSent(true);
      } else {
        throw new Error(response.data.message || 'Failed to resend OTP');
      }
    } catch (err) {
      console.error('Resend OTP error:', err);
      setError(err.response?.data?.message || 'Failed to resend OTP.');
    } finally {
      setLoading(false);
    }
  };

  const handleBackToLogin = () => {
    navigate('/login');
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
        <main className={styles.formColumn}>
          <div className={styles.pageBrand}>
            <img src="/logo.png" alt="LinawLetra logo" className={styles.brandLogo} />
            <span className={styles.brandName}>LinawLetra</span>
            <p className={styles.brandTagline}>Secure sign-in with a second factor to protect your learning progress.</p>
          </div>

          <section className={styles.authCard}>
            <button
              type="button"
              onClick={handleBackToLogin}
              className={styles.secondaryButton}
              style={{ justifyContent: 'flex-start', marginBottom: '1.5rem' }}
            >
              <FiArrowLeft /> Back to Login
            </button>

            <div className={styles.cardHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                <FiLock style={{ width: '1.75rem', height: '1.75rem', color: 'var(--color-indigo-600)' }} />
                <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-slate-600)' }}>
                  OTP Verification
                </span>
              </div>
              <h1 className={styles.cardTitle}>Verify Your Identity</h1>
              <p className={styles.cardSubtitle}>A one-time code was sent to <strong>{email}</strong>.</p>
            </div>

            {error && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '1rem',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: '0.75rem',
                color: 'var(--color-red-600)',
                fontSize: '0.95rem',
                marginBottom: '1.5rem'
              }}>
                <FiAlertCircle />
                <span>{error}</span>
              </div>
            )}

            {otpSendMessage && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '1rem',
                backgroundColor: otpSent ? 'rgba(34, 197, 94, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                border: `1px solid ${otpSent ? 'rgba(34, 197, 94, 0.2)' : 'rgba(59, 130, 246, 0.2)'}`,
                borderRadius: '0.75rem',
                color: otpSent ? '#16a34a' : 'var(--color-indigo-600)',
                fontSize: '0.95rem',
                marginBottom: '1.5rem'
              }}>
                <FiAlertCircle />
                <span>{otpSendMessage}</span>
              </div>
            )}

            <form
              onSubmit={(event) => {
                event.preventDefault();
                handleVerifyOTP();
              }}
              className={styles.formActions}
            >
              <div>
                <label htmlFor="otpCode" style={{
                  display: 'block',
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  color: 'var(--color-slate-700)',
                  marginBottom: '0.5rem'
                }}>
                  Enter 6-Digit Code
                </label>
                <input
                  id="otpCode"
                  type="text"
                  value={otpCode}
                  onChange={handleOTPChange}
                  placeholder="000000"
                  maxLength="6"
                  disabled={loading}
                  autoFocus
                  style={{
                    width: '100%',
                    background: '#ffffff',
                    border: error ? '1px solid var(--color-red-500)' : '1px solid #e2e8f0',
                    borderRadius: '1.25rem',
                    padding: '1rem 1.25rem',
                    fontSize: '1.1rem',
                    fontWeight: 600,
                    textAlign: 'center',
                    letterSpacing: '0.5rem',
                    boxShadow: 'inset 0 1px 2px rgba(15, 23, 42, 0.04)',
                    transition: 'var(--transition-fast)'
                  }}
                />
                <p style={{
                  marginTop: '0.5rem',
                  fontSize: '0.875rem',
                  color: 'var(--color-slate-500)',
                  textAlign: 'center'
                }}>
                  Code expires in 10 minutes. Never share this code with anyone.
                </p>
              </div>

              <button
                type="submit"
                disabled={loading || otpCode.length !== 6}
                className={styles.submitButton}
              >
                {loading ? 'Verifying...' : 'Verify & Login'}
                <FiArrowRight aria-hidden="true" />
              </button>
            </form>

            <button
              type="button"
              onClick={handleResendCode}
              disabled={resendCountdown > 0 || loading}
              className={styles.secondaryButton}
              style={{ marginTop: '1rem' }}
            >
              {resendCountdown > 0 ? `Resend in ${resendCountdown}s` : 'Resend Code'}
            </button>
          </section>
        </main>
      </div>
    </div>
  );
}
