import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { FiArrowRight, FiMail } from 'react-icons/fi';
import { authService } from '../services/api';
import { validateEmail } from '../services/validation';
import InputField from './InputField';
import Alert from './Alert';
import styles from './ForgotPassword.module.css';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [globalError, setGlobalError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const emailValidation = validateEmail(email);
  const emailIsValid = emailValidation.valid;

  const handleEmailChange = (event) => {
    const nextEmail = event.target.value.trim();
    setEmail(nextEmail);

    if (fieldError) {
      setFieldError('');
    }
    if (globalError) {
      setGlobalError('');
    }
  };

  const handleEmailBlur = () => {
    if (!email) {
      setFieldError('Email is required.');
      return;
    }

    if (!emailIsValid) {
      setFieldError(emailValidation.error);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setGlobalError('');
    setFieldError('');

    if (!email) {
      setFieldError('Email is required.');
      return;
    }

    if (!emailIsValid) {
      setFieldError(emailValidation.error);
      return;
    }

    setLoading(true);

    try {
      const response = await authService.forgotPassword(email);

      if (response.data?.success) {
        setSubmitted(true);
        setTimeout(() => {
          navigate('/reset-code-verification', { state: { email } });
        }, 2000);
      } else {
        setGlobalError(response.data?.message || 'Unable to send reset link. Please try again.');
      }
    } catch (err) {
      if (err.response?.data?.errors && Array.isArray(err.response.data.errors)) {
        const errorMessages = err.response.data.errors.map((item) => item.message).join('. ');
        setGlobalError(errorMessages);
      } else {
        setGlobalError(err.response?.data?.message || 'Failed to send reset link. Please try again later.');
      }
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
        <main className={styles.formColumn}>
          <div className={styles.pageBrand}>
            <img src="/logo.png" alt="LinawLetra logo" className={styles.brandLogo} />
            <span className={styles.brandName}>LinawLetra</span>
            <p className={styles.brandTagline}>Basahin. Matuto. Lumago.</p>
          </div>
          <div className={styles.authCard}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>Forgot Password</h2>
              <p className={styles.cardSubtitle}>Enter your email address to receive a secure password reset link.</p>
            </div>

            {globalError && <Alert type="error" message={globalError} />}

            {submitted ? (
              <div className={styles.successPanel}>
                <Alert type="success" message="A password reset link has been sent to your email." />
                <p className={styles.confirmationText}>
                  Check your inbox for the link and follow the instructions to reset your password. You will be redirected shortly.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className={styles.form} noValidate>
                <InputField
                  label="Email Address"
                  name="email"
                  type="email"
                  value={email}
                  onChange={handleEmailChange}
                  onBlur={handleEmailBlur}
                  error={fieldError}
                  valid={Boolean(email && emailIsValid)}
                  disabled={loading}
                  hint="e.g. you@example.com"
                  icon={<FiMail />}
                />

                <button
                  type="submit"
                  className={styles.primaryButton}
                  disabled={loading || !emailIsValid}
                >
                  {loading ? 'Sending...' : 'Send Reset Link'}
                  <FiArrowRight aria-hidden="true" />
                </button>
              </form>
            )}

            <p className={styles.footer}>
              Remember your password?{' '}
              <Link to="/login" className={styles.footerLink}>
                Back to Sign In
              </Link>
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
