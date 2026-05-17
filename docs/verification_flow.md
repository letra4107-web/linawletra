Verification Flow - LinawLetra

Overview
- Registration creates a Supabase Auth user (admin.createUser) and a `users` profile.
- A 6-digit verification code is stored in `email_verification_codes` and an email is sent.
- Users must verify their email using the verification page.
- After successful verification the backend now generates a Supabase access token and returns `{ success:true, token, user }` to allow automatic login.
- Resend requests are rate-limited by `resend_available_at` and return `cooldownRemaining` when limited.

Key Changes
- `server/controllers/authController.js`:
  - `verifyEmail` now generates an access token (via `supabase.auth.admin.generateAccessTokenForUser`) and returns it with the user object when available.
  - `resendVerificationCode` checks the most recent code and enforces the `resend_available_at` cooldown, returning `429` and `cooldownRemaining` if too soon.

- `client/src/components/EmailVerification.js`:
  - Auto-login if backend returns `token` and `user` after verification.
  - Use backend-provided `cooldownRemaining` when resending verification codes; fallback to 60s.

Manual Test Steps (local)
1. Start the backend server:

   npm install
   npm run dev

   (Ensure `.env` contains required Supabase and SMTP settings.)

2. Start the frontend (client):

   cd client
   npm install
   npm start

3. Register a new user via the app. After successful registration you should be redirected to `/verify-email`.
4. Check email for the 6-digit verification code.
5. Enter the code on the verification page.
   - Expected: You should see a success message and be redirected automatically to your dashboard. The app will store the returned token in `localStorage` (`token`) and the `AuthContext` will populate the user.
6. Try pressing "Resend Code" repeatedly. The server will return `429` if done within the cooldown and the UI will show the remaining seconds.
7. Try verifying with an invalid or expired code — you should get a clear error message.

Notes on Security
- The backend returns a Supabase access token which the frontend stores in `localStorage`. For improved security, consider returning and setting a secure, HttpOnly cookie from the backend instead of storing tokens client-side.
- The server uses `resend_available_at` and attempts counters to limit abuse, and deletes used verification codes.

Next Steps / Tests
- Add automated integration tests mocking Supabase responses (recommended using Jest + nock or by abstracting Supabase client to allow injection of a mock). This repo currently has no automated tests for the auth flow; I can add them if you want.

If you want, I can now:
- Add automated tests (Jest + supertest + nock) for the verification endpoints.
- Change token handling to set HttpOnly secure cookies instead of localStorage.
- Harden rate limiting further (IP-based, Redis-backed counters).

