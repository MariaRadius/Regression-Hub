---
name: smoke-test
description: Use when verifying a change in the regression-hub Next.js project end-to-end before commit or PR — covers the minimum-viable admin + QA browser walk after npm test passes.
---

# Smoke Test (regression-hub)

## When to use

After `npm test` is green and before opening a PR or marking a task done. Skip if the change is docs-only or test-only.

## Recipe (~2 min)

1. `npm test` — must be green first. If not, stop and fix.
2. `npm run lint:fix` — once, at the end of edits.
3. `npm run dev` — leave running in the background; wait for "Ready" line.
4. Read `SMOKE_ADMIN_EMAIL` / `SMOKE_ADMIN_PASSWORD` and `SMOKE_QA_EMAIL` / `SMOKE_QA_PASSWORD` from `.env.local`. If absent, ask the user — do not invent.
5. Admin walk at `http://localhost:3000`:
   - Sign in at `/login` as admin.
   - Visit each: `/dashboard`, `/users`, `/test-cases`, `/test-runs`, `/reports`, `/assignments`, `/modules`, `/applications`, `/import-cases`.
   - Each must render with no console errors and no failed network requests in DevTools.
6. QA redirect check:
   - Sign out, sign in as QA user.
   - Visit `/users` and `/import-cases` — both must server-redirect away (to `/dashboard` or `/login`). If either renders, that's a FAIL.
7. Kill the dev server.

## Targeted additions (only when the diff touches them)

- Touched a mutation (create/edit/delete)? Trigger it and confirm a toast appears.
- Touched `/reports`? Run PDF + Excel export; confirm files download.
- Touched `/api/versions` or polling? In Network tab confirm `Cache-Control: no-store` and 15s repolling.
- Touched fonts/CSP? In Network tab filter "font"; confirm only `/_next/static/media/*.woff2`, no `fonts.g*.com`.
- Touched `/import-cases`? Upload a valid `.xlsx` (success) and a `.csv` (client-side reject).

Pick only the ones that overlap the current diff. Don't run the full matrix every time.

## PASS / FAIL

PASS = every route in step 5 renders cleanly, QA redirects in step 6 both fire, and any targeted addition for the diff behaves as listed.

FAIL = console error, missing redirect, failing network call, missing toast on a touched mutation, or any download/export that doesn't produce a file.

Report failures with the route, the action, and the console/network evidence — don't paper over them.

## Notes

- Default port is 3000; no `PORT` override is used in this project.
- No DB seed step; the local Mongo is assumed populated.
- This is manual smoke only. There is no Playwright / curl harness — don't invent one.
- `utils/__tests__/smoke.test.js` is a trivial `1+1` sanity test, not a real smoke test. Ignore it.
