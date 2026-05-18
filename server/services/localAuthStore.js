import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const storeDir = path.resolve(__dirname, '../data');
const storePath = path.join(storeDir, 'auth-store.json');

const emptyStore = () => ({
  users: [],
  verificationCodes: [],
});

const readStore = () => {
  try {
    if (!fs.existsSync(storePath)) return emptyStore();
    const parsed = JSON.parse(fs.readFileSync(storePath, 'utf8'));
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      verificationCodes: Array.isArray(parsed.verificationCodes) ? parsed.verificationCodes : [],
    };
  } catch (error) {
    console.warn('[LocalAuthStore] Failed to read store, starting fresh:', error.message);
    return emptyStore();
  }
};

const writeStore = (store) => {
  fs.mkdirSync(storeDir, { recursive: true });
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
};

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

export const isMissingSupabaseTableError = (error) => {
  const message = String(error?.message || '').toLowerCase();
  return error?.code === 'PGRST205' || message.includes('schema cache') || message.includes("could not find the table");
};

export const findLocalUserByEmail = (email) => {
  const normalizedEmail = normalizeEmail(email);
  return readStore().users.find((user) => normalizeEmail(user.email) === normalizedEmail) || null;
};

export const findLocalUserById = (id) => {
  return readStore().users.find((user) => user.id === id) || null;
};

export const upsertLocalUser = (profile) => {
  const store = readStore();
  const now = new Date().toISOString();
  const normalizedEmail = normalizeEmail(profile.email);
  const existingIndex = store.users.findIndex((user) => user.id === profile.id || normalizeEmail(user.email) === normalizedEmail);
  const existing = existingIndex >= 0 ? store.users[existingIndex] : {};
  const nextUser = {
    ...existing,
    ...profile,
    email: normalizedEmail,
    created_at: existing.created_at || now,
    updated_at: now,
  };

  if (existingIndex >= 0) {
    store.users[existingIndex] = nextUser;
  } else {
    store.users.push(nextUser);
  }

  writeStore(store);
  return nextUser;
};

export const deleteLocalUser = (userId) => {
  const store = readStore();
  store.users = store.users.filter((user) => user.id !== userId);
  store.verificationCodes = store.verificationCodes.filter((record) => record.user_id !== userId);
  writeStore(store);
};

export const markLocalUserVerified = (userId) => {
  const store = readStore();
  const user = store.users.find((item) => item.id === userId);
  if (!user) return null;
  user.email_verified = true;
  user.verified_at = new Date().toISOString();
  user.updated_at = user.verified_at;
  writeStore(store);
  return user;
};

export const createLocalVerificationCode = ({ userId, email, code, expiresAt, resendAvailableAt }) => {
  const store = readStore();
  const record = {
    id: crypto.randomUUID(),
    user_id: userId,
    email: normalizeEmail(email),
    code,
    expires_at: new Date(expiresAt).toISOString(),
    resend_available_at: new Date(resendAvailableAt).toISOString(),
    attempts: 0,
    created_at: new Date().toISOString(),
  };
  store.verificationCodes.push(record);
  writeStore(store);
  return record;
};

export const getLatestLocalVerificationCode = ({ userId, email }) => {
  const normalizedEmail = normalizeEmail(email);
  return readStore().verificationCodes
    .filter((record) => record.user_id === userId && normalizeEmail(record.email) === normalizedEmail)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null;
};

export const incrementLocalVerificationAttempts = (codeId) => {
  const store = readStore();
  const record = store.verificationCodes.find((item) => item.id === codeId);
  if (record) {
    record.attempts = (record.attempts || 0) + 1;
    writeStore(store);
  }
};

export const deleteLocalVerificationCode = (codeId) => {
  const store = readStore();
  store.verificationCodes = store.verificationCodes.filter((record) => record.id !== codeId);
  writeStore(store);
};
