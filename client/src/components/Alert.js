import React from 'react';
import { FiAlertCircle, FiCheckCircle, FiInfo } from 'react-icons/fi';
import styles from './Alert.module.css';

const iconByType = {
  error: <FiAlertCircle aria-hidden="true" />,
  success: <FiCheckCircle aria-hidden="true" />,
  info: <FiInfo aria-hidden="true" />,
};

export default function Alert({ type = 'error', message }) {
  return (
    <div
      className={`${styles.alert} ${styles[type]}`}
      role="alert"
      aria-live="polite"
      aria-atomic="true"
    >
      <span className={styles.icon}>{iconByType[type]}</span>
      <p className={styles.message}>{message}</p>
    </div>
  );
}
