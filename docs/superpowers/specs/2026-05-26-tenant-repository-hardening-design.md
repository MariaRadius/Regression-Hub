# Tenant Repository Hardening — Design Spec

**Date:** 2026-05-26  
**Approach:** Structural hardening (keep `lib/db/*.js` as-is; fix gaps; add `withPage`)  
**Scope:** SaaS data segregation — tenant-id = `teamId`

---

## 1. Context

The codebase already has a sound 3-layer architecture:

```
page.js / route.js  →  lib/db/*.js  →  lib/mongodb.js  →  MongoDB
```

All 7 collections carry `teamId`. All API routes delegate through `withTeam`/`withAdmin`. The `lib/db/*.js` files are the de facto repository layer. No inline DB queries exist in `page.js` or `route.js`.

An Opus audit identified 6 missing `teamId` filters in write/count operations, 8 RSC pages with inconsistent or absent tenant guards, `session.user.id` not propagated in the auth session callback, and 2 intentional cross-tenant queries that are undocumented.

---

## 2. Changes

### 2.1 Write-path tenant filter hardening (6 queries)

Add `teamId` to the filter of every write/count operation that currently uses `{ _id }` alone. This closes the window where a race or call-order bug could bypass the prior ownership read. Includes two cascade `updateMany` calls on the `testCases` collection. Also adds `teamId` to the `aggregate` `$match` in `listAssignments` (refactored from N+1 `countDocuments` to batch aggregate — gap persisted through the refactor).

| File | Function | Fix |
|---|---|---|
| `lib/db/usersData.js` | `updateUser` | `updateOne({ _id: oid, teamId }, ...)` |
| `lib/db/assignmentsData.js` | `updateAssignment` | `updateOne({ _id: oid, teamId }, ...)` |
| `lib/db/assignmentsData.js` | `deleteAssignment` — primary `deleteOne` | `deleteOne({ _id: oid, teamId })` |
| `lib/db/assignmentsData.js` | `deleteAssignment` — cascade `testCases.updateMany` | `updateMany({ _id: { $in: oids }, assignmentId: id, teamId }, ...)` |
| `lib/db/assignmentsData.js` | `createAssignment` — cascade `testCases.updateMany` | `updateMany({ _id: { $in: oids }, teamId }, ...)` |
| `lib/db/assignmentsData.js` | `getAssignmentsPageData` — `completedDocs` find | `find({ _id: { $in: allOids }, teamId, status: { $in: COMPLETED_STATUSES } }, ...)` |
| `lib/db/assignmentsData.js` | `listAssignments` — batch `aggregate` | Add `teamId` to `$match`: `{ _id: { $in: [...oidMap.values()] }, teamId, status: { $in: COMPLETED_STATUSES } }` |

### 2.2 Session `user.id` propagation (`lib/auth.js`)

`session.user.id` is `undefined` for CredentialsProvider because NextAuth does not auto-populate it from `token.sub` in custom session callbacks. This causes silent failures in any code that reads `session.user.id` or `user.id` (e.g. `updateUser` receives `sessionUserId`; `withTeam.js` passes `session` which route handlers destructure for `session.user.id`).

```js
// lib/auth.js — session callback
async session({ session, token }) {
  session.user.id = token.sub;   // ← add this line
  session.user.teamId = token.teamId;
  session.user.teamName = token.teamName;
  session.user.username = token.username;
  session.user.role = token.role;
  return session;
},
```

### 2.3 New `lib/server/withPage.js`

RSC helper that owns `getServerSession` + `getDb()` + `teamId` extraction for all SSR pages. Mirrors `withTeam.js` but for the RSC page context.

**Why `withPage` exists despite `middleware.js`:** `middleware.js` uses `getToken` (JWT only) and validates authentication, but does not check `teamId`. A user with a valid JWT but a missing or corrupted `teamId` field (partial account, migration gap) passes middleware cleanly and then crashes every page with a TypeError. `withPage` is the fallback guard for that case — it is not a duplicate of the middleware auth check.

```js
// lib/server/withPage.js
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/mongodb';
import { ROLES } from '@/lib/constants';

/**
 * RSC page helper — centralises session + DB wiring.
 * Injects { db, teamId, user } into the callback.
 *
 * middleware.js already handles unauthenticated redirects with ?redirectTo
 * preserved. This guard fires only for the teamId-missing edge case (valid
 * JWT, no teamId — corrupted session or partial account).
 *
 * - Missing teamId  → redirect('/login')
 * - Missing teamId  → throw Error (caught by error.js boundary)
 *
 * NOTE: `user.id` is available as `session.user.id` (set in authOptions
 * session callback via token.sub). Pass it through to client components
 * when an "is this me?" check is needed.
 */
export async function withPage(handler) {
  const session = await getServerSession(authOptions);
  const teamId = session?.user?.teamId;
  if (!teamId) redirect('/login');
  const db = await getDb();
  return handler({ db, teamId, user: session.user });
}

/**
 * Admin-only variant. Redirects non-admins to /dashboard.
 * Always opens a DB connection; callers that don't need DB receive it
 * in the handler signature but can ignore it.
 */
export async function withAdminPage(handler) {
  const session = await getServerSession(authOptions);
  const teamId = session?.user?.teamId;
  if (!teamId) redirect('/login');
  if (session.user.role !== ROLES.ADMIN) redirect('/dashboard');
  const db = await getDb();
  return handler({ db, teamId, user: session.user });
}
```

Key behaviours:
- `teamId` missing → `redirect('/login')` (consistent with `middleware.js`)
- Non-admin on admin page → `redirect('/dashboard')` (consistent with existing behavior)
- Never stores `teamId` at module level (avoids cross-request contamination per `server-no-shared-module-state`)
- `authOptions` is hardcoded — no parameter needed (same as `withTeam.js`)

### 2.4 RSC page refactors (8 pages)

Replace the inline `getServerSession` + `getDb()` boilerplate in every `page.js` with `withPage` or `withAdminPage`. All 8 pages must carry `export const dynamic = 'force-dynamic'` (required so `router.refresh()` re-runs the server query; some pages already have it, all must have it after this change).

**Pages using `withPage` (any authenticated user):**
- `app/(app)/dashboard/page.js`
- `app/(app)/test-cases/page.js`
- `app/(app)/assignments/page.js`
- `app/(app)/test-runs/page.js`
- `app/(app)/reports/page.js`

**Pages using `withAdminPage` (admin only):**
- `app/(app)/users/page.js`
- `app/(app)/admin/page.js`
- `app/(app)/import-cases/page.js`

**Before (dashboard example):**
```js
const session = await getServerSession(authOptions);
const teamId = session?.user?.teamId;
if (!teamId) redirect('/');
const db = await getDb();
const chartData = await getDashboardData(db, teamId);
const settings = await getDashboardSettings(db, teamId);
```

**After (multiple independent DB calls → Promise.all inside handler):**
```js
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const [data, { softwareVersion }] = await withPage(({ db, teamId }) =>
    Promise.all([getCachedDashboardData(teamId), getCachedDashboardSettings(teamId)])
  );
  // ... render
}
```

**After (page with `searchParams` — outer prop, inner handler):**
```js
export const dynamic = 'force-dynamic';

export default async function AssignmentsPage({ searchParams }) {
  const resolvedParams = await searchParams;
  const view = resolvedParams?.view === 'sent' ? 'sent' : 'mine';

  return withPage(async ({ db, teamId, user }) => {
    const data = await getAssignmentsPageData(db, teamId, {
      userName: user.name,
      view,
    });
    return <AssignmentsClient view={view} assignments={data.assignments} ... />;
  });
}
```

Note: `searchParams` and other page-level props are destructured in the outer page function; `db`, `teamId`, and `user` are injected by `withPage` into the inner handler.

### 2.5 Cross-tenant intent comments (2 queries)

Two queries intentionally omit `teamId` because usernames are a global namespace. Add a comment to distinguish them from accidents:

```js
// CROSS-TENANT: intentional — username is a global namespace; must find
// the user across all teams before teamId is known.
```

Files: `lib/auth.js` (login) and `lib/db/usersData.js` (`createUser`).

---

## 3. What is NOT changing

- `lib/server/withTeam.js` — already correct; no changes
- `lib/db/*.js` file structure — no renames, no class conversions
- `lib/mongodb.js` — connection singleton untouched
- `middleware.js` — no changes
- Any schema or index definitions

---

## 4. Error handling

| Context | Trigger | Behaviour |
|---|---|---|
| RSC page — no session / no teamId | `withPage` / `withAdminPage` | `redirect('/login')` |
| RSC page — non-admin on admin page | `withAdminPage` | `redirect('/dashboard')` |
| API route — no session / no teamId | `withTeam` (existing) | `NextResponse.json({ error: 'Unauthorized' }, 401)` |
| API route — non-admin on admin route | `withAdmin` (existing) | `NextResponse.json({ error: 'Admin access required' }, 403)` |

---

## 5. Files touched

| File | Action |
|---|---|
| `lib/server/withPage.js` | **Create** |
| `lib/auth.js` | Edit — add `session.user.id = token.sub`; add cross-tenant comment |
| `lib/db/usersData.js` | Edit — 2 write filters + cross-tenant comment |
| `lib/db/assignmentsData.js` | Edit — 4 write filters + 2 count/read filters |
| `app/(app)/dashboard/page.js` | Edit — withPage |
| `app/(app)/test-cases/page.js` | Edit — withPage |
| `app/(app)/assignments/page.js` | Edit — withPage |
| `app/(app)/test-runs/page.js` | Edit — withPage |
| `app/(app)/reports/page.js` | Edit — withPage |
| `app/(app)/users/page.js` | Edit — withAdminPage |
| `app/(app)/admin/page.js` | Edit — withAdminPage |
| `app/(app)/import-cases/page.js` | Edit — withAdminPage + add `export const dynamic` |

**Total: 1 new file, 11 edits.**
