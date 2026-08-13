import React, { useContext, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FiMail, FiRefreshCw } from 'react-icons/fi';
import { AuthContext } from '../context/AuthContext';
import { resendEmailVerificationCode } from '../services/supabaseAuth';
import Alert from './Alert';
import InputField from './InputField';
import styles from './Login.module.css';
import './Auth.css';

export default function ResendVerification() {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const [email, setEmail] = useState(user?.email || localStorage.getItem('verificationEmail') || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [redirectCountdown, setRedirectCountdown] = useState(0);

  useEffect(() => {
    if (redirectCountdown > 0) {
      const timer = setTimeout(() => {
        setRedirectCountdown((previousCount) => previousCount - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }

    if (redirectCountdown === 0 && success) {
      navigate('/verify-email', {
        state: {
          email,
          message: 'We sent a fresh 6-digit verification code to your email.',
        },
      });
    }
  }, [redirectCountdown, success, email, navigate]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (!email) {
      setError('Please enter your email address to receive a new verification code.');
      return;
    }

    setLoading(true);

    try {
      await resendEmailVerificationCode(email);
      setSuccess('A new verification code has been sent to your email.');
      setRedirectCountdown(3);
    } catch (err) {
      setError(err.message || 'Failed to send verification code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.pageWrapper}>
      <div className={styles.authShell}>
        <main className={styles.formColumn}>
          <div className={styles.pageBrand}>
            <img src="/logo.png" alt="LinawLetra logo" className={styles.brandLogo} />
            <span className={styles.brandName}>LinawLetra</span>
            <p className={styles.brandTagline}>Basahin. Matuto. Lumago.</p>
          </div>
          <section className={styles.authCard}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>Resend Verification Code</h2>
              <p className={styles.cardSubtitle}>Enter the email address you used to sign up, and we’ll send a fresh verification code.</p>
            </div>

            {error && <Alert type="error" message={error} />}

            {success && redirectCountdown > 0 && (
              <div className={styles.successPanel}>
                <Alert type="success" message={success} />
                <p className={styles.redirectMessage}>
                  Redirecting to the verification screen in {redirectCountdown} seconds...
                </p>
              </div>
            )}

            <form onSubmit={handleSubmit} className={styles.formActions} noValidate>
              <InputField
                label="Email Address"
                name="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                onBlur={() => {
                  if (!email.trim()) {
                    setError('Please enter your email address to receive a new verification code.');
                  } else {
                    setError('');
                  }
                }}
                error={error}
                valid={Boolean(email && !error)}
                disabled={loading}
                icon={<FiMail />}
                hint="e.g. you@example.com"
              />

              <button
                type="submit"
                disabled={loading || !email.trim()}
                className={styles.submitButton}
              >
                {loading ? (
                  <>
                    <FiRefreshCw className={styles.spinning} />
                    Sending...
                  </>
                ) : (
                  'Send New Verification Code'
                )}
              </button>
            </form>

            <p className={styles.authFooter}>
              Remember your password?{' '}
              <Link to="/login">Back to Sign In</Link>
            </p>
          </section>
        </main>
      </div>
    </div>
  );
}
