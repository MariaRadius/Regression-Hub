# Tenant Repository Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all tenant isolation gaps in write/count operations and standardize RSC page auth/role guards behind a single `withPage`/`withAdminPage` helper.

**Architecture:** Three independent layers of fixes — (1) add `teamId` to every write and cross-collection read that currently filters only on `_id`, (2) propagate `session.user.id` in the NextAuth session callback so it's available everywhere, and (3) extract inline `getServerSession + getDb` boilerplate from all 8 RSC pages into a new `lib/server/withPage.js` helper that mirrors `withTeam.js` but for RSC context.

**Tech Stack:** Next.js 15 RSC, NextAuth v4, MongoDB (native driver), Vitest

**Spec:** `docs/superpowers/specs/2026-05-26-tenant-repository-hardening-design.md`

---

## File Map

| File | Action | Responsible for |
|---|---|---|
| `lib/db/usersData.js` | Edit | `updateUser` write filter + `createUser` cross-tenant comment |
| `lib/db/assignmentsData.js` | Edit | 4 write filters, 1 read filter, 1 aggregate `$match` |
| `lib/auth.js` | Edit | `session.user.id = token.sub` + `authorize` cross-tenant comment |
| `lib/server/withPage.js` | **Create** | RSC session+teamId+db helper for page routes |
| `lib/__tests__/server/withPage.test.js` | **Create** | Unit tests for `withPage`/`withAdminPage` |
| `app/(app)/dashboard/page.js` | Edit | Replace inline session boilerplate with `withPage` |
| `app/(app)/test-cases/page.js` | Edit | Replace inline session boilerplate with `withPage` |
| `app/(app)/assignments/page.js` | Edit | Replace inline session boilerplate with `withPage` |
| `app/(app)/test-runs/page.js` | Edit | Replace inline session boilerplate with `withPage` |
| `app/(app)/reports/page.js` | Edit | Replace inline session boilerplate with `withPage` |
| `app/(app)/users/page.js` | Edit | Replace inline session boilerplate with `withAdminPage` |
| `app/(app)/admin/page.js` | Edit | Replace inline session boilerplate with `withAdminPage` |
| `app/(app)/import-cases/page.js` | Edit | Replace inline session boilerplate with `withAdminPage` + add `export const dynamic` |

---

## Task 1: Write-path hardening — `usersData.js`

**Files:**
- Modify: `lib/db/usersData.js`
- Test: `lib/__tests__/db/usersData.test.js`

### Background

`updateUser` does a read-then-write. The ownership read uses `{ _id, teamId }` (correct), but the subsequent `updateOne` uses only `{ _id }`. Fix: add `teamId` to the write filter. Also add a cross-tenant comment to `createUser`'s username uniqueness check.

Note: `deactivateUser` was present in the original spec but has since been removed from `usersData.js`. No action needed for it.

- [ ] **Step 1.1: Write failing test for `updateUser` teamId filter**

Add to `lib/__tests__/db/usersData.test.js` (keep all existing tests, append this describe block):

```js
import { updateUser } from '@/lib/db/usersData';

const USER_ID = '507f1f77bcf86cd799439011';

describe('updateUser', () => {
  it('passes teamId in the updateOne filter', async () => {
    const updateOne = vi.fn().mockResolvedValue({ modifiedCount: 1 });
    collections.users = {
      findOne: vi.fn().mockResolvedValue({ _id: { toString: () => USER_ID }, teamId: TEAM }),
      updateOne,
    };
    await updateUser(db, TEAM, USER_ID, { name: 'New Name' }, { sessionUserId: 'other' });
    expect(updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: TEAM }),
      expect.anything(),
    );
  });
});
```

Note: `TEAM` and `db`/`collections`/`reset` are already declared at the top of the existing test file — do not redeclare them.

- [ ] **Step 1.2: Run test to confirm it fails**

```bash
npx vitest run lib/__tests__/db/usersData.test.js
```

Expected: the new `updateUser` test fails with "expected objectContaining teamId to have been called with...". Existing tests pass.

- [ ] **Step 1.3: Fix `updateUser` write filter and add `createUser` cross-tenant comment**

In `lib/db/usersData.js`:

```js
// createUser — add comment above the existing username check (line ~52):
// CROSS-TENANT: intentional — username is a global namespace; must check
// uniqueness across all teams before teamId is known.
const existing = await db
  .collection('users')
  .findOne({ username: username.trim().toLowerCase() });

// updateUser — change the final updateOne call from:
await db
  .collection('users')
  .updateOne({ _id: new ObjectId(id) }, { $set: update });
// to:
await db
  .collection('users')
  .updateOne({ _id: new ObjectId(id), teamId }, { $set: update });
```

- [ ] **Step 1.4: Run tests to confirm they pass**

```bash
npx vitest run lib/__tests__/db/usersData.test.js
```

Expected: all tests pass.

- [ ] **Step 1.5: Commit**

```bash
git add lib/db/usersData.js lib/__tests__/db/usersData.test.js
git commit -m "RXR-11849: harden updateUser write filter with teamId; add cross-tenant comment to createUser"
```

---

## Task 2: Write-path hardening — `assignmentsData.js`

**Files:**
- Modify: `lib/db/assignmentsData.js`
- Test: `lib/__tests__/db/assignmentsData.test.js`

### Background

6 queries in `assignmentsData.js` are missing `teamId`:
1. `updateAssignment` — `updateOne` write filter uses only `{ _id }`
2. `deleteAssignment` — primary `deleteOne` uses only `{ _id }`
3. `deleteAssignment` — cascade `testCases.updateMany` uses only `{ _id: { $in: oids }, assignmentId: id }`
4. `createAssignment` — cascade `testCases.updateMany` uses only `{ _id: { $in: oids } }`
5. `getAssignmentsPageData` — `completedDocs` find uses `{ _id: { $in: allOids }, status: ... }` (cross-tenant read leak)
6. `listAssignments` — batch `aggregate` `$match` uses `{ _id: { $in: [...oidMap.values()] }, status: ... }` (cross-tenant read leak). Note: this function was recently refactored from a per-assignment `countDocuments` N+1 loop to a single batch aggregate — the gap remained through the refactor. The fix is to add `teamId` to the aggregate `$match`, not `countDocuments`.

- [ ] **Step 2.1: Add failing tests to `lib/__tests__/db/assignmentsData.test.js`**

The file already exists with tests for `getAssignmentsPageData` and `listAssignments`. Add the following new describe blocks to it (keep all existing tests intact). Add `ObjectId` to the existing import from `'mongodb'` if it isn't already there, and import `updateAssignment`, `deleteAssignment`, `createAssignment` alongside the existing imports.

New constants to add at the top alongside existing `TEAM`:
```js
const ASSIGN_ID = '507f1f77bcf86cd799439011';
const TC_ID = '507f1f77bcf86cd799439022';
```

New describe blocks to append:

```js
describe('getAssignmentsPageData — completedDocs teamId', () => {
  it('completedDocs find includes teamId', async () => {
    const findMock = vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) }));
    collections.assignments = {
      find: vi.fn(() => ({
        sort: vi.fn(() => ({
          toArray: vi.fn().mockResolvedValue([
            { _id: { toString: () => ASSIGN_ID }, testCaseIds: [TC_ID] },
          ]),
        })),
      })),
    };
    collections.modules = { find: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })) };
    collections.applications = { find: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })) };
    collections.users = {
      find: vi.fn(() => ({ sort: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })) })),
    };
    collections.testCases = { find: findMock };
    await getAssignmentsPageData(db, TEAM, { userName: 'Bob', view: 'mine' });
    expect(findMock).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: TEAM }),
      expect.anything(),
    );
  });
});

describe('updateAssignment', () => {
  it('passes teamId in the updateOne filter', async () => {
    const updateOne = vi.fn().mockResolvedValue({ modifiedCount: 1 });
    collections.assignments = {
      findOne: vi.fn().mockResolvedValue({ _id: { toString: () => ASSIGN_ID }, teamId: TEAM }),
      updateOne,
    };
    await updateAssignment(db, TEAM, ASSIGN_ID, { title: 'New Title' });
    expect(updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: TEAM }),
      expect.anything(),
    );
  });
});

describe('deleteAssignment', () => {
  it('passes teamId in the deleteOne filter', async () => {
    const deleteOne = vi.fn().mockResolvedValue({ deletedCount: 1 });
    collections.assignments = {
      findOne: vi.fn().mockResolvedValue({
        _id: { toString: () => ASSIGN_ID },
        teamId: TEAM,
        testCaseIds: [],
      }),
      deleteOne,
    };
    await deleteAssignment(db, TEAM, ASSIGN_ID);
    expect(deleteOne).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: TEAM }),
    );
  });

  it('cascade testCases.updateMany includes teamId', async () => {
    const updateMany = vi.fn().mockResolvedValue({ modifiedCount: 1 });
    collections.assignments = {
      findOne: vi.fn().mockResolvedValue({
        _id: { toString: () => ASSIGN_ID },
        teamId: TEAM,
        testCaseIds: [TC_ID],
      }),
      deleteOne: vi.fn().mockResolvedValue({}),
    };
    collections.testCases = { updateMany };
    await deleteAssignment(db, TEAM, ASSIGN_ID);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: TEAM }),
      expect.anything(),
    );
  });
});

describe('createAssignment', () => {
  it('cascade testCases.updateMany includes teamId', async () => {
    const updateMany = vi.fn().mockResolvedValue({});
    collections.assignments = {
      insertOne: vi.fn().mockResolvedValue({ insertedId: { toString: () => ASSIGN_ID } }),
    };
    collections.testCases = { updateMany };
    await createAssignment(
      db,
      TEAM,
      { type: 'selection', testCaseIds: [TC_ID], assignedTo: 'Alice' },
      { assignedBy: 'Bob' },
    );
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: TEAM }),
      expect.anything(),
    );
  });
});

describe('listAssignments — aggregate teamId', () => {
  it('batch aggregate $match includes teamId', async () => {
    const aggregate = vi.fn(() => ({
      toArray: vi.fn().mockResolvedValue([]),
    }));
    collections.assignments = {
      find: vi.fn(() => ({
        sort: vi.fn(() => ({
          toArray: vi.fn().mockResolvedValue([
            { _id: new ObjectId(ASSIGN_ID), testCaseIds: [TC_ID] },
          ]),
        })),
      })),
    };
    collections.testCases = { aggregate };
    await listAssignments(db, TEAM, { view: 'mine', userName: 'Alice' });
    const matchStage = aggregate.mock.calls[0][0].find((s) => s.$match);
    expect(matchStage.$match).toMatchObject({ teamId: TEAM });
  });
});
```

- [ ] **Step 2.2: Run tests to confirm the new ones fail**

```bash
npx vitest run lib/__tests__/db/assignmentsData.test.js
```

Expected: the 6 new tests fail; all pre-existing tests still pass.

- [ ] **Step 2.3: Fix `updateAssignment` write filter**

In `lib/db/assignmentsData.js`, change the `updateOne` at the end of `updateAssignment`:

```js
// from:
await db
  .collection('assignments')
  .updateOne({ _id: new ObjectId(id) }, { $set: update });
// to:
await db
  .collection('assignments')
  .updateOne({ _id: new ObjectId(id), teamId }, { $set: update });
```

- [ ] **Step 2.4: Fix `deleteAssignment` primary filter and cascade**

In `lib/db/assignmentsData.js`:

```js
// Primary deleteOne — from:
await db.collection('assignments').deleteOne({ _id: new ObjectId(id) });
// to:
await db.collection('assignments').deleteOne({ _id: new ObjectId(id), teamId });

// Cascade testCases.updateMany — from:
await db.collection('testCases').updateMany(
  { _id: { $in: oids }, assignmentId: id },
  {
    $unset: { assignedTo: '', assignmentId: '' },
    $set: { updatedAt: new Date() },
  },
);
// to:
await db.collection('testCases').updateMany(
  { _id: { $in: oids }, assignmentId: id, teamId },
  {
    $unset: { assignedTo: '', assignmentId: '' },
    $set: { updatedAt: new Date() },
  },
);
```

- [ ] **Step 2.5: Fix `createAssignment` cascade `testCases.updateMany`**

In `lib/db/assignmentsData.js`, change the `updateMany` at the bottom of `createAssignment`:

```js
// from:
await db
  .collection('testCases')
  .updateMany(
    { _id: { $in: oids } },
    { $set: { assignedTo, assignmentId, updatedAt: now } },
  );
// to:
await db
  .collection('testCases')
  .updateMany(
    { _id: { $in: oids }, teamId },
    { $set: { assignedTo, assignmentId, updatedAt: now } },
  );
```

- [ ] **Step 2.6: Fix `getAssignmentsPageData` completedDocs find**

In `lib/db/assignmentsData.js`, change the `completedDocs` query:

```js
// from:
const completedDocs = await db
  .collection('testCases')
  .find(
    { _id: { $in: allOids }, status: { $in: COMPLETED_STATUSES } },
    { projection: { _id: 1 } },
  )
  .toArray();
// to:
const completedDocs = await db
  .collection('testCases')
  .find(
    { _id: { $in: allOids }, teamId, status: { $in: COMPLETED_STATUSES } },
    { projection: { _id: 1 } },
  )
  .toArray();
```

- [ ] **Step 2.7: Fix `listAssignments` aggregate `$match`**

In `lib/db/assignmentsData.js`, `listAssignments` uses a single batch `aggregate` instead of per-assignment `countDocuments`. The `$match` stage is missing `teamId`. Change it:

```js
// from:
const rows = await db
  .collection('testCases')
  .aggregate([
    {
      $match: {
        _id: { $in: [...oidMap.values()] },
        status: { $in: COMPLETED_STATUSES },
      },
    },
    { $project: { _id: 1 } },
  ])
  .toArray();
// to:
const rows = await db
  .collection('testCases')
  .aggregate([
    {
      $match: {
        _id: { $in: [...oidMap.values()] },
        teamId,
        status: { $in: COMPLETED_STATUSES },
      },
    },
    { $project: { _id: 1 } },
  ])
  .toArray();
```

- [ ] **Step 2.8: Run tests to confirm all pass**

```bash
npx vitest run lib/__tests__/db/assignmentsData.test.js
```

Expected: all tests pass.

- [ ] **Step 2.9: Commit**

```bash
git add lib/db/assignmentsData.js lib/__tests__/db/assignmentsData.test.js
git commit -m "RXR-11849: harden assignmentsData write/count filters with teamId"
```

---

## Task 3: Session `user.id` propagation + cross-tenant comment in `lib/auth.js`

**Files:**
- Modify: `lib/auth.js`

### Background

NextAuth CredentialsProvider does not auto-populate `session.user.id`. The `session` callback currently sets `teamId`, `teamName`, `username`, and `role` but skips `id`. Route handlers access `session.user.id` via `withTeam` (e.g., `updateUser` receives `sessionUserId: session.user.id`). The `mockSession` test helper already sets `id: 'user-1'`, which masks this production gap. Fix by adding `session.user.id = token.sub` in the session callback. Also add a cross-tenant comment to the `authorize` function's username lookup.

No new test file needed — the session callback is NextAuth framework internals and should not be unit-tested per CLAUDE.md ("DO NOT test platform wiring"). Verify the change is correct by reading the code, not by running a test.

- [ ] **Step 3.1: Add `session.user.id` and cross-tenant comment to `lib/auth.js`**

```js
// lib/auth.js — full updated file:
import { compare } from 'bcryptjs';
import CredentialsProvider from 'next-auth/providers/credentials';
import { getDb } from './mongodb';

export const authOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null;
        const db = await getDb();
        // CROSS-TENANT: intentional — username is a global namespace; must find
        // the user across all teams before teamId is known.
        const user = await db
          .collection('users')
          .findOne({ username: credentials.username });
        if (!user) return null;
        const valid = await compare(credentials.password, user.passwordHash);
        if (!valid) return null;
        return {
          id: user._id.toString(),
          name: user.name,
          username: user.username,
          teamId: user.teamId,
          teamName: user.teamName,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.teamId = user.teamId;
        token.teamName = user.teamName;
        token.username = user.username;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.sub;
      session.user.teamId = token.teamId;
      session.user.teamName = token.teamName;
      session.user.username = token.username;
      session.user.role = token.role;
      return session;
    },
  },
  pages: { signIn: '/login' },
  session: { strategy: 'jwt' },
  secret: process.env.NEXTAUTH_SECRET,
};
```

- [ ] **Step 3.2: Commit**

```bash
git add lib/auth.js
git commit -m "RXR-11849: propagate session.user.id from token.sub; add cross-tenant comment to authorize"
```

---

## Task 4: Create `lib/server/withPage.js` + tests

**Files:**
- Create: `lib/server/withPage.js`
- Create: `lib/__tests__/server/withPage.test.js`

### Background

`withPage` is the RSC page equivalent of `withTeam`. It centralizes `getServerSession` + `getDb()` + `teamId` extraction so no page ever touches this boilerplate directly. It is NOT a duplicate of the middleware auth guard — `middleware.js` uses `getToken` (JWT only) and does not check `teamId`. `withPage` closes the gap where a user has a valid JWT but no `teamId` (corrupted session). `withAdminPage` adds role enforcement and is the only correct place for admin-page guards.

Note: `redirect()` from `next/navigation` throws a special error internally. Tests must mock it to prevent throw propagation.

- [ ] **Step 4.1: Write failing tests**

Create `lib/__tests__/server/withPage.test.js`:

```js
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ROLES } from '@/lib/constants';

const { getServerSession, getDb, redirect } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  getDb: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/mongodb', () => ({ getDb }));
vi.mock('next/navigation', () => ({ redirect }));

import { withPage, withAdminPage } from '@/lib/server/withPage';

const mockDb = {};

beforeEach(() => {
  vi.clearAllMocks();
  getDb.mockResolvedValue(mockDb);
});

describe('withPage', () => {
  it('redirects to /login when session is null', async () => {
    getServerSession.mockResolvedValue(null);
    await withPage(vi.fn());
    expect(redirect).toHaveBeenCalledWith('/login');
  });

  it('redirects to /login when teamId is falsy', async () => {
    getServerSession.mockResolvedValue({ user: { teamId: '', role: ROLES.ADMIN } });
    await withPage(vi.fn());
    expect(redirect).toHaveBeenCalledWith('/login');
  });

  it('calls handler with { db, teamId, user } when session is valid', async () => {
    const user = { teamId: 'radius', role: ROLES.QA, name: 'Alice' };
    getServerSession.mockResolvedValue({ user });
    const handler = vi.fn().mockResolvedValue('result');
    const result = await withPage(handler);
    expect(handler).toHaveBeenCalledWith({ db: mockDb, teamId: 'radius', user });
    expect(result).toBe('result');
  });

  it('does not call redirect when session is valid', async () => {
    getServerSession.mockResolvedValue({ user: { teamId: 'radius', role: ROLES.QA } });
    await withPage(vi.fn().mockResolvedValue(null));
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe('withAdminPage', () => {
  it('redirects to /login when teamId is falsy', async () => {
    getServerSession.mockResolvedValue(null);
    await withAdminPage(vi.fn());
    expect(redirect).toHaveBeenCalledWith('/login');
  });

  it('redirects to /dashboard when role is not admin', async () => {
    getServerSession.mockResolvedValue({ user: { teamId: 'radius', role: ROLES.QA } });
    await withAdminPage(vi.fn());
    expect(redirect).toHaveBeenCalledWith('/dashboard');
  });

  it('calls handler for admin users', async () => {
    const user = { teamId: 'radius', role: ROLES.ADMIN, name: 'Admin' };
    getServerSession.mockResolvedValue({ user });
    const handler = vi.fn().mockResolvedValue('admin-result');
    const result = await withAdminPage(handler);
    expect(handler).toHaveBeenCalledWith({ db: mockDb, teamId: 'radius', user });
    expect(result).toBe('admin-result');
  });

  it('does not call redirect for admin users', async () => {
    getServerSession.mockResolvedValue({ user: { teamId: 'radius', role: ROLES.ADMIN } });
    await withAdminPage(vi.fn().mockResolvedValue(null));
    expect(redirect).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4.2: Run tests to confirm they fail**

```bash
npx vitest run lib/__tests__/server/withPage.test.js
```

Expected: all tests fail with "Cannot find module '@/lib/server/withPage'".

- [ ] **Step 4.3: Create `lib/server/withPage.js`**

```js
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/mongodb';
import { ROLES } from '@/lib/constants';

/**
 * RSC page helper — centralises session + DB wiring.
 * Injects { db, teamId, user } into the callback.
 *
 * middleware.js handles unauthenticated redirects with ?redirectTo preserved.
 * This guard fires only for the teamId-missing edge case (valid JWT, no
 * teamId — corrupted session or partial account).
 *
 * - Missing teamId  → redirect('/login')
 *
 * user.id is available via session.user.id (set in authOptions session
 * callback via token.sub). Pass it through to client components when an
 * "is this me?" check is needed.
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
 * Always opens a DB connection; handlers that don't need DB can ignore it.
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

- [ ] **Step 4.4: Run tests to confirm all pass**

```bash
npx vitest run lib/__tests__/server/withPage.test.js
```

Expected: all 8 tests pass.

- [ ] **Step 4.5: Commit**

```bash
git add lib/server/withPage.js lib/__tests__/server/withPage.test.js
git commit -m "RXR-11849: add withPage/withAdminPage RSC helper for tenant + role guards"
```

---

## Task 5: Refactor `withPage` pages (5 pages)

**Files:**
- Modify: `app/(app)/dashboard/page.js`
- Modify: `app/(app)/test-cases/page.js`
- Modify: `app/(app)/assignments/page.js`
- Modify: `app/(app)/test-runs/page.js`
- Modify: `app/(app)/reports/page.js`

### Background

These 5 pages have inconsistent session handling: 3 have no auth guard at all (NPE if session is null), 2 redirect to `/` instead of `/login`. All inline `getServerSession`/`getDb`/`teamId` code is replaced with `withPage`. Pages that call multiple independent DB functions use `Promise.all` inside the handler. Pages that use `searchParams` destructure them in the outer page function before the `withPage` call.

There are no tests for RSC `page.js` files — they are thin layout/data-wiring components. Do not write tests for these files.

- [ ] **Step 5.1: Refactor `dashboard/page.js`**

Note: the chart layer was fully replaced after the plan was first written. The page now uses `StackedBarChart` and `DonutChart` (imported directly from chart files) plus `ChartHoverProvider` context. The old `DynamicCharts` barrel and `AppStackedBarChart`/`TesterBarChart`/`ModuleBarChart` named imports are gone. The only change here is swapping the session boilerplate for `withPage` — preserve every other line exactly.

```js
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import MetricCards from '@/components/MetricCards';
import PageHeader from '@/components/PageHeader';
import Panel from '@/components/Panel';
import SummaryPanel from '@/components/SummaryPanel';
import VersionBadge from '@/components/VersionBadge';
import {
  getCachedDashboardData,
  getCachedDashboardSettings,
} from '@/lib/db/dashboardData';
import {
  buildAppBarData,
  buildDonutData,
  buildModuleBarData,
  buildTesterBarData,
} from '@/lib/db/dashboardTransforms';
import { withPage } from '@/lib/server/withPage';
import { ChartHoverProvider } from './charts/ChartHoverContext';
import DonutChart from './charts/DonutChart';
import StackedBarChart from './charts/StackedBarChart';

export const dynamic = 'force-dynamic';

const APP_DISPLAY_ORDER = ['RadiusExam', 'Practice Admin'];

function compareAppOrder([a], [b]) {
  const ia = APP_DISPLAY_ORDER.indexOf(a);
  const ib = APP_DISPLAY_ORDER.indexOf(b);
  if (ia !== -1 || ib !== -1)
    return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib);
  return a.localeCompare(b);
}

export default async function DashboardPage() {
  const [data, { softwareVersion }] = await withPage(({ teamId }) =>
    Promise.all([
      getCachedDashboardData(teamId),
      getCachedDashboardSettings(teamId),
    ])
  );

  const { summary, moduleGroups, testerGroups, modulesByApp } = data;
  const donutData = buildDonutData(summary);
  const moduleBarData = buildModuleBarData(moduleGroups);
  const appBarData = buildAppBarData(modulesByApp);
  const testerBarData = buildTesterBarData(testerGroups);

  return (
    <ChartHoverProvider>
      <Stack spacing={2.5}>
        <PageHeader
          eyebrow='QA Regression Control Center'
          title='Dashboard'
          sub='Live metrics across all imported test runs'
          actions={<VersionBadge version={softwareVersion} />}
        />

        <MetricCards
          columns={6}
          cards={[
            { label: 'Total Test Cases', value: summary.total, sub: 'All imported' },
            { label: 'Passed', value: summary.passed, cls: 'pass', sub: 'Validated' },
            { label: 'Failed', value: summary.failed, cls: 'fail', sub: 'Needs attention' },
            { label: 'Pending', value: summary.pending, cls: 'pending', sub: 'Awaiting result' },
            { label: 'Pass Rate', value: `${summary.passPercent}%`, sub: 'Of total' },
            { label: 'Fail Rate', value: `${summary.failPercent}%`, sub: 'Of total' },
          ]}
        />

        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
            <Panel title='Pass / Fail / Pending'>
              <Box sx={{ p: 2.5, height: 280 }}>
                <DonutChart donutData={donutData} />
              </Box>
            </Panel>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
            <Panel title='Application Summary'>
              <Box sx={{ p: 2.5, height: 280 }}>
                <StackedBarChart
                  data={appBarData}
                  orientation='vertical'
                  scaleType='percentage'
                  title='Application Summary'
                  navTo={{ filterKey: 'applicationId', valueField: 'appId' }}
                />
              </Box>
            </Panel>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
            <Panel title='QA Tester Summary'>
              <Box sx={{ p: 2.5, height: 280 }}>
                <StackedBarChart
                  data={testerBarData}
                  orientation='horizontal'
                  scaleType='count'
                  title='QA Tester Summary'
                  emptyLabel='Unassigned'
                  minBarSize={3}
                  navTo={{
                    filterKey: 'testedBy',
                    valueField: 'name',
                    encode: true,
                  }}
                />
              </Box>
            </Panel>
          </Grid>
        </Grid>

        <Panel title='Results by Module'>
          <Box sx={{ p: 2.5, height: 380 }}>
            <StackedBarChart
              data={moduleBarData}
              orientation='vertical'
              scaleType='count'
              title='Results by Module'
              sortBy='total'
              minBarSize={3}
              rotateLabels
              navTo={{ filterKey: 'moduleId', valueField: 'moduleId' }}
            />
          </Box>
        </Panel>

        <Grid container spacing={2}>
          {Object.entries(modulesByApp)
            .sort(compareAppOrder)
            .map(([appName, app]) => (
              <Grid size={{ xs: 12, md: 6 }} key={appName}>
                <SummaryPanel
                  title={appName}
                  groups={app.modules}
                  headerStats={{
                    passed: app.passed,
                    failed: app.failed,
                    pending: app.pending,
                  }}
                />
              </Grid>
            ))}
        </Grid>
      </Stack>
    </ChartHoverProvider>
  );
}
```

- [ ] **Step 5.2: Refactor `test-cases/page.js`**

```js
import { listTestCases } from '@/lib/db/testCasesData';
import { withPage } from '@/lib/server/withPage';
import TestCasesClient from './TestCasesClient';

export const dynamic = 'force-dynamic';

export default async function TestCasesPage() {
  return withPage(async ({ db, teamId, user }) => {
    const initialData = await listTestCases(db, teamId);
    return <TestCasesClient user={user} initialData={initialData} />;
  });
}
```

- [ ] **Step 5.3: Refactor `assignments/page.js`**

```js
import { getAssignmentsPageData } from '@/lib/db/assignmentsData';
import { withPage } from '@/lib/server/withPage';
import AssignmentsClient from './AssignmentsClient';

// Required: router.refresh() in AssignmentsClient re-fetches after mutations — must not cache
export const dynamic = 'force-dynamic';

export default async function AssignmentsPage({ searchParams }) {
  const resolvedParams = await searchParams;
  const view = resolvedParams?.view === 'sent' ? 'sent' : 'mine';

  return withPage(async ({ db, teamId, user }) => {
    const data = await getAssignmentsPageData(db, teamId, {
      userName: user.name,
      view,
    });
    return (
      <AssignmentsClient
        view={view}
        assignments={data.assignments}
        modules={data.modules}
        moduleCounts={data.moduleCounts}
        qaUsers={data.qaUsers}
      />
    );
  });
}
```

- [ ] **Step 5.4: Refactor `test-runs/page.js`**

```js
import RefreshOutlined from '@mui/icons-material/RefreshOutlined';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import EmptyState from '@/components/EmptyState';
import PageHeader from '@/components/PageHeader';
import Panel from '@/components/Panel';
import TestRunRow from '@/components/TestRunRow';
import { listTestRuns } from '@/lib/db/testRunsData';
import { withPage } from '@/lib/server/withPage';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Test Runs',
  description: 'History of Excel import test runs for your team.',
};

export default async function TestRunsPage() {
  return withPage(async ({ db, teamId }) => {
    const rawRuns = await listTestRuns(db, teamId);

    const runs = rawRuns.map((r) => ({
      _id: String(r._id),
      uploadedFileName: r.uploadedFileName,
      testEnvironment: r.testEnvironment,
      softwareVersion: r.softwareVersion,
      importedCount: r.importedCount,
      totalInFile: r.totalInFile,
      refreshedCount: r.updatedCount ?? r.duplicatesSkipped ?? 0,
      createdAt:
        r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    }));

    return (
      <Stack spacing={3}>
        <PageHeader
          eyebrow='History'
          title='Test Runs'
          sub={`Each Excel import creates a new test run. ${runs.length} total.`}
        />

        {runs.length === 0 ? (
          <EmptyState icon={<RefreshOutlined />} title='No test runs yet'>
            <Typography variant='body2' color='text.secondary' sx={{ mb: 2 }}>
              Each Excel file you import will appear here as a test run.
            </Typography>
            <Button variant='contained' component={Link} href='/import-cases'>
              Import Excel File
            </Button>
          </EmptyState>
        ) : (
          <Panel title='Import History'>
            <TableContainer sx={{ maxHeight: 'calc(100vh - 280px)' }}>
              <Table size='small' stickyHeader aria-label='Import history'>
                <TableHead
                  sx={{
                    '& th': {
                      bgcolor: 'action.selected',
                      borderBottomWidth: 2,
                      borderBottomColor: 'divider',
                    },
                  }}
                >
                  <TableRow>
                    <TableCell scope='col'>File Name</TableCell>
                    <TableCell scope='col'>Environment</TableCell>
                    <TableCell scope='col'>Version</TableCell>
                    <TableCell scope='col'>Imported</TableCell>
                    <TableCell scope='col'>Updated</TableCell>
                    <TableCell scope='col'>Imported On</TableCell>
                    <TableCell scope='col'>Report</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {runs.map((run) => (
                    <TestRunRow key={run._id} run={run} />
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Panel>
        )}
      </Stack>
    );
  });
}
```

- [ ] **Step 5.5: Refactor `reports/page.js`**

```js
import { getReportsPageData } from '@/lib/db/reportsData';
import { withPage } from '@/lib/server/withPage';
import ReportsClient from './ReportsClient';

export const metadata = {
  title: 'Reports | Test Atlas',
  description:
    'Generate PDF signoff reports and Excel exports for version history.',
};

export const dynamic = 'force-dynamic';

export default async function ReportsPage({ searchParams }) {
  const resolvedParams = await searchParams;
  const applicationId = resolvedParams?.applicationId || '';

  return withPage(async ({ db, teamId }) => {
    const data = await getReportsPageData(db, teamId, applicationId);
    return (
      <ReportsClient
        initialVersions={data.versions}
        initialSettings={data.settings}
        initialApplications={data.applications}
        initialApplicationId={applicationId}
      />
    );
  });
}
```

- [ ] **Step 5.6: Run full test suite to confirm no regressions**

```bash
npx vitest run
```

Expected: all tests pass. (RSC pages have no unit tests — this confirms no import side-effects were broken.)

- [ ] **Step 5.7: Commit**

```bash
git add app/(app)/dashboard/page.js \
        app/(app)/test-cases/page.js \
        app/(app)/assignments/page.js \
        app/(app)/test-runs/page.js \
        app/(app)/reports/page.js
git commit -m "RXR-11849: replace inline session boilerplate with withPage in 5 RSC pages"
```

---

## Task 6: Refactor `withAdminPage` pages (3 pages)

**Files:**
- Modify: `app/(app)/users/page.js`
- Modify: `app/(app)/admin/page.js`
- Modify: `app/(app)/import-cases/page.js`

### Background

Current state of these 3 pages:
- `users/page.js`: has a partial fix (`if (!session) redirect('/dashboard')`) but redirects to `/dashboard` not `/login`, and still has dead `ROLES` import + redundant guards. Also calls `getUsers(session.user.teamId)` without `db` — use `getUsers(db, teamId)` in the handler since `withAdminPage` already has the connection open. Preserve the `metadata` export.
- `admin/page.js`: `session.user.role` accessed without null check — crashes if session is null
- `import-cases/page.js`: `if (!session) redirect('/dashboard')` — wrong redirect target (should be `/login`); also missing `export const dynamic = 'force-dynamic'`

All three are replaced with `withAdminPage`. Remove dead imports (`redirect`, `getServerSession`, `authOptions`, `ROLES`, `getDb`) from each file after the replacement.

There are no unit tests for these RSC page files.

- [ ] **Step 6.1: Refactor `users/page.js`**

```js
import { getUsers } from '@/lib/db/usersData';
import { withAdminPage } from '@/lib/server/withPage';
import UsersClient from './UsersClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'User Management' };

export default async function UsersPage() {
  return withAdminPage(async ({ db, teamId, user }) => {
    const users = await getUsers(db, teamId);
    return <UsersClient user={user} initialUsers={users} />;
  });
}
```
- [ ] **Step 6.2: Refactor `admin/page.js`**

```js
import { withAdminPage } from '@/lib/server/withPage';
import AdminClient from './AdminClient';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  return withAdminPage(async ({ user }) => {
    return <AdminClient user={user} />;
  });
}
```

- [ ] **Step 6.3: Refactor `import-cases/page.js`**

```js
import { getTeamSettings } from '@/lib/db/settingsData';
import { withAdminPage } from '@/lib/server/withPage';
import ImportCasesClient from './ImportCasesClient';

export const dynamic = 'force-dynamic';

export default async function ImportCasesPage() {
  return withAdminPage(async ({ db, teamId }) => {
    const settings = await getTeamSettings(db, teamId);
    return (
      <ImportCasesClient
        initialEnv={settings.testEnvironment ?? ''}
        initialVersion={settings.softwareVersion ?? ''}
      />
    );
  });
}
```

- [ ] **Step 6.4: Run full test suite**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 6.5: Run lint**

```bash
npm run lint:fix
```

Expected: no errors.

- [ ] **Step 6.6: Commit**

```bash
git add app/(app)/users/page.js \
        app/(app)/admin/page.js \
        app/(app)/import-cases/page.js
git commit -m "RXR-11849: replace inline session boilerplate with withAdminPage in 3 admin RSC pages"
```

---

## Self-Review

### Spec coverage check

| Spec requirement | Covered by task |
|---|---|
| `updateUser` write filter + `teamId` | Task 1 |
| `createUser` cross-tenant comment | Task 1 |
| `updateAssignment` write filter + `teamId` | Task 2 |
| `deleteAssignment` primary deleteOne + `teamId` | Task 2 |
| `deleteAssignment` cascade updateMany + `teamId` | Task 2 |
| `createAssignment` cascade updateMany + `teamId` | Task 2 |
| `getAssignmentsPageData` completedDocs find + `teamId` | Task 2 |
| `listAssignments` aggregate `$match` + `teamId` | Task 2 |
| `session.user.id = token.sub` | Task 3 |
| `lib/auth.js` cross-tenant comment | Task 3 |
| Create `lib/server/withPage.js` | Task 4 |
| `withPage` redirect to `/login` for missing teamId | Task 4 |
| `withAdminPage` redirect to `/dashboard` for non-admin | Task 4 |
| Refactor 5 authenticated pages with `withPage` | Task 5 |
| Refactor 3 admin pages with `withAdminPage` | Task 6 |
| `import-cases/page.js` add `export const dynamic` | Task 6 |

All spec requirements are covered. No gaps.
