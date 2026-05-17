import React from 'react';
import styles from './Checkbox.module.css';

export default function Checkbox({
  id,
  label,
  checked,
  onChange,
  disabled,
  error,
  children,
}) {
  return (
    <div className={styles.checkboxField}>
      <label htmlFor={id} className={styles.checkboxLabel}>
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          className={styles.checkboxInput}
        />
        <span className={styles.checkboxCustom} aria-hidden="true" />
        <span className={styles.labelText}>{label}</span>
      </label>
      {children && <div className={styles.checkboxDescription}>{children}</div>}
      {error && <p className={styles.errorText}>{error}</p>}
    </div>
  );
}
