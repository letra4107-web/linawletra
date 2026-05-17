import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { FiAlertCircle, FiCheck } from 'react-icons/fi';
import { authService } from '../services/api';
import { validateVerificationCode } from '../services/validation';
import './Auth.css';

export default function ResetCodeVerification() {
  const navigate = useNavigate();
  const location = useLocation();
  const email = location.state?.email || '';

  const [resetCode, setResetCode] = useState('');
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);
  const [timeLeft, setTimeLeft] = useState(3600); // 1 hour

  // Countdown timers
  useEffect(() => {
    if (timeLeft <= 0) {
      return;
    }
    const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
    return () => clearTimeout(timer);
  }, [timeLeft]);

  useEffect(() => {
    let interval;
    if (resendCountdown > 0) {
      interval = setInterval(() => {
        setResendCountdown(prev => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [resendCountdown]);

  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleCodeChange = (e) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6);
    setResetCode(value);
    if (fieldError) {
      setFieldError('');
    }
    setError('');
  };

  const validateCode = () => {
    const validation = validateVerificationCode(resetCode);
    if (!validation.valid) {
      setFieldError(validation.error);
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setFieldError('');

    if (!validateCode()) {
      return;
    }

    setLoading(true);
    try {
      const response = await authService.verifyResetCode({
        email,
        resetCode,
      });

      if (response.data.success) {
        // Navigate to new password page with verified code
        navigate('/new-password', {
          state: { email, resetCode }
        });
      } else {
        setError(response.data.message || 'Invalid or expired code');
      }
    } catch (err) {
      const errorMessage =
        err.response?.data?.message ||
        'Failed to verify code. Please try again.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (resendCountdown > 0) return;

    setLoading(true);
    setError('');

    try {
      const response = await authService.forgotPassword(email);
      if (response.data.success) {
        setResendCountdown(60);
        setResetCode('');
        setError('');
      } else {
        setError(response.data.message || 'Failed to resend code');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to resend code');
    } finally {
      setLoading(false);
    }
  };

  if (!email) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <p style={{ color: 'var(--error-color)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FiAlertCircle /> Session expired. Please request password reset again.
          </p>
          <button
            onClick={() => navigate('/forgot-password')}
            className="btn btn-primary"
            style={{ marginTop: '1rem' }}
          >
            Request Reset Code
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h1>Verify Reset Code</h1>
          <p>Enter the 6-digit code sent to <strong>{email}</strong></p>
          <p style={{ color: 'var(--text-light)', fontSize: '0.875rem', marginTop: '0.5rem' }}>
            Code expires in {formatTime(timeLeft)}
          </p>
        </div>

        {error && (
          <div className="alert alert-error">
            <FiAlertCircle className="alert-icon" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="form">
          {/* Reset Code */}
          <div className="form-group">
            <label className="form-label form-label-required">
              Verification Code
            </label>
            <div className="input-wrapper">
              <input
                type="text"
                inputMode="numeric"
                maxLength="6"
                value={resetCode}
                onChange={handleCodeChange}
                placeholder="000000"
                disabled={loading}
                className={`form-input ${fieldError ? 'error' : resetCode.length === 6 && !fieldError ? 'success' : ''}`}
                style={{
                  fontSize: '1.5rem',
                  textAlign: 'center',
                  letterSpacing: '0.5rem',
                  fontFamily: 'monospace',
                  fontWeight: '600'
                }}
                onPaste={(e) => e.preventDefault()} // Disable paste
              />
              {resetCode.length === 6 && !fieldError && (
                <FiCheck style={{ position: 'absolute', right: '1rem', color: 'var(--success-color)', fontSize: '1.2rem' }} />
              )}
            </div>
            {fieldError && (
              <div className="field-error">
                <FiAlertCircle size={14} />
                {fieldError}
              </div>
            )}
            <p style={{ fontSize: '0.8rem', color: 'var(--text-light)', marginTop: '0.5rem', textAlign: 'center' }}>
              ⚠️ Do not paste the code • Code expires in 10 minutes
            </p>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || resetCode.length !== 6}
            className="btn btn-primary"
          >
            {loading ? 'Verifying...' : 'Verify Code'}
          </button>
        </form>

        {/* Resend Code */}
        <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '0.75rem' }}>
            Didn't receive the code?
          </p>
          <button
            onClick={handleResendCode}
            disabled={resendCountdown > 0 || loading}
            style={{
              background: 'none',
              border: 'none',
              color: resendCountdown > 0 ? 'var(--text-light)' : 'var(--primary-color)',
              cursor: resendCountdown > 0 ? 'not-allowed' : 'pointer',
              fontSize: '0.95rem',
              fontWeight: '600',
              textDecoration: 'underline',
            }}
          >
            {resendCountdown > 0 ? `Resend in ${resendCountdown}s` : 'Resend Code'}
          </button>
        </div>

        {/* Back to Login */}
        <p className="auth-footer">
          <Link to="/login">Back to Login</Link>
        </p>
      </div>
    </div>
  );
}