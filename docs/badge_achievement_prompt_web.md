# Badge/Achievement System — Web Prompt

Adapted from the original mobile-app prompt (which referenced React Native's
`achievementService.ts` and `AchievementModal.tsx`). Use this version when
porting a mobile-side feature spec to LinawLetra's web app.

## Context differences from the mobile prompt

- This is a Create React App project (`src/`) — plain JS/JSX, no TypeScript.
  There is no `.ts`/`.tsx` anywhere in this codebase.
- There was no existing `achievementService.js` or `AchievementModal.js` on
  web before this prompt was run. "Achievements" was a raw completed-lesson
  count with no names, images, or service layer — don't assume a list to
  redefine; assume you're building fresh.
- Badge assets live at `src/assets/badges/*.png`, snake_case filenames
  matching each Tagalog badge name (e.g. `unang_hakbang.png`).
- Student progress is stored as a flexible JSONB `metadata` column on the
  `users` table in Supabase, read/written through
  `server/controllers/studentController.js` (`getStudent`, `updateStudent`)
  and `src/services/api.js`'s `studentService`. There is no separate
  relational "badges" table — new fields are additive keys on that JSON blob.

## Task template

1. **Verify assets aren't corrupted** before wiring anything up — check the
   PNG magic-byte signature (`89 50 4E 47 0D 0A 1A 0A`) and confirm
   consistent dimensions across the set. A generic-icon thumbnail in Windows
   Explorer is not proof of corruption — check the actual bytes.
2. **Propose unlock criteria before writing code.** Present a
   `{name → unlock criteria → data field}` table and get explicit sign-off,
   especially for any criteria that need new persisted fields.
3. **Build `src/services/achievementService.js`**: export `ACHIEVEMENTS`
   (array of `{id, name, description, image, check(stats)}`) and
   `getUnlockedAchievementIds(stats)`. Import each PNG with a static `import`
   so webpack emits it as a hashed asset (don't use `require()` with a
   dynamic path — CRA's build needs static imports to bundle images).
4. **Add any new tracking fields** the criteria need in both places, or they
   silently vanish on save:
   - frontend state in `src/pages/StudentDashboard.js` — load on mount from
     `profileMetadata`, persist via the existing debounced `persistProgress`
     effect;
   - backend allow-list in `server/controllers/studentController.js`'s
     `updateStudent` (the `progressMetadata` object) — any field not
     destructured there is dropped even if the frontend sends it.
5. **Build reusable UI**: a badge tile component (locked/unlocked states)
   and an unlock-celebration modal, styled with the app's actual brand color
   variable and `var(--font-primary)` — never hardcode a hex color or font
   name in a new component; the app centralizes both.
6. **Wire into all relevant dashboards**, not just Student — Teacher and
   Parent typically need read-only badge viewing per-student, Admin
   typically needs an aggregate stats view. Prefer client-side aggregation
   over new backend endpoints when the existing "get all students" call
   already returns the metadata you need.
7. **Verify with a real build after each major step**:
   `CI=true npm run build`, and check `build/static/media/` to confirm
   image assets were actually bundled — a clean build alone doesn't prove
   the images made it in.

## Constraints specific to this codebase

- No regressions: this app is used by children with dyslexia. Keep touch
  targets ≥44px, avoid ALL-CAPS, don't rely on color alone to convey state
  (locked badges use a lock icon + grayscale, not just a dimmer color).
- Brand color and font are centralized (`--primary`/`--accent` per-dashboard
  CSS variables, `--font-primary` in `src/index.css`) — reuse them.
- Don't assume a database migration step exists — this data model is a
  single JSON blob per user, so "add a field" means "add a key," not
  "write a migration."
