import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

const originalEnv = new Map(Object.entries(process.env));
[
  path.resolve(repoRoot, '.env'),
  path.resolve(repoRoot, '.env.local'),
  path.resolve(repoRoot, 'server', '.env'),
  path.resolve(repoRoot, 'server', '.env.local'),
].forEach((envPath) => dotenv.config({ path: envPath, override: true }));

originalEnv.forEach((value, key) => {
  process.env[key] = value;
});

const migrationArg = process.argv[2] || 'supabase/migrations/20260812090000_beginner_curriculum_modules.sql';
const migrationPath = path.resolve(repoRoot, migrationArg);
const databaseUrl =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.SUPABASE_DB_URL ||
  process.env.SUPABASE_DATABASE_URL;

const validateDatabaseUrl = (value) => {
  if (!value || typeof value !== 'string') {
    return { valid: false, message: 'DATABASE_URL is missing or invalid. Expected a PostgreSQL connection string.' };
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return { valid: false, message: 'DATABASE_URL is missing or invalid. Expected a PostgreSQL connection string.' };
  }

  const protocol = parsed.protocol.replace(':', '');
  if (!['postgresql', 'postgres'].includes(protocol)) {
    return { valid: false, message: 'DATABASE_URL is missing or invalid. Expected a PostgreSQL connection string.' };
  }

  const placeholderHosts = new Set(['base', 'host', 'hostname', 'your-host', 'example.com', 'pooler-host', 'project-ref']);
  const host = parsed.hostname.toLowerCase();
  if (!host || placeholderHosts.has(host) || (!host.includes('.') && host !== 'localhost')) {
    return {
      valid: false,
      message: 'DATABASE_URL is missing or invalid. Expected a PostgreSQL connection string with a real database host.',
    };
  }

  if (!parsed.username || !parsed.password || !parsed.pathname || parsed.pathname === '/') {
    return {
      valid: false,
      message: 'DATABASE_URL is missing or invalid. Expected username, password, host, and database name.',
    };
  }

  const placeholderPattern = /(your[_-]?(db[_-]?)?password|project[_-]?ref|pooler[_-]?host|<|>|changeme|placeholder)/i;
  const fieldsToCheck = [
    decodeURIComponent(parsed.username),
    decodeURIComponent(parsed.password),
    host,
    parsed.pathname,
  ];
  if (fieldsToCheck.some((field) => placeholderPattern.test(field))) {
    return {
      valid: false,
      message: 'DATABASE_URL contains placeholder text. Replace it with your actual Supabase PostgreSQL connection string values.',
    };
  }

  return { valid: true, parsed };
};

const redactUrl = (parsed) => {
  if (!parsed) return 'unavailable';
  const authUser = parsed.username ? `${decodeURIComponent(parsed.username)}:****@` : '';
  return `${parsed.protocol}//${authUser}${parsed.host}${parsed.pathname}`;
};

const validation = validateDatabaseUrl(databaseUrl);
if (!validation.valid) {
  console.error(validation.message);
  console.error('Set DATABASE_URL, POSTGRES_URL, SUPABASE_DB_URL, or SUPABASE_DATABASE_URL to your Supabase PostgreSQL connection string.');
  process.exit(2);
}

const client = new pg.Client({
  connectionString: databaseUrl,
  ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
});

try {
  const sql = await fs.readFile(migrationPath, 'utf8');
  console.log(`Applying migration: ${path.relative(repoRoot, migrationPath)}`);
  console.log(`Database target: ${redactUrl(validation.parsed)}`);
  await client.connect();
  await client.query('BEGIN');
  await client.query(sql);
  await client.query("NOTIFY pgrst, 'reload schema'");
  await client.query('COMMIT');
  console.log('Migration applied successfully.');
} catch (error) {
  try {
    await client.query('ROLLBACK');
  } catch {
    // Ignore rollback errors; the original failure is reported below.
  }
  const code = error.code ? ` (${error.code})` : '';
  console.error(`Migration failed${code}: ${error.message}`);
  if (['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN'].includes(error.code)) {
    console.error('Connection diagnostic: check that DATABASE_URL uses the Supabase PostgreSQL host, port, username, password, and database name from Project Settings > Database.');
  }
  if (String(error.message || '').toLowerCase().includes('password authentication failed')) {
    console.error('Connection diagnostic: the database host was reached, but the username/password was rejected.');
  }
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
