import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { FiAlertCircle, FiCheck, FiEye, FiEyeOff } from 'react-icons/fi';
import { getRecoverySessionFromUrl, getCurrentSession, updateUserPassword } from '../services/supabaseAuth';
import { validatePassword } from '../services/validation';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [apiError, setApiError] = useState('');
  const [success, setSuccess] = useState(false);
  const [sessionValid, setSessionValid] = useState(false);
  const [email, setEmail] = useState('');

  useEffect(() => {
    const initializeSession = async () => {
      setApiError('');
      try {
        const session = await getRecoverySessionFromUrl();
        if (session?.user) {
          setSessionValid(true);
          setEmail(session.user.email || '');
          if (window.history?.replaceState) {
            window.history.replaceState({}, document.title, window.location.pathname);
          }
          return;
        }

        const currentSession = await getCurrentSession();
        if (currentSession?.user) {
          setSessionValid(true);
          setEmail(currentSession.user.email || '');
          return;
        }

        setApiError('Invalid or expired recovery link. Please request a new password reset.');
      } catch (error) {
        console.error('[ResetPassword] Recovery session initialization failed:', error);
        const message = error?.message || error?.msg || 'Unable to validate recovery link.';
        setApiError(
          message.includes('Invalid') || message.includes('expired')
            ? 'Invalid or expired recovery link. Please request a new password reset.'
            : 'Unable to validate recovery link. Please try again.'
        );
      } finally {
        setSessionLoading(false);
      }
    };

    initializeSession();
  }, []);

  const validateForm = () => {
    const newErrors = {};
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.valid) {
      newErrors.newPassword = passwordValidation.errors[0];
    }
    if (newPassword !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handlePasswordChange = (e) => {
    const value = e.target.value;
    setNewPassword(value);
    if (fieldErrors.newPassword) {
      setFieldErrors((prev) => ({ ...prev, newPassword: '' }));
    }
  };

  const handleConfirmPasswordChange = (e) => {
    const value = e.target.value;
    setConfirmPassword(value);
    if (fieldErrors.confirmPassword) {
      setFieldErrors((prev) => ({ ...prev, confirmPassword: '' }));
    }
  };

  const getPasswordStrengthColor = () => {
    const passwordValidation = validatePassword(newPassword);
    if (!newPassword || passwordValidation.errors.length > 0) {
      return '#ef4444';
    }
    if (newPassword.length < 12) {
      return '#f59e0b';
    }
    return '#10b981';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setApiError('');
    setFieldErrors({});

    if (!sessionValid) {
      setApiError('Unable to update password. Please request a new reset link.');
      return;
    }

    if (!validateForm()) {
      return;
    }

    setLoading(true);
    try {
      await updateUserPassword(newPassword);
      setSuccess(true);
      setTimeout(() => {
        navigate('/login', { state: { message: 'Password reset successfully! Please log in.' } });
      }, 2000);
    } catch (error) {
      console.error('[ResetPassword] Password update failed:', error);
      const message = error?.message || 'Password update failed. Please try again.';
      if (message.includes('Invalid') || message.includes('expired') || message.includes('recovery')) {
        setApiError('Invalid or expired recovery link. Request a new password reset.');
      } else if (message.includes('Password')) {
        setApiError(message);
      } else {
        setApiError('Password update failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (sessionLoading) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <p>Checking recovery link...</p>
        </div>
      </div>
    );
  }

  if (!sessionValid) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <div className="alert alert-error">
            <FiAlertCircle className="alert-icon" />
            <span>{apiError || 'Invalid or expired recovery link.'}</span>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => navigate('/forgot-password')}>
            Request a New Reset Link
          </button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="auth-container">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <FiCheck size={64} style={{ color: '#10b981', marginBottom: '1rem' }} />
          <h2>Password Reset!</h2>
          <p>Your password has been successfully updated.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h1>Reset Password</h1>
          <p>Enter a new password for your account.</p>
          {email && <p style={{ color: '#666', marginTop: 4 }}>Resetting password for <strong>{email}</strong></p>}
        </div>

        {apiError && (
          <div className="alert alert-error">
            <FiAlertCircle className="alert-icon" />
            <span>{apiError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="form">
          <div className="form-group">
            <label className="form-label form-label-required">New Password</label>
            <div className="input-wrapper">
              <input
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={handlePasswordChange}
                placeholder="••••••••"
                disabled={loading}
                className={`form-input ${fieldErrors.newPassword ? 'error' : ''}`}
              />
              <button type="button" className="password-toggle-btn" onClick={() => setShowPassword(!showPassword)} disabled={loading}>
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
                placeholder="••••••••"
                disabled={loading}
                className={`form-input ${fieldErrors.confirmPassword ? 'error' : ''}`}
              />
              <button type="button" className="password-toggle-btn" onClick={() => setShowConfirmPassword(!showConfirmPassword)} disabled={loading}>
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
            {loading ? 'Updating password...' : 'Update Password'}
          </button>
        </form>

        <p className="auth-footer">
          <Link to="/login">Back to Login</Link>
        </p>
      </div>
    </div>
  );
}
