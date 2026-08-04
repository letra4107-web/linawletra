# Railway Backend + Hostinger Frontend Deployment

## 1. Railway Backend

Create a Railway service from this GitHub repository.

Recommended settings:

- Root directory: `/`
- Config file: `/railway.json`
- Healthcheck path: `/health`
- Public networking: Generate a Railway domain

The included `railway.json` installs and starts the backend with:

```bash
cd server && npm ci
cd server && npm start
```

Railway injects `PORT`; the backend already listens on `process.env.PORT`.

## 2. Railway Variables

In the Railway service Variables tab, add:

```env
NODE_ENV=production
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
REACT_APP_SUPABASE_ANON_KEY=your_supabase_anon_key
BREVO_API_KEY=your_rotated_brevo_api_key
EMAIL_FROM=LinawLetra <verified-sender@your-domain.com>
CLIENT_URL=https://your-hostinger-domain.com
CORS_ORIGINS=https://your-hostinger-domain.com,https://www.your-hostinger-domain.com
```

Optional speech variables:

```env
OPENAI_API_KEY=your_openai_api_key
OPENAI_TTS_MODEL=gpt-4o-mini-tts
OPENAI_STT_MODEL=gpt-4o-mini-transcribe
OPENAI_TTS_VOICE=marin
```

Do not set `PORT` manually unless Railway support asks you to. Railway provides it.

## 3. Supabase SQL

Before testing signup, run these in Supabase SQL Editor if they have not already been applied:

- `FIX_EMAIL_VERIFICATION_CODES_SCHEMA_CACHE.sql`
- `FIX_STUDENTS_TABLE_SCHEMA_CACHE.sql`
- `supabase_migration_student_progress_columns.sql`
- `supabase_migration_phonemic_progress.sql`
- `supabase_migration_longest_streak.sql`

## 4. Hostinger Frontend

Build the React frontend with:

```env
REACT_APP_API_URL=https://your-railway-backend-domain.up.railway.app/api
REACT_APP_SUPABASE_URL=https://your-project.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Then run:

```bash
npm run build
```

Upload the contents of `build/` to Hostinger public web root.

## 5. Smoke Tests

After deployment:

1. Open `https://your-railway-backend-domain.up.railway.app/health`
2. Confirm it returns JSON with `"status":"ok"`.
3. Open the Hostinger site.
4. Register a new parent account.
5. Confirm Brevo sends the verification OTP.
6. Verify OTP, then log in.

If browser console shows CORS errors, add the exact Hostinger origin to `CORS_ORIGINS` in Railway and redeploy.
