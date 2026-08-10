import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { FiAlertCircle, FiCheck, FiEye, FiEyeOff, FiMail } from 'react-icons/fi';
import { authService } from '../services/api';
import { validateEmail, validatePassword, validateVerificationCode } from '../services/validation';
import './Auth.css';

export default function ResetPassword() {
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState(location.state?.email || '');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleEmailChange = (event) => {
    setEmail(event.target.value.trim());
    setFieldErrors((prev) => ({ ...prev, email: '' }));
    setApiError('');
  };

  const handleCodeChange = (event) => {
    const value = event.target.value.replace(/\D/g, '').slice(0, 6);
    setResetCode(value);
    setFieldErrors((prev) => ({ ...prev, resetCode: '' }));
    setApiError('');
  };

  const handlePasswordChange = (event) => {
    setNewPassword(event.target.value);
    setFieldErrors((prev) => ({ ...prev, newPassword: '' }));
    setApiError('');
  };

  const handleConfirmPasswordChange = (event) => {
    setConfirmPassword(event.target.value);
    setFieldErrors((prev) => ({ ...prev, confirmPassword: '' }));
    setApiError('');
  };

  const validateForm = () => {
    const nextErrors = {};
    const emailValidation = validateEmail(email);
    const codeValidation = validateVerificationCode(resetCode);
    const passwordValidation = validatePassword(newPassword);

    if (!emailValidation.valid) {
      nextErrors.email = emailValidation.error;
    }

    if (!codeValidation.valid) {
      nextErrors.resetCode = codeValidation.error;
    }

    if (!passwordValidation.valid) {
      nextErrors.newPassword = passwordValidation.errors[0];
    }

    if (newPassword !== confirmPassword) {
      nextErrors.confirmPassword = 'Passwords do not match';
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setApiError('');

    if (!validateForm()) {
      return;
    }

    setLoading(true);
    try {
      const response = await authService.resetPassword({
        email: email.toLowerCase(),
        resetCode,
        newPassword,
        confirmPassword,
      });

      if (!response.data?.success) {
        setApiError(response.data?.message || 'Failed to reset password. Please try again.');
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        navigate('/login', { state: { message: 'Password reset successfully! Please log in.' } });
      }, 1800);
    } catch (error) {
      console.error('[ResetPassword] Password reset failed:', {
        message: error?.message,
        status: error?.status || error?.response?.status,
        response: error?.response?.data,
      });

      if (Array.isArray(error.response?.data?.errors)) {
        setApiError(error.response.data.errors.map((item) => item.message).join('. '));
      } else {
        setApiError(error.response?.data?.message || error.message || 'Failed to reset password. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="auth-container">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <FiCheck size={64} style={{ color: 'var(--success-color)', marginBottom: '1rem' }} />
          <h2>Password Reset!</h2>
          <p>Your password has been successfully updated. Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h1>Reset Password</h1>
          <p>Enter the code from your email and choose a new password.</p>
        </div>

        {apiError && (
          <div className="alert alert-error">
            <FiAlertCircle className="alert-icon" />
            <span>{apiError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="form">
          <div className="form-group">
            <label className="form-label form-label-required">Email Address</label>
            <div className="input-wrapper">
              <input
                type="email"
                value={email}
                onChange={handleEmailChange}
                placeholder="you@example.com"
                disabled={loading}
                className={`form-input ${fieldErrors.email ? 'error' : email ? 'success' : ''}`}
              />
              <FiMail style={{ position: 'absolute', right: '1rem', color: 'var(--text-light)' }} />
            </div>
            {fieldErrors.email && (
              <div className="field-error">
                <FiAlertCircle size={14} /> {fieldErrors.email}
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label form-label-required">Reset Code</label>
            <div className="input-wrapper">
              <input
                type="text"
                inputMode="numeric"
                maxLength="6"
                value={resetCode}
                onChange={handleCodeChange}
                placeholder="000000"
                disabled={loading}
                className={`form-input ${fieldErrors.resetCode ? 'error' : resetCode.length === 6 ? 'success' : ''}`}
                style={{
                  fontFamily: 'monospace',
                  fontSize: '1.35rem',
                  fontWeight: 700,
                  letterSpacing: '0.35rem',
                  textAlign: 'center',
                }}
              />
            </div>
            {fieldErrors.resetCode && (
              <div className="field-error">
                <FiAlertCircle size={14} /> {fieldErrors.resetCode}
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label form-label-required">New Password</label>
            <div className="input-wrapper">
              <input
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={handlePasswordChange}
                placeholder="********"
                disabled={loading}
                className={`form-input ${fieldErrors.newPassword ? 'error' : newPassword ? 'success' : ''}`}
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowPassword((current) => !current)}
                disabled={loading}
              >
                {showPassword ? <FiEyeOff /> : <FiEye />}
              </button>
            </div>
            {fieldErrors.newPassword && (
              <div className="field-error">
                <FiAlertCircle size={14} /> {fieldErrors.newPassword}
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label form-label-required">Confirm Password</label>
            <div className="input-wrapper">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={handleConfirmPasswordChange}
                placeholder="********"
                disabled={loading}
                className={`form-input ${fieldErrors.confirmPassword ? 'error' : confirmPassword ? 'success' : ''}`}
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowConfirmPassword((current) => !current)}
                disabled={loading}
              >
                {showConfirmPassword ? <FiEyeOff /> : <FiEye />}
              </button>
            </div>
            {fieldErrors.confirmPassword && (
              <div className="field-error">
                <FiAlertCircle size={14} /> {fieldErrors.confirmPassword}
              </div>
            )}
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Updating Password...' : 'Update Password'}
          </button>
        </form>

        <p className="auth-footer">
          Need a code? <Link to="/forgot-password">Request password reset</Link>
          <br />
          <Link to="/login">Back to Login</Link>
        </p>
      </div>
    </div>
  );
}
