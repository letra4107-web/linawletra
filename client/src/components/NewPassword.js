import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { FiAlertCircle, FiCheck, FiEye, FiEyeOff } from 'react-icons/fi';
import { authService } from '../services/api';
import { validatePassword } from '../services/validation';
import './Auth.css';

export default function NewPassword() {
  const navigate = useNavigate();
  const location = useLocation();
  const { email, resetCode } = location.state || {};

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [errors, setErrors] = useState({});
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');
  const [passwordStrength, setPasswordStrength] = useState('');
  const [success, setSuccess] = useState(false);

  const handlePasswordChange = (e) => {
    const value = e.target.value;
    setNewPassword(value);

    if (value) {
      const validation = validatePassword(value);
      setPasswordStrength(validation.strength);
      if (validation.errors.length > 0) {
        setFieldErrors(prev => ({ ...prev, newPassword: validation.errors[0] }));
      } else {
        setFieldErrors(prev => ({ ...prev, newPassword: '' }));
      }
    } else {
      setFieldErrors(prev => ({ ...prev, newPassword: '' }));
      setPasswordStrength('');
    }
  };

  const handleConfirmPasswordChange = (e) => {
    const value = e.target.value;
    setConfirmPassword(value);

    if (value && newPassword && value !== newPassword) {
      setFieldErrors(prev => ({ ...prev, confirmPassword: 'Passwords do not match' }));
    } else {
      setFieldErrors(prev => ({ ...prev, confirmPassword: '' }));
    }
  };

  const getPasswordStrengthColor = () => {
    switch (passwordStrength) {
      case 'weak':
        return 'var(--error-color)';
      case 'moderate':
        return '#f59e0b';
      case 'strong':
        return 'var(--success-color)';
      default:
        return 'var(--border-color)';
    }
  };

  const validateForm = () => {
    const newErrors = {};

    // Password
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.valid) {
      newErrors.newPassword = passwordValidation.errors[0];
    }

    // Confirm Password
    if (newPassword !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setApiError('');

    if (!email || !resetCode) {
      setApiError('Session expired. Please request password reset again.');
      return;
    }

    if (!validateForm()) {
      return;
    }

    setLoading(true);
    try {
      const response = await authService.resetPassword({
        email,
        resetCode,
        newPassword,
        confirmPassword,
      });

      if (response.data.success) {
        setSuccess(true);
        setTimeout(() => {
          navigate('/login', { state: { message: 'Password reset successfully! Please log in.' } });
        }, 2000);
      } else {
        setApiError(response.data.message || 'Failed to reset password');
      }
    } catch (error) {
      // Handle validation errors from backend
      if (error.response?.data?.errors && Array.isArray(error.response.data.errors)) {
        const errorMessages = error.response.data.errors
          .map(e => e.message)
          .join('. ');
        setApiError(errorMessages);
      } else {
        setApiError(error.response?.data?.message || 'Failed to reset password. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="auth-container">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <div style={{ marginBottom: '1rem' }}>
            <FiCheck
              size={64}
              style={{ color: 'var(--success-color)', margin: '0 auto' }}
            />
          </div>
          <h2 style={{ color: 'var(--success-color)', marginTop: 0 }}>Password Reset!</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
            Your password has been successfully reset. Redirecting to login...
          </p>
        </div>
      </div>
    );
  }

  if (!email || !resetCode) {
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
          <h1>Set New Password</h1>
          <p>Create a strong password for your account</p>
        </div>

        {apiError && (
          <div className="alert alert-error">
            <FiAlertCircle className="alert-icon" />
            <span>{apiError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="form">
          {/* New Password */}
          <div className="form-group">
            <label className="form-label form-label-required">
              New Password
            </label>
            <div className="input-wrapper">
              <input
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={handlePasswordChange}
                placeholder="••••••••"
                disabled={loading}
                className={`form-input ${errors.newPassword || fieldErrors.newPassword ? 'error' : newPassword && !fieldErrors.newPassword ? 'success' : ''}`}
                style={{ paddingRight: '1.75rem' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="password-toggle-btn"
                disabled={loading}
              >
                {showPassword ? <FiEyeOff /> : <FiEye />}
              </button>
            </div>

            {newPassword && (
              <div style={{ marginTop: '0.625rem', marginBottom: '0.375rem' }}>
                <div className="password-strength-meter">
                  <div
                    className={`password-strength-bar ${passwordStrength}`}
                  ></div>
                </div>
                <span className={`password-strength-text ${passwordStrength}`}>
                  Strength: {passwordStrength ? passwordStrength.charAt(0).toUpperCase() + passwordStrength.slice(1) : 'N/A'}
                </span>
              </div>
            )}

            {(errors.newPassword || fieldErrors.newPassword) && (
              <div className="field-error">
                <FiAlertCircle size={14} />
                {errors.newPassword || fieldErrors.newPassword}
              </div>
            )}
          </div>

          {/* Confirm Password */}
          <div className="form-group">
            <label className="form-label form-label-required">
              Confirm Password
            </label>
            <div className="input-wrapper">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={handleConfirmPasswordChange}
                placeholder="••••••••"
                disabled={loading}
                className={`form-input ${errors.confirmPassword || fieldErrors.confirmPassword ? 'error' : confirmPassword && newPassword === confirmPassword && !fieldErrors.confirmPassword ? 'success' : ''}`}
                style={{ paddingRight: '1.75rem' }}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="password-toggle-btn"
                disabled={loading}
              >
                {showConfirmPassword ? <FiEyeOff /> : <FiEye />}
              </button>
            </div>
            {(errors.confirmPassword || fieldErrors.confirmPassword) && (
              <div className="field-error">
                <FiAlertCircle size={14} />
                {errors.confirmPassword || fieldErrors.confirmPassword}
              </div>
            )}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || Object.keys(errors).length > 0}
            className="btn btn-primary"
          >
            {loading ? 'Resetting Password...' : 'Reset Password'}
          </button>
        </form>

        {/* Back to Login */}
        <p className="auth-footer">
          <Link to="/login">Back to Login</Link>
        </p>
      </div>
    </div>
  );
}