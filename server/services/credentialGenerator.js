/**
 * Credential Generator Service
 * Generates secure credentials for student accounts
 * Produces username (email) and password suitable for the Student Dashboard
 */

import crypto from 'crypto';

/**
 * Generate a secure, random password
 * Length: 12 characters with mix of uppercase, lowercase, numbers, and symbols
 * @returns {string} secure password
 */
const generatePassword = () => {
  const charset = {
    uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    lowercase: 'abcdefghijklmnopqrstuvwxyz',
    numbers: '0123456789',
    symbols: '!@#$%^&*', // Safe symbols that don't cause issues in emails
  };

  const allChars = charset.uppercase + charset.lowercase + charset.numbers + charset.symbols;

  // Ensure at least one character from each category
  let password = '';
  password += charset.uppercase[Math.floor(Math.random() * charset.uppercase.length)];
  password += charset.lowercase[Math.floor(Math.random() * charset.lowercase.length)];
  password += charset.numbers[Math.floor(Math.random() * charset.numbers.length)];
  password += charset.symbols[Math.floor(Math.random() * charset.symbols.length)];

  // Fill the remaining 8 characters with random selections
  for (let i = password.length; i < 12; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }

  // Shuffle the password to avoid predictable patterns
  return password.split('').sort(() => Math.random() - 0.5).join('');
};

/**
 * Generate a unique student login email
 * Format: studentnameyear@linawletra.edu.ph (school login email)
 * @param {string} studentName - Name of the student
 * @returns {string} generated student email
 */
const generateStudentUsername = (studentName) => {
  if (!studentName) studentName = 'student';

  // Normalize name: remove spaces, special characters, convert to lowercase
  const cleanName = studentName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, '') // Remove special characters
    .replace(/\s+/g, ''); // Remove spaces

  // Add timestamp suffix to ensure uniqueness
  const timestamp = Date.now().toString().slice(-6); // Last 6 digits

  return `${cleanName}${timestamp}@linawletra.edu.ph`;
};

/**
 * Generate complete credentials package for a new student account
 * @param {string} studentName - Full name of the student
 * @returns {object} credentials object with username and password
 */
const generateStudentCredentials = (studentName) => {
  const username = generateStudentUsername(studentName);
  const password = generatePassword();

  return {
    username,
    password,
    generatedAt: new Date().toISOString(),
  };
};

/**
 * Validate generated credentials
 * @param {object} credentials - Credentials object to validate
 * @returns {boolean} true if valid
 */
const isValidCredentials = (credentials) => {
  return (
    credentials &&
    credentials.username &&
    typeof credentials.username === 'string' &&
    credentials.username.length > 0 &&
    credentials.password &&
    typeof credentials.password === 'string' &&
    credentials.password.length >= 12
  );
};

export {
  generatePassword,
  generateStudentUsername,
  generateStudentCredentials,
  isValidCredentials,
};
