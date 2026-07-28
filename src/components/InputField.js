import React from 'react';
import { FiAlertCircle, FiCheck, FiEye, FiEyeOff } from 'react-icons/fi';
import styles from './InputField.module.css';

export default function InputField({
  label,
  name,
  type = 'text',
  value,
  onChange,
  onBlur,
  error,
  disabled,
  showToggle = false,
  isPasswordVisible = false,
  onTogglePassword,
  valid,
  hint,
  icon,
}) {
  const hasValue = Boolean(value);
  const isInvalid = Boolean(error);
  const hasIcon = Boolean(icon);

  return (
    <div className={styles.field}>
      <label htmlFor={name} className={`${styles.label} ${isInvalid ? styles.errorLabel : ''}`}>
        {label}
      </label>
      <div className={styles.inputWrapper}>
        {icon && <span className={styles.inputIcon}>{icon}</span>}
        <input
          id={name}
          name={name}
          type={type}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          disabled={disabled}
          aria-invalid={isInvalid}
          aria-describedby={`${name}-error`}
          className={`${styles.input} ${hasIcon ? styles.withIcon : ''} ${isInvalid ? styles.invalid : ''} ${valid ? styles.valid : ''}`}
        />
        <div className={styles.iconGroup}>
          {showToggle && (
            <button
              type="button"
              onClick={onTogglePassword}
              className={styles.toggleBtn}
              disabled={disabled}
              aria-label={isPasswordVisible ? 'Hide password' : 'Show password'}
            >
              {isPasswordVisible ? <FiEyeOff /> : <FiEye />}
            </button>
          )}
          {valid && !isInvalid && hasValue && (
            <FiCheck className={styles.validIcon} aria-hidden="true" />
          )}
        </div>
      </div>

      {isInvalid && (
        <p id={`${name}-error`} className={styles.errorText}>
          <FiAlertCircle aria-hidden="true" /> {error}
        </p>
      )}
      {!isInvalid && hint && (
        <p className={styles.hint}>{hint}</p>
      )}
    </div>
  );
}
