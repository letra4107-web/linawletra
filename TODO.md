# TODO

- [x] Fix `server/routes/auth.js` controller imports (ESM, matches `authController.js` exports).
- [x] `server/config/supabase.js` and `server/services/emailService.js` are already ESM `import`-based.
- [x] `node index.js` boots the server correctly (entry point is `index.js`, not `server.js` directly).
- [ ] Deploy `server/` to a persistent Node host (Render) so `/api/*` is reachable in production — Hostinger currently only serves the static frontend build.
- [ ] Decide how to handle outbound email on Render's free tier (blocks SMTP ports 25/465/587) — either upgrade to a paid instance or switch to an HTTP-based email API.
- [ ] Remove duplicate frontend copies (`client/src/`, `client/client/src/`) and duplicate backend copy (`client/server/`) — only root `src/`, root `public/`, and root `server/` are actually deployed.
- [x] Reviewed `npm audit` findings — patched axios, form-data, body-parser (safe, non-breaking). Remaining ~62 findings all trace to react-scripts' internal build tooling (webpack-dev-server/jest/svgo), never shipped to production — not exploitable in the live app.
- [ ] `react-router-dom`/`react-router` moderate open-redirect fix requires a v6→v7 major upgrade. Deliberately left on v6 for now (real regression risk to app-wide routing) — revisit as a planned, tested upgrade later.
