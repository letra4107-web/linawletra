import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { FiAlertCircle, FiCheck, FiEye, FiEyeOff } from 'react-icons/fi';
import { authService } from '../services/api';
import { validatePassword, validateVerificationCode } from '../services/validation';

export default function ResetPassword() {
  const navigate = useNavigate();
  const location = useLocation();
  const email = location.state?.email || '';
  
  const [resetCode, setResetCode] = useState('');
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
  const [timeLeft, setTimeLeft] = useState(3600); // 1 hour
  
  // Countdown timer
  useEffect(() => {
    if (timeLeft <= 0) {
      return;
    }
    
    const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
    return () => clearTimeout(timer);
  }, [timeLeft]);
  
  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
  };
  
  const handleResetCodeChange = (e) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6);
    setResetCode(value);
    if (fieldErrors.resetCode) {
      setFieldErrors(prev => ({ ...prev, resetCode: '' }));
    }
  };
  
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
        return '#ef4444';
      case 'moderate':
        return '#f59e0b';
      case 'strong':
        return '#10b981';
      default:
        return '#d1d5db';
    }
  };
  
  const validateForm = () => {
    const newErrors = {};
    
    // Reset Code
    const codeValidation = validateVerificationCode(resetCode);
    if (!codeValidation.valid) {
      newErrors.resetCode = codeValidation.error;
    }
    
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
    
    if (!email) {
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
      <div 
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f9fafb',
          fontFamily: 'Josefin Sans, sans-serif',
        }}
      >
        <div 
          style={{
            width: '100%',
            maxWidth: '500px',
            backgroundColor: 'white',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            padding: '2rem',
            textAlign: 'center',
            letterSpacing: '0.06em',
          }}
        >
          <div style={{ marginBottom: '1rem' }}>
            <FiCheck 
              size={64} 
              style={{ color: '#10b981', margin: '0 auto' }}
            />
          </div>
          <h2 style={{ color: '#10b981', marginTop: 0 }}>Password Reset!</h2>
          <p style={{ color: '#666', marginBottom: '1.5rem' }}>
            Your password has been successfully reset. Redirecting to login...
          </p>
        </div>
      </div>
    );
  }
  
  if (!email) {
    return (
      <div 
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f9fafb',
          fontFamily: 'Josefin Sans, sans-serif',
        }}
      >
        <div 
          style={{
            width: '100%',
            maxWidth: '500px',
            backgroundColor: 'white',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            padding: '2rem',
            letterSpacing: '0.06em',
          }}
        >
          <p style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FiAlertCircle /> Session expired. Please request password reset again.
          </p>
          <button 
            onClick={() => navigate('/forgot-password')}
            style={{
              marginTop: '1rem',
              backgroundColor: '#1e5a96',
              color: 'white',
              padding: '0.75rem 1.5rem',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '16px',
              fontFamily: 'inherit',
            }}
          >
            Request Reset Code
          </button>
        </div>
      </div>
    );
  }
  
  return (
    <div 
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f9fafb',
        padding: '1rem',
        fontFamily: 'Josefin Sans, sans-serif',
      }}
    >
      <div 
        style={{
          width: '100%',
          maxWidth: '500px',
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          padding: '2rem',
          letterSpacing: '0.06em',
        }}
      >
        <h1 style={{ color: '#1e5a96', marginTop: 0, fontSize: '28px' }}>Reset Your Password</h1>
        <p style={{ color: '#666', marginBottom: '0.5rem' }}>
          Enter the code sent to <strong>{email}</strong>
        </p>
        <p style={{ color: '#999', fontSize: '13px', marginBottom: '1.5rem' }}>
          Code expires in {formatTime(timeLeft)}
        </p>
        
        {apiError && (
          <div 
            style={{
              backgroundColor: '#fee2e2',
              color: '#991b1b',
              padding: '0.75rem',
              borderRadius: '6px',
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <FiAlertCircle size={18} />
            <span>{apiError}</span>
          </div>
        )}
        
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Reset Code */}
          <div>
            <label style={{ fontWeight: '600', color: '#1f2937', marginBottom: '0.5rem', display: 'block' }}>
              Verification Code *
            </label>
            <input
              type="text"
              inputMode="numeric"
              maxLength="6"
              value={resetCode}
              onChange={handleResetCodeChange}
              placeholder="000000"
              style={{
                width: '100%',
                padding: '0.75rem',
                fontSize: '24px',
                textAlign: 'center',
                letterSpacing: '0.2em',
                border: (errors.resetCode || fieldErrors.resetCode) ? '2px solid #ef4444' : '1px solid #e5e7eb',
                borderRadius: '6px',
                fontFamily: 'monospace',
              }}
              disabled={loading}
            />
            {(errors.resetCode || fieldErrors.resetCode) && (
              <span style={{ color: '#ef4444', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.25rem' }}>
                <FiAlertCircle size={14} /> {errors.resetCode || fieldErrors.resetCode}
              </span>
            )}
          </div>
          
          {/* New Password */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <label style={{ fontWeight: '600', color: '#1f2937' }}>New Password *</label>
              {!errors.newPassword && newPassword && <FiCheck style={{ color: '#10b981' }} />}
            </div>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={handlePasswordChange}
                placeholder="••••••••"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  paddingRight: '1.75rem',
                  border: (errors.newPassword || fieldErrors.newPassword) ? '2px solid #ef4444' : '1px solid #e5e7eb',
                  borderRadius: '6px',
                  fontFamily: 'inherit',
                  fontSize: '16px',
                  letterSpacing: '0.06em',
                }}
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '0.75rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#999',
                }}
                disabled={loading}
              >
                {showPassword ? <FiEyeOff /> : <FiEye />}
              </button>
            </div>
            
            {newPassword && (
              <div style={{ marginTop: '0.5rem' }}>
                <div style={{ height: '4px', backgroundColor: '#e5e7eb', borderRadius: '2px', overflow: 'hidden' }}>
                  <div 
                    style={{
                      height: '100%',
                      width: passwordStrength === 'weak' ? '33%' : passwordStrength === 'moderate' ? '66%' : '100%',
                      backgroundColor: getPasswordStrengthColor(),
                      transition: 'width 0.3s',
                    }}
                  ></div>
                </div>
                <span style={{ color: getPasswordStrengthColor(), fontSize: '13px', marginTop: '0.25rem', display: 'block' }}>
                  Strength: {passwordStrength.charAt(0).toUpperCase() + passwordStrength.slice(1)}
                </span>
              </div>
            )}
            
            {(errors.newPassword || fieldErrors.newPassword) && (
              <span style={{ color: '#ef4444', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.25rem' }}>
                <FiAlertCircle size={14} /> {errors.newPassword || fieldErrors.newPassword}
              </span>
            )}
          </div>
          
          {/* Confirm Password */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <label style={{ fontWeight: '600', color: '#1f2937' }}>Confirm Password *</label>
              {!errors.confirmPassword && confirmPassword && newPassword === confirmPassword && <FiCheck style={{ color: '#10b981' }} />}
            </div>
            <div style={{ position: 'relative' }}>
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={handleConfirmPasswordChange}
                placeholder="••••••••"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  paddingRight: '1.75rem',
                  border: (errors.confirmPassword || fieldErrors.confirmPassword) ? '2px solid #ef4444' : '1px solid #e5e7eb',
                  borderRadius: '6px',
                  fontFamily: 'inherit',
                  fontSize: '16px',
                  letterSpacing: '0.06em',
                }}
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                style={{
                  position: 'absolute',
                  right: '0.75rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#999',
                }}
                disabled={loading}
              >
                {showConfirmPassword ? <FiEyeOff /> : <FiEye />}
              </button>
            </div>
            {(errors.confirmPassword || fieldErrors.confirmPassword) && (
              <span style={{ color: '#ef4444', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.25rem' }}>
                <FiAlertCircle size={14} /> {errors.confirmPassword || fieldErrors.confirmPassword}
              </span>
            )}
          </div>
          
          {/* Submit Button */}
          <button
            type="submit"
            style={{
              backgroundColor: '#1e5a96',
              color: 'white',
              padding: '0.75rem',
              border: 'none',
              borderRadius: '6px',
              fontSize: '16px',
              fontWeight: '600',
              fontFamily: 'inherit',
              cursor: loading || Object.keys(errors).length > 0 ? 'not-allowed' : 'pointer',
              opacity: loading || Object.keys(errors).length > 0 ? 0.5 : 1,
              letterSpacing: '0.06em',
            }}
            disabled={loading || Object.keys(errors).length > 0}
          >
            {loading ? 'Resetting Password...' : 'Reset Password'}
          </button>
        </form>
        
        {/* Back to Login */}
        <p style={{ marginTop: '1.5rem', textAlign: 'center', color: '#666' }}>
          <Link to="/login" style={{ color: '#1e5a96', textDecoration: 'none', fontWeight: '600' }}>Back to Login</Link>
        </p>
      </div>
    </div>
  );
}
