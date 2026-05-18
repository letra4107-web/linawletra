import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const storeDir = path.resolve(__dirname, '../data');
const storePath = path.join(storeDir, 'students-store.json');

const emptyStore = () => ({
  students: [],
});

const readStore = () => {
  try {
    if (!fs.existsSync(storePath)) return emptyStore();
    const parsed = JSON.parse(fs.readFileSync(storePath, 'utf8'));
    return {
      students: Array.isArray(parsed.students) ? parsed.students : [],
    };
  } catch (error) {
    console.warn('[LocalStudentStore] Failed to read store, starting fresh:', error.message);
    return emptyStore();
  }
};

const writeStore = (store) => {
  fs.mkdirSync(storeDir, { recursive: true });
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
};

export const createLocalStudent = (student) => {
  const store = readStore();
  const now = new Date().toISOString();
  const record = {
    id: student.id || crypto.randomUUID(),
    ...student,
    created_at: student.created_at || now,
    updated_at: now,
  };
  store.students.push(record);
  writeStore(store);
  return record;
};

export const getLocalStudentsByParent = (parentId) => {
  return readStore().students.filter((student) => student.parent_id === parentId);
};

