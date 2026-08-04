import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  FiAlertCircle,
  FiCheckCircle,
  FiMail,
  FiRefreshCw,
} from 'react-icons/fi';
import { resendEmailVerificationCode } from '../services/supabaseAuth';
import { AuthContext } from '../context/AuthContext';
import styles from './Login.module.css';
import verificationStyles from './EmailVerification.module.css';
import './Auth.css';

export default function EmailVerification() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);

  const email = useMemo(
    () =>
      location.state?.email ||
      user?.email ||
      localStorage.getItem('verificationEmail') ||
      '',
    [location.state?.email, user?.email]
  );

  const message =
    location.state?.message ||
    'Please check your email for the verification link. Click the link in the email to verify your account.';

  useEffect(() => {
    if (!email && !user) {
      navigate('/login');
      return;
    }

    if (user?.emailVerified) {
      setSuccess(true);
      const redirectTimer = setTimeout(() => navigate('/dashboard'), 1200);
      return () => clearTimeout(redirectTimer);
    }
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

  const handleResendEmail = async () => {
    if (!email) {
      setError('Email address is missing. Please go back and try again.');
      return;
    }

    setResendLoading(true);
    setError('');

    try {
      await resendEmailVerificationCode(email);
      setEmailSent(true);
      setResendCountdown(60); // Reset countdown
      localStorage.setItem('verificationResendAvailableAt', Date.now() + 60000);
    } catch (err) {
      console.error('Resend email failed:', err);
      setError(err.message || 'Failed to resend verification email.');
    } finally {
      setResendLoading(false);
    }
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
                <h1 className={verificationStyles.successTitle}>Email Verified!</h1>
                <p className={verificationStyles.successMessage}>
                  Your account has been verified successfully. Redirecting to your dashboard...
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
              <h1 className={styles.cardTitle}>Check Your Email</h1>
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
                <span>Verification email resent successfully!</span>
              </div>
            )}

            <div className={verificationStyles.verificationActions}>
              <button
                type="button"
                onClick={handleResendEmail}
                disabled={resendLoading || resendCountdown > 0}
                className={`${styles.authButton} ${styles.secondaryButton} ${
                  resendLoading || resendCountdown > 0 ? styles.disabledButton : ''
                }`}
              >
                {resendLoading ? (
                  <>
                    <FiRefreshCw className={styles.loadingIcon} />
                    Sending...
                  </>
                ) : resendCountdown > 0 ? (
                  `Resend in ${resendCountdown}s`
                ) : (
                  <>
                    <FiRefreshCw className={styles.buttonIcon} />
                    Resend Verification Email
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => navigate('/login')}
                className={`${styles.authButton} ${styles.linkButton}`}
              >
                Back to Login
              </button>
            </div>

            <div className={verificationStyles.verificationHelp}>
              <p className={verificationStyles.helpText}>
                Didn't receive the email? Check your spam folder or click resend above.
              </p>
              <p className={verificationStyles.helpText}>
                The verification link will expire in 10 minutes.
              </p>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
