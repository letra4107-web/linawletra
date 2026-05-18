# TODO - Fix export/import + ESM/CJS mismatch

- [x] Identify that `authController.js` exports `createProfile`.
- [x] Inspect `server/routes/auth.js` import style.
- [x] Fix `server/routes/auth.js` to import the controller in a way compatible with current controller exports.
- [ ] Convert `server/config/supabase.js` from CommonJS `require()` to ESM `import` (must work with `"type": "module"`).
- [ ] Convert `server/services/emailService.js` from CommonJS `require()` to ESM `import`.
- [ ] Re-run `node server/server.js` to confirm server boots.
- [ ] If any new import/export errors appear, fix them similarly (keep ESM consistent).

