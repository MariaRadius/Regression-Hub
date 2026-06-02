# Eliminate the `assignments` Collection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: this plan is executed with
> `superpowers:dispatching-parallel-agents`. Each **Phase** dispatches its
> file-disjoint **slices** as concurrent subagents, followed by a per-phase
> review gate, then a final integration + review pass. Steps use checkbox
> (`- [ ]`) syntax for tracking.

**Goal:** Remove the redundant `assignments` collection — live assignee lives on
`testResults.assignedTo`, history lives in the `events` log — remove the
`/assignments` page, trim the Reassign modal to assignee-only, and add a
selection-independent Bulk Assign modal scoped By Application / By Module.

**Architecture:** Assignment becomes a pure `testResults.assignedTo` mutation plus
an ASSIGN event. The data layer collapses to one `assignTestCases` function that
resolves an application/module/tcId scope to a tcId set, updates the live store
for each target environment, and appends ASSIGN events. Frontend gains a new MUI
`BulkAssignModal` (counts-aware) wired into the test-cases filter toolbar.

**Tech Stack:** Next.js 15 (App Router, RSC), MongoDB driver, Zod, MUI v9,
Vitest + a `createMockDb` helper, Biome.

**Spec:** `docs/superpowers/specs/2026-06-02-eliminate-assignments-collection-design.md`
**Mockup:** `docs/superpowers/specs/mockups/2026-06-02-bulk-assign-modal.html`

---

## Decisions locked (from brainstorming)

- Live assignee = `testResults.assignedTo`; history = `events` (sole audit trail).
- Reassign-only, latest-wins. **No** unassign/clear path or UI.
- Drop `/assignments` page; drop list/filter/unassign.
- Two modals in `/test-cases`: **Reassign** (selection-based, assignee-only) and
  **Bulk Assign** (selection-independent, By Application / By Module, counts, env
  Active/All).
- Server-side scope expansion; `environments: string[]` (active = 1, all = N).
- Tests: **data layer only** (TDD `assignTestCases` + cascades); delete obsolete
  assignment tests; no new frontend/route tests.

## RESOLVED DECISION

- **Route auth wrapper = `withTeam`** (user decision). Any team member may call
  `POST /api/assignments`, so QA keeps the ability to **Reassign** selected cases.
  Only the **Bulk Assign button** is admin-gated in the UI (`FilterStrip`). Note:
  this intentionally diverges from the prior documented "assignment mutations are
  admin-only" line — `smoke-test/SKILL.md` is updated accordingly in Slice 4B.

---

## File Structure

**Rewritten**
- `lib/db/assignmentsData.js` — single export `assignTestCases`.
- `lib/schemas/assignments.js` — body + response schema only.
- `lib/api/assignments.js` — `createAssignment` client wrapper only.
- `app/api/assignments/route.js` — `POST` only, re-pointed.

**Modified**
- `lib/db/releasesData.js` — clone carry via `testResults`; env-remove event
  cascade; drop release-delete assignments line.
- `lib/db/testCasesData.js` — case-delete event cascade; drop reset line; add
  `countCasesByScope`.
- `lib/indexes.js` — drop assignment indexes.
- `components/TopNav.jsx` — remove `/assignments` nav entry + icon import.
- `app/(app)/test-cases/master-detail/bulk/BulkReassignModal.jsx` — trim to
  assignee-only; send `environments`.
- `app/(app)/test-cases/master-detail/FilterStrip.jsx` — admin-only Bulk Assign
  button.
- `app/(app)/test-cases/TestCasesClient.jsx` — `isAdmin`, modal state, counts
  fetch, render `BulkAssignModal`.
- `README.md`, `.claude/skills/smoke-test/SKILL.md`.
- `lib/__tests__/db/assignmentsData.test.js` — rewritten for `assignTestCases`.
- `app/api/assignments/__tests__/route.test.js` — POST-only.
- `lib/__tests__/isolation/crossTeam.test.js` — excise assignment blocks.

**Created**
- `app/api/releases/[id]/scope-counts/route.js`.
- `app/(app)/test-cases/master-detail/bulk/BulkAssignModal.jsx`.
- `scripts/migrate-drop-assignments-collection.mjs`.

**Deleted**
- `app/api/assignments/[id]/` (route + test).
- `app/(app)/assignments/` (page, client, error, loading).
- `scripts/migrate-eliminate-release-wide-assignments.mjs`.
- GET handler + GET tests in the assignments route/test.

---

# PHASE 1 — Backend core (data, schema, routes)

Dispatch slices **1A, 1B, 1C** in parallel. They are file-disjoint and code to the
fixed contract below. Review gate after.

**Contract (all slices code to this):**
- `assignTestCases(db, teamId, body, { assignedBy }) -> { ok: true, testCaseCount }`
  where `body = { releaseId, assignedTo, tcIds?, applicationIds?, moduleIds?, environments }`.
- Client `createAssignment(body)` posts that body; response `{ ok, testCaseCount }`.

## Slice 1A — Data layer + TDD

**Files:**
- Rewrite: `lib/db/assignmentsData.js`
- Rewrite test: `lib/__tests__/db/assignmentsData.test.js`

- [ ] **Step 1: Write the failing tests** (replace the entire file)

```js
import { ObjectId } from 'mongodb';
import { beforeEach, describe, expect, it } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';
import { AUDIT_ACTION, AUDIT_CATEGORY } from '@/lib/constants';
import { assignTestCases } from '@/lib/db/assignmentsData';

const TEAM = 'team-1';
const RELEASE_ID = new ObjectId().toString();
const { db, collections, reset } = createMockDb();

beforeEach(() => reset());

function seedCases(cases) {
  collections.testCases.docs = cases;
}

describe('assignTestCases', () => {
  it('mirrors assignedTo onto testResults for explicit tcIds and returns the count', async () => {
    const res = await assignTestCases(
      db,
      TEAM,
      { releaseId: RELEASE_ID, assignedTo: 'alice', tcIds: ['c1', 'c2'], environments: ['QA'] },
      { assignedBy: 'admin' },
    );
    expect(res).toEqual({ ok: true, testCaseCount: 2 });
    expect(collections.testResults.updateMany).toHaveBeenCalledWith(
      { teamId: TEAM, releaseId: RELEASE_ID, tcId: { $in: ['c1', 'c2'] }, environment: { $in: ['QA'] } },
      { $set: { assignedTo: 'alice' } },
    );
  });

  it('appends one ASSIGN event per (tcId, environment)', async () => {
    await assignTestCases(
      db,
      TEAM,
      { releaseId: RELEASE_ID, assignedTo: 'alice', tcIds: ['c1', 'c2'], environments: ['QA', 'Staging'] },
      { assignedBy: 'admin' },
    );
    const inserted = collections.events.insertMany.mock.calls[0][0];
    expect(inserted).toHaveLength(4); // 2 cases × 2 envs
    expect(inserted[0]).toMatchObject({
      teamId: TEAM,
      category: AUDIT_CATEGORY.ASSIGNMENT,
      action: AUDIT_ACTION.ASSIGN,
      assignedTo: 'alice',
      by: 'admin',
    });
  });

  it('resolves applicationIds and moduleIds to tcIds, unioned and deduped with tcIds', async () => {
    seedCases([
      { _id: new ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa'), teamId: TEAM, releaseId: RELEASE_ID, applicationId: 'app1' },
      { _id: new ObjectId('bbbbbbbbbbbbbbbbbbbbbbbb'), teamId: TEAM, releaseId: RELEASE_ID, moduleId: 'mod1' },
    ]);
    const res = await assignTestCases(
      db,
      TEAM,
      {
        releaseId: RELEASE_ID,
        assignedTo: 'alice',
        tcIds: ['aaaaaaaaaaaaaaaaaaaaaaaa'], // duplicate of the app1 case → deduped
        applicationIds: ['app1'],
        moduleIds: ['mod1'],
        environments: ['QA'],
      },
      { assignedBy: 'admin' },
    );
    expect(res.testCaseCount).toBe(2); // aaaa (dedup) + bbbb
  });

  it('throws 400 when environments is missing or empty', async () => {
    await expect(
      assignTestCases(db, TEAM, { releaseId: RELEASE_ID, assignedTo: 'a', tcIds: ['c1'], environments: [] }, {}),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('throws 400 when no scope source is provided', async () => {
    await expect(
      assignTestCases(db, TEAM, { releaseId: RELEASE_ID, assignedTo: 'a', environments: ['QA'] }, {}),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('throws 400 when the scope matches no cases', async () => {
    seedCases([]);
    await expect(
      assignTestCases(db, TEAM, { releaseId: RELEASE_ID, assignedTo: 'a', applicationIds: ['nope'], environments: ['QA'] }, {}),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('throws 400 when teamId / releaseId / assignedTo missing', async () => {
    await expect(assignTestCases(db, '', { releaseId: RELEASE_ID, assignedTo: 'a', tcIds: ['c1'], environments: ['QA'] }, {})).rejects.toMatchObject({ status: 400 });
    await expect(assignTestCases(db, TEAM, { assignedTo: 'a', tcIds: ['c1'], environments: ['QA'] }, {})).rejects.toMatchObject({ status: 400 });
    await expect(assignTestCases(db, TEAM, { releaseId: RELEASE_ID, tcIds: ['c1'], environments: ['QA'] }, {})).rejects.toMatchObject({ status: 400 });
  });
});
```

> **Mock note:** confirm `createMockDb` exposes per-collection `docs` seeding and
> that `testCases.find(...).toArray()` honors `$or` + `$in` and `projection`. If
> the helper's `find` does not filter, seed only matching docs (as above) so the
> resolver's union/dedup is still exercised. Adjust the seeding shape to the
> helper's actual API; do not change `createMockDb` itself unless a gap blocks the
> test, and if so keep the change minimal and behavior-preserving.

- [ ] **Step 2: Run the tests — verify they fail**

Run: `npx vitest run lib/__tests__/db/assignmentsData.test.js`
Expected: FAIL — `assignTestCases` is not exported.

- [ ] **Step 3: Rewrite the implementation** (replace the entire file)

```js
import { AUDIT_ACTION, AUDIT_CATEGORY } from '@/lib/constants';
import { appendEvents } from '@/lib/db/eventsData';
import { ApiError } from '@/lib/errors';

/**
 * Assigns test cases to a user. Source of truth for the live assignee is
 * testResults.assignedTo; the events log is the sole assignment history.
 *
 * Scope = union of explicit `tcIds` plus every case in the given
 * `applicationIds` / `moduleIds` for the release (deduped). Each environment in
 * `environments` is updated; latest write wins.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {{ releaseId: string, assignedTo: string, tcIds?: string[], applicationIds?: string[], moduleIds?: string[], environments: string[] }} body
 * @param {{ assignedBy?: string }} opts
 * @returns {Promise<{ ok: true, testCaseCount: number }>}
 * @see {@link lib/__tests__/db/assignmentsData.test.js}
 */
export async function assignTestCases(db, teamId, body, { assignedBy } = {}) {
  if (!teamId) throw new ApiError(400, 'teamId required');
  const {
    releaseId,
    assignedTo,
    tcIds,
    applicationIds,
    moduleIds,
    environments,
  } = body ?? {};

  if (!releaseId) throw new ApiError(400, 'releaseId is required');
  if (!assignedTo) throw new ApiError(400, 'assignedTo is required');
  if (!Array.isArray(environments) || environments.length === 0)
    throw new ApiError(400, 'environments is required');

  const hasTc = Array.isArray(tcIds) && tcIds.length > 0;
  const hasApp = Array.isArray(applicationIds) && applicationIds.length > 0;
  const hasMod = Array.isArray(moduleIds) && moduleIds.length > 0;
  if (!hasTc && !hasApp && !hasMod)
    throw new ApiError(
      400,
      'at least one of tcIds, applicationIds, moduleIds is required',
    );

  // Resolve the scope to a deduped set of tcId strings.
  const tcIdSet = new Set(hasTc ? tcIds : []);
  if (hasApp || hasMod) {
    const or = [];
    if (hasApp) or.push({ applicationId: { $in: applicationIds } });
    if (hasMod) or.push({ moduleId: { $in: moduleIds } });
    const cases = await db
      .collection('testCases')
      .find({ teamId, releaseId, $or: or }, { projection: { _id: 1 } })
      .toArray();
    for (const c of cases) tcIdSet.add(c._id.toString());
  }
  const resolvedTcIds = [...tcIdSet];
  if (resolvedTcIds.length === 0)
    throw new ApiError(400, 'no test cases matched the given scope');

  // Mirror the assignee onto the live store for every target environment.
  await db.collection('testResults').updateMany(
    {
      teamId,
      releaseId,
      tcId: { $in: resolvedTcIds },
      environment: { $in: environments },
    },
    { $set: { assignedTo } },
  );

  // Append ASSIGN events — the sole assignment history.
  const at = new Date();
  const events = [];
  for (const tcId of resolvedTcIds) {
    for (const environment of environments) {
      events.push({
        category: AUDIT_CATEGORY.ASSIGNMENT,
        action: AUDIT_ACTION.ASSIGN,
        tcId,
        releaseId,
        environment,
        assignedTo,
        by: assignedBy ?? null,
        at,
      });
    }
  }
  await appendEvents(db, teamId, events);

  return { ok: true, testCaseCount: resolvedTcIds.length };
}
```

- [ ] **Step 4: Run the tests — verify they pass**

Run: `npx vitest run lib/__tests__/db/assignmentsData.test.js`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/db/assignmentsData.js lib/__tests__/db/assignmentsData.test.js
git commit -m "RXR-11849: collapse assignments data layer to assignTestCases (testResults + events)"
```

## Slice 1B — Schema

**Files:**
- Rewrite: `lib/schemas/assignments.js`

- [ ] **Step 1: Replace the file**

```js
import { z } from 'zod';
import { objectIdString } from '@/lib/schemas/common';

/**
 * Body schema for assigning test cases. The scope is the union of explicit
 * `tcIds` plus all cases in the given applications/modules; at least one scope
 * source is required. Every assignment targets one or more concrete
 * environments.
 */
export const createAssignmentBodySchema = z
  .object({
    releaseId: objectIdString,
    assignedTo: z.string().min(1),
    tcIds: z.array(z.string().min(1)).optional(),
    applicationIds: z.array(z.string().min(1)).optional(),
    moduleIds: z.array(z.string().min(1)).optional(),
    environments: z.array(z.string().min(1)).min(1),
  })
  .refine(
    (b) =>
      Boolean(b.tcIds?.length || b.applicationIds?.length || b.moduleIds?.length),
    { message: 'at least one of tcIds, applicationIds, moduleIds is required' },
  );

export const createAssignmentResponseSchema = z.object({
  ok: z.literal(true),
  testCaseCount: z.number(),
});
```

- [ ] **Step 2: Commit**

```bash
git add lib/schemas/assignments.js
git commit -m "RXR-11849: scope-union assignment body schema; drop list/delete schemas"
```

## Slice 1C — Routes + client API

**Files:**
- Rewrite: `app/api/assignments/route.js`
- Delete: `app/api/assignments/[id]/` (whole folder: `route.js` + `__tests__/route.test.js`)
- Modify: `app/api/assignments/__tests__/route.test.js` (POST-only)
- Rewrite: `lib/api/assignments.js`

- [ ] **Step 1: Replace `app/api/assignments/route.js`**

```js
import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { assignTestCases } from '@/lib/db/assignmentsData';
import { ApiError } from '@/lib/errors';
import { createAssignmentBodySchema } from '@/lib/schemas/assignments';
import { withTeam } from '@/lib/server/withTeam';

/**
 * POST /api/assignments
 * Assigns test cases (scope = tcIds ∪ applications ∪ modules) to a user for one
 * or more environments. Open to any team member (the Bulk Assign UI entry point
 * is admin-gated in FilterStrip; Reassign stays available to QA).
 */
export const POST = withTeam(
  async (request, _ctx, { teamId, db, session }) => {
    const body = await request.json();
    const parsed = createAssignmentBodySchema.safeParse(body);
    if (!parsed.success)
      throw new ApiError(400, parsed.error.issues[0]?.message || 'Invalid body');

    const result = await assignTestCases(db, teamId, parsed.data, {
      assignedBy: session.user.name,
    });
    revalidatePath('/dashboard');
    revalidatePath('/(app)/test-cases', 'page');
    return NextResponse.json(result);
  },
);
```

- [ ] **Step 2: Delete the `[id]` route folder**

```bash
git rm -r "app/api/assignments/[id]"
```

- [ ] **Step 3: Trim `app/api/assignments/__tests__/route.test.js` to POST-only**

Replace the `vi.hoisted`/`vi.mock` for `@/lib/db/assignmentsData` to mock only
`assignTestCases`, remove the GET import and the `'GET lists assignments…'` test,
and update the POST test to assert the new call + shape:

```js
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';

const { db, reset } = createMockDb();
const { assignTestCases } = vi.hoisted(() => ({ assignTestCases: vi.fn() }));

vi.mock('@/lib/server/withTeam', () => ({
  withTeam: (handler) => (req, ctx) =>
    handler(req, ctx, { session: { user: { teamId: 't1', name: 'Alice' } }, teamId: 't1', db }),
  withAdmin: (handler) => (req, ctx) =>
    handler(req, ctx, { session: { user: { teamId: 't1', name: 'Alice', role: 'admin' } }, teamId: 't1', db }),
}));
vi.mock('@/lib/db/assignmentsData', () => ({ assignTestCases }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

import { POST } from '../route';

beforeEach(() => { reset(); assignTestCases.mockReset(); });

describe('assignments route', () => {
  it('POST assigns test cases and returns the count', async () => {
    assignTestCases.mockResolvedValue({ ok: true, testCaseCount: 3 });
    const body = { releaseId: 'a'.repeat(24), assignedTo: 'bob', moduleIds: ['m1'], environments: ['QA'] };
    const req = { json: async () => body };
    const res = await POST(req, {});
    expect(assignTestCases).toHaveBeenCalledWith(db, 't1', body, { assignedBy: 'Alice' });
    expect(await res.json()).toEqual({ ok: true, testCaseCount: 3 });
  });
});
```

- [ ] **Step 4: Replace `lib/api/assignments.js`**

```js
import { z } from 'zod';
import { post } from '@/lib/http/client';

const zCreate = z.object({ ok: z.literal(true), testCaseCount: z.number() });

export function createAssignment(body, opts = {}) {
  return post('/api/assignments', body, { schema: zCreate, ...opts });
}
```

- [ ] **Step 5: Run the route tests**

Run: `npx vitest run app/api/assignments/__tests__/route.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/api/assignments lib/api/assignments.js
git commit -m "RXR-11849: POST-only admin assignments route; drop GET + [id] delete route"
```

## Phase 1 Review Gate
Dispatch a review subagent (two-stage: spec-compliance, then code-quality) over the
Phase 1 diff. Verify: contract names/signatures match across slices; no leftover
`listAssignments`/`deleteAssignment`/`assignmentSchema` references; tests green.

---

# PHASE 2 — Backend cascades / indexes / migration

Independent of Phase 1 (disjoint files) — may overlap, but is reviewed as its own
phase. Dispatch slices **2A–2D** in parallel.

## Slice 2A — `lib/db/releasesData.js`

**Files:** Modify `lib/db/releasesData.js`

- [ ] **Step 1: Clone carry — source from `testResults`, not `assignments`.**
Replace the clone block that reads `assignments` (≈ lines 351–379) and the
mirror loop that follows. The new carry reads carried assignees from the source
release's `testResults`, re-keys `tcId` via `tcIdMap`, sets `assignedTo` on the
new release's result rows, and appends ASSIGN events:

```js
if (carryAssignments) {
  const sourceResults = await db
    .collection('testResults')
    .find(
      { teamId, releaseId: cloneFromId, assignedTo: { $ne: null } },
      { projection: { tcId: 1, environment: 1, assignedTo: 1 }, session },
    )
    .toArray();

  const carried = sourceResults.filter((r) => tcIdMap.has(r.tcId));
  for (const r of carried) {
    await db.collection('testResults').updateMany(
      { teamId, releaseId, tcId: tcIdMap.get(r.tcId), environment: r.environment },
      { $set: { assignedTo: r.assignedTo } },
      { session },
    );
  }
  if (carried.length) {
    await db.collection('events').insertMany(
      carried.map((r) => ({
        teamId,
        category: AUDIT_CATEGORY.ASSIGNMENT,
        action: AUDIT_ACTION.ASSIGN,
        tcId: tcIdMap.get(r.tcId),
        releaseId,
        environment: r.environment,
        assignedTo: r.assignedTo,
        by: null,
        at: now3,
      })),
      { session },
    );
  }
}
```

Ensure `AUDIT_CATEGORY` / `AUDIT_ACTION` are imported (they are used elsewhere in
this file; add to the existing `@/lib/constants` import if missing). Remove the
now-dead `newAssignmentDocs`/`sourceAssignments` variables and the
`assignments.insertMany` call.

- [ ] **Step 2: `removeEnvironment` — cascade assignment events for that env.**
Replace the `assignments.deleteMany({ teamId, releaseId, environment: normEnv })`
call (≈ line 688) with an events cascade (1:1 replacement of the old env-scoped
assignment-doc cascade):

```js
// Cascade: delete environment-scoped assignment history.
await db
  .collection('events')
  .deleteMany(
    { teamId, releaseId, environment: normEnv, category: AUDIT_CATEGORY.ASSIGNMENT },
    { session },
  );
```

- [ ] **Step 3: `deleteRelease` — drop the assignments line.**
In the `Promise.all` (≈ lines 749–766) remove the
`db.collection('assignments').deleteMany({ teamId, releaseId }, { session })`
entry. The existing `events.deleteMany({ teamId, releaseId, category: { $in:
[...CASCADE_CATEGORIES] } })` already removes ASSIGNMENT events — no change needed
there.

- [ ] **Step 4: Run the release tests (if present) and commit.**

```bash
npx vitest run lib/__tests__/db/releasesData.test.js 2>/dev/null || true
git add lib/db/releasesData.js
git commit -m "RXR-11849: carry clone assignees via testResults; cascade assignment events on env-remove"
```

## Slice 2B — `lib/db/testCasesData.js` (cascade + counts)

**Files:** Modify `lib/db/testCasesData.js`

- [ ] **Step 1: `deleteTestCase` — replace the assignments delete with an events cascade.**
Replace the `db.collection('assignments').deleteMany({ teamId, tcId }, …)` entry
(≈ lines 453–455) in the `Promise.all` with:

```js
db.collection('events').deleteMany({ teamId, tcId }, { session }),
```

(Deletes the case's entire event trail with the case, per the spec's §6 cascade
decision.)

- [ ] **Step 2: `resetTeamData` — drop the assignments line.**
Remove `db.collection('assignments').deleteMany({ teamId })` from the
`Promise.all` (≈ line 492) and from the destructured result tuple. The existing
`events.deleteMany({ teamId })` already wipes the team's events.

- [ ] **Step 3: Add `countCasesByScope` (backs the Bulk Assign picker).**
Append:

```js
/**
 * Counts test cases per application and per module for a release. Definition
 * counts (environment-independent) backing the Bulk Assign scope picker.
 *
 * @returns {Promise<{ byApplication: Record<string, number>, byModule: Record<string, number> }>}
 */
export async function countCasesByScope(db, teamId, releaseId) {
  if (!teamId) throw new ApiError(400, 'teamId required');
  if (!releaseId) throw new ApiError(400, 'releaseId required');

  const rows = await db
    .collection('testCases')
    .aggregate([
      { $match: { teamId, releaseId } },
      { $group: { _id: { app: '$applicationId', mod: '$moduleId' }, n: { $sum: 1 } } },
    ])
    .toArray();

  const byApplication = {};
  const byModule = {};
  for (const r of rows) {
    if (r._id.app) byApplication[r._id.app] = (byApplication[r._id.app] ?? 0) + r.n;
    if (r._id.mod) byModule[r._id.mod] = (byModule[r._id.mod] ?? 0) + r.n;
  }
  return { byApplication, byModule };
}
```

- [ ] **Step 4: Commit**

```bash
git add lib/db/testCasesData.js
git commit -m "RXR-11849: cascade case events on delete; drop reset assignments line; add countCasesByScope"
```

## Slice 2C — `lib/indexes.js`

**Files:** Modify `lib/indexes.js`

- [ ] **Step 1: Remove the two `assignments.dropIndex(...)` calls** (≈ lines
80–87) and the three `assignments.createIndex(...)` calls plus their comment (≈
lines 174–182). Leave all other collections untouched.

- [ ] **Step 2: Commit**

```bash
git add lib/indexes.js
git commit -m "RXR-11849: drop assignments collection indexes"
```

## Slice 2D — Migration scripts

**Files:**
- Delete: `scripts/migrate-eliminate-release-wide-assignments.mjs`
- Create: `scripts/migrate-drop-assignments-collection.mjs`

- [ ] **Step 1: Delete the obsolete migration**

```bash
git rm scripts/migrate-eliminate-release-wide-assignments.mjs
```

- [ ] **Step 2: Create the drop-collection migration** (mirrors
`migrate-caseId-to-tcId.mjs` conventions)

```js
/**
 * Drops the obsolete `assignments` collection. Assignment state now lives on
 * testResults.assignedTo (live) and the events log (history). Clean-slate: no
 * backfill.
 *
 * Usage:
 *   node scripts/migrate-drop-assignments-collection.mjs --dry-run
 *   node scripts/migrate-drop-assignments-collection.mjs
 */
import { readFileSync } from 'node:fs';
import { MongoClient } from 'mongodb';

function loadUri() {
  const line = readFileSync('.env.local', 'utf8')
    .split('\n')
    .find((l) => l.startsWith('MONGODB_URI='));
  if (!line) throw new Error('MONGODB_URI not found in .env.local');
  return line.slice('MONGODB_URI='.length).trim();
}

const DRY_RUN = process.argv.includes('--dry-run');

const client = new MongoClient(loadUri());
await client.connect();
const db = client.db();

const exists = (await db.listCollections({ name: 'assignments' }).toArray()).length > 0;
const count = exists
  ? await db.collection('assignments').countDocuments({})
  : 0;

if (!exists) {
  console.warn('No `assignments` collection — nothing to do.');
} else if (DRY_RUN) {
  console.warn(`Dry run: would drop \`assignments\` (${count} doc(s)).`);
} else {
  await db.collection('assignments').drop();
  console.warn(`Dropped \`assignments\` (${count} doc(s) removed).`);
}

await client.close();
console.warn(DRY_RUN ? 'Dry run complete — no writes.' : 'Migration complete.');
```

- [ ] **Step 3: Commit**

```bash
git add scripts/migrate-drop-assignments-collection.mjs
git commit -m "RXR-11849: replace release-wide migration with drop-assignments-collection script"
```

## Phase 2 Review Gate
Review subagent: confirm no remaining `collection('assignments')` references in
`lib/`; clone-carry events use the correct `tcIdMap`/`now3`; cascade filters are
correct; `countCasesByScope` matches the route's expectation.

---

# PHASE 3 — Frontend + counts route

Depends on Phase 1 (client API) and Phase 2B (`countCasesByScope`). Dispatch
slices **3A–3D** in parallel.

## Slice 3A — Scope-counts route

**Files:** Create `app/api/releases/[id]/scope-counts/route.js`

- [ ] **Step 1: Create the route**

```js
import { NextResponse } from 'next/server';
import { countCasesByScope } from '@/lib/db/testCasesData';
import { withTeam } from '@/lib/server/withTeam';

/**
 * GET /api/releases/[id]/scope-counts
 * Per-application and per-module case counts for the Bulk Assign picker.
 */
export const GET = withTeam(async (_request, { params }, { teamId, db }) => {
  const { id: releaseId } = await params;
  const result = await countCasesByScope(db, teamId, releaseId);
  return NextResponse.json(result);
});
```

- [ ] **Step 2: Commit**

```bash
git add "app/api/releases/[id]/scope-counts/route.js"
git commit -m "RXR-11849: add scope-counts route for Bulk Assign picker"
```

## Slice 3B — Remove the `/assignments` page + nav

**Files:**
- Delete: `app/(app)/assignments/` (page.js, AssignmentsClient.jsx, error.js, loading.js)
- Modify: `components/TopNav.jsx`

- [ ] **Step 1: Delete the route**

```bash
git rm -r "app/(app)/assignments"
```

- [ ] **Step 2: Remove the nav entry + dead icon import in `components/TopNav.jsx`.**
Delete the `{ href: '/assignments', label: 'Assignments', Icon: AssignmentIcon }`
object (≈ line 42) from the `NAV` array, and delete the now-unused
`import AssignmentIcon from '@mui/icons-material/Assignment';` (≈ line 5).

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/assignments" components/TopNav.jsx
git commit -m "RXR-11849: remove /assignments page and nav entry"
```

## Slice 3C — Trim the Reassign modal

**Files:** Modify `app/(app)/test-cases/master-detail/bulk/BulkReassignModal.jsx`

- [ ] **Step 1: Replace the file** (assignee-only; sends `environments`)

```jsx
'use client';
import { MenuItem, TextField } from '@mui/material';
import { useState } from 'react';
import { useQaUserList } from '@/hooks/useSharedData';
import { createAssignment } from '@/lib/api/assignments';
import { showToast } from '@/utils/showToast';
import BulkModalShell from './BulkModalShell';

/**
 * Reassign the selected test cases to a QA user, scoped to the active
 * environment. Sends { tcIds, releaseId, assignedTo, environments }.
 */
export default function BulkReassignModal({
  open,
  onClose,
  selection,
  releaseId,
  environment,
  onSuccess,
}) {
  const { data: qaUsers = [] } = useQaUserList();
  const [assignedTo, setAssignedTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [assigneeError, setAssigneeError] = useState(false);

  async function handleConfirm() {
    if (!assignedTo) {
      setAssigneeError(true);
      return;
    }
    setLoading(true);
    try {
      await createAssignment({
        tcIds: selection.map((s) => s.tcId),
        releaseId,
        assignedTo,
        environments: [environment],
      });
      showToast(`Reassigned ${selection.length} cases to ${assignedTo}`, 'success');
      onSuccess();
    } catch (e) {
      showToast(e.message || 'Assignment failed', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <BulkModalShell
      open={open}
      onClose={onClose}
      selection={selection}
      title={`Reassign ${selection.length} Cases`}
      subtitle={`Assigns the selected cases in the ${environment} environment`}
      confirmLabel={`Reassign ${selection.length} Cases`}
      confirmColor='primary'
      helperNote='The selected cases will be reassigned to the chosen user for the active environment'
      helperColor='info'
      footerLeft={`${selection.length} cases will be reassigned`}
      loading={loading}
      onConfirm={handleConfirm}
    >
      <TextField
        select
        fullWidth
        size='small'
        label='Assignee'
        required
        value={assignedTo}
        onChange={(e) => {
          setAssignedTo(e.target.value);
          setAssigneeError(false);
        }}
        error={assigneeError}
        helperText={assigneeError ? 'Select a user to assign to' : ''}
        slotProps={{
          select: { displayEmpty: true },
          inputLabel: { shrink: true },
        }}
      >
        <MenuItem value=''>— Select user —</MenuItem>
        {qaUsers.map((u) => (
          <MenuItem key={u} value={u}>
            {u}
          </MenuItem>
        ))}
      </TextField>
    </BulkModalShell>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/(app)/test-cases/master-detail/bulk/BulkReassignModal.jsx
git commit -m "RXR-11849: trim Reassign modal to assignee-only; send environments array"
```

## Slice 3D — Bulk Assign modal + toolbar button + page wiring

**Files:**
- Create: `app/(app)/test-cases/master-detail/bulk/BulkAssignModal.jsx`
- Modify: `app/(app)/test-cases/master-detail/FilterStrip.jsx`
- Modify: `app/(app)/test-cases/TestCasesClient.jsx`

- [ ] **Step 1: Create `BulkAssignModal.jsx`** (MUI realization of the approved
mockup `docs/superpowers/specs/mockups/2026-06-02-bulk-assign-modal.html`)

```jsx
'use client';
import CloseIcon from '@mui/icons-material/Close';
import {
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { useMemo, useState } from 'react';
import { useQaUserList } from '@/hooks/useSharedData';
import { createAssignment } from '@/lib/api/assignments';
import { showToast } from '@/utils/showToast';

/**
 * Selection-independent bulk assign. Scope = all cases in the chosen
 * applications OR modules; targets the active environment or all environments.
 * Sends { applicationIds | moduleIds, releaseId, assignedTo, environments }.
 *
 * @param counts { byApplication: Record<id,number>, byModule: Record<id,number> }
 */
export default function BulkAssignModal({
  open,
  onClose,
  releaseId,
  environment,
  environments,
  applications,
  modules,
  counts,
  onSuccess,
}) {
  const { data: qaUsers = [] } = useQaUserList();
  const [scope, setScope] = useState('application'); // 'application' | 'module'
  const [picked, setPicked] = useState(() => new Set());
  const [assignedTo, setAssignedTo] = useState('');
  const [envMode, setEnvMode] = useState('active'); // 'active' | 'all'
  const [loading, setLoading] = useState(false);

  const items = scope === 'application' ? (applications ?? []) : (modules ?? []);
  const countMap = scope === 'application' ? counts?.byApplication : counts?.byModule;

  const total = useMemo(
    () =>
      [...picked].reduce((sum, id) => sum + (countMap?.[id] ?? 0), 0),
    [picked, countMap],
  );

  function switchScope(_e, next) {
    if (!next) return;
    setScope(next);
    setPicked(new Set());
  }
  function toggle(id) {
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleConfirm() {
    const ids = [...picked];
    const body = {
      releaseId,
      assignedTo,
      environments: envMode === 'all' ? environments : [environment],
      ...(scope === 'application' ? { applicationIds: ids } : { moduleIds: ids }),
    };
    setLoading(true);
    try {
      const res = await createAssignment(body);
      showToast(`Assigned ${res.testCaseCount} cases to ${assignedTo}`, 'success');
      onSuccess?.();
    } catch (e) {
      showToast(e.message || 'Assignment failed', 'error');
    } finally {
      setLoading(false);
    }
  }

  const confirmDisabled = picked.size === 0 || !assignedTo || loading;

  return (
    <Dialog open={open} onClose={onClose} maxWidth='sm' fullWidth>
      <DialogTitle sx={{ pb: 1.5 }}>
        <Stack direction='row' spacing={1} sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <Stack spacing={0.25}>
            <Typography variant='panelTitle' component='h2'>Bulk Assign</Typography>
            <Typography color='text.secondary'>
              Assign every case in the chosen applications or modules
            </Typography>
          </Stack>
          <IconButton size='small' aria-label='Close' onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Stack>
      </DialogTitle>

      <DialogContent>
        <Stack spacing={2.5}>
          {/* Scope type */}
          <Stack spacing={0.75}>
            <Typography variant='formLabel'>Scope</Typography>
            <ToggleButtonGroup exclusive fullWidth size='small' value={scope} onChange={switchScope}>
              <ToggleButton value='application'>By Application</ToggleButton>
              <ToggleButton value='module'>By Module</ToggleButton>
            </ToggleButtonGroup>
          </Stack>

          {/* Items */}
          <Stack spacing={0.75}>
            <Stack direction='row' sx={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Typography variant='formLabel'>
                {scope === 'application' ? 'Applications' : 'Modules'}
              </Typography>
              <Typography variant='metricSub' color='text.disabled'>
                {picked.size ? `${picked.size} selected` : 'none selected'}
              </Typography>
            </Stack>
            <List
              dense
              disablePadding
              sx={{ border: 1, borderColor: 'divider', borderRadius: 1, maxHeight: 220, overflow: 'auto' }}
            >
              {items.length === 0 ? (
                <Typography color='text.disabled' sx={{ p: 1.5 }}>
                  No {scope === 'application' ? 'applications' : 'modules'} found
                </Typography>
              ) : (
                items.map((it) => (
                  <ListItemButton key={it._id} onClick={() => toggle(it._id)} selected={picked.has(it._id)}>
                    <Checkbox edge='start' tabIndex={-1} disableRipple checked={picked.has(it._id)} />
                    <ListItemText primary={it.name} />
                    <Chip size='small' label={countMap?.[it._id] ?? 0} />
                  </ListItemButton>
                ))
              )}
            </List>
          </Stack>

          {/* Assignee */}
          <TextField
            select
            fullWidth
            size='small'
            label='Assignee'
            required
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
          >
            <MenuItem value=''>Select team member…</MenuItem>
            {qaUsers.map((u) => (
              <MenuItem key={u} value={u}>{u}</MenuItem>
            ))}
          </TextField>

          {/* Environment */}
          <Stack spacing={0.75}>
            <Typography variant='formLabel'>Environment</Typography>
            <ToggleButtonGroup
              exclusive
              fullWidth
              size='small'
              value={envMode}
              onChange={(_e, v) => v && setEnvMode(v)}
            >
              <ToggleButton value='active'>Active ({environment})</ToggleButton>
              <ToggleButton value='all'>All environments</ToggleButton>
            </ToggleButtonGroup>
          </Stack>
        </Stack>
      </DialogContent>

      <DialogActions>
        <Typography variant='pageSub' color='text.secondary' sx={{ mr: 'auto' }}>
          <strong>{total}</strong> cases will be assigned{' '}
          {envMode === 'all' ? `across all ${environments?.length ?? 0} environments` : `in ${environment}`}
        </Typography>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant='contained' loading={loading} disabled={confirmDisabled} onClick={handleConfirm}>
          Assign
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

- [ ] **Step 2: Add the admin-only button to `FilterStrip.jsx`.**
Add `isAdmin` and `onBulkAssign` to the prop list (lines 24–30). Make the Row 1
`Stack` space-between and append the button before its closing tag (≈ line 96):

```jsx
{/* Row 1: Saved-view toggles */}
<Stack direction='row' spacing={1} sx={{ alignItems: 'center', px: 2 }}>
  {/* ...existing All button + ToggleButtonGroup... */}
  {isAdmin && (
    <Button size='small' variant='outlined' sx={{ ml: 'auto' }} onClick={onBulkAssign}>
      Bulk Assign
    </Button>
  )}
</Stack>
```

- [ ] **Step 3: Wire `TestCasesClient.jsx`.**
  (a) Import `ROLES` from `@/lib/constants`, `BulkAssignModal`, and `useState`/`useEffect` (already imported). Derive admin and pull `environments` (already destructured from `useReleaseEnv`):

```jsx
import { ROLES } from '@/lib/constants';
import BulkAssignModal from './master-detail/bulk/BulkAssignModal';
// ...
const isAdmin = user?.role === ROLES.ADMIN;
const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
const [scopeCounts, setScopeCounts] = useState({ byApplication: {}, byModule: {} });
```

  (b) Fetch counts when the modal opens:

```jsx
useEffect(() => {
  if (!bulkAssignOpen || !releaseId) return;
  let active = true;
  fetch(`/api/releases/${releaseId}/scope-counts`)
    .then((r) => (r.ok ? r.json() : { byApplication: {}, byModule: {} }))
    .then((data) => { if (active) setScopeCounts(data); })
    .catch(() => {});
  return () => { active = false; };
}, [bulkAssignOpen, releaseId]);
```

  (c) Pass `isAdmin` + `onBulkAssign` to `FilterStrip`:

```jsx
<FilterStrip
  filters={filters}
  user={user}
  applications={applications}
  modules={modules}
  counts={counts}
  isAdmin={isAdmin}
  onBulkAssign={() => setBulkAssignOpen(true)}
/>
```

  (d) Render the modal next to `BulkModalRenderer` (after ≈ line 287):

```jsx
{bulkAssignOpen && (
  <BulkAssignModal
    open
    onClose={() => setBulkAssignOpen(false)}
    releaseId={releaseId}
    environment={environment}
    environments={environments}
    applications={applications}
    modules={modules}
    counts={scopeCounts}
    onSuccess={() => {
      setBulkAssignOpen(false);
      router.refresh(); // or the existing post-mutation refetch used by onSuccess
    }}
  />
)}
```

> Use the same post-mutation refresh mechanism the existing `BulkModalRenderer`
> `onSuccess` uses (inspect lines ~270–287); match it rather than introducing a
> new one.

- [ ] **Step 4: Commit**

```bash
git add app/(app)/test-cases/master-detail/bulk/BulkAssignModal.jsx app/(app)/test-cases/master-detail/FilterStrip.jsx app/(app)/test-cases/TestCasesClient.jsx
git commit -m "RXR-11849: add Bulk Assign modal, admin toolbar button, and page wiring"
```

## Phase 3 Review Gate
Review subagent: button is admin-gated; modal sends `applicationIds`/`moduleIds`
(not both) + `environments`; counts fetch keyed on open; no leftover imports;
visual parity with the mockup (toggles, count chips, disabled-until-valid, footer
total).

---

# PHASE 4 — Docs + isolation test cleanup

Dispatch slices **4A–4C** in parallel.

## Slice 4A — README

**Files:** Modify `README.md`

- [ ] **Step 1: Replace the `### Assignments` block (≈ lines 133–138)** with:

```markdown
### Assignments

- Assign test cases to QA users from `/test-cases`: **Reassign** (the selected
  cases, active environment) or **Bulk Assign** (every case in chosen
  applications/modules, active or all environments). Admin-only.
- Latest assignment per (case, environment) is the effective owner; history lives
  in the audit log
- Assigned-to and tested-by are distinct — reports show them separately
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "RXR-11849: README — describe Reassign + Bulk Assign, drop assignments tab"
```

## Slice 4B — smoke-test SKILL

**Files:** Modify `.claude/skills/smoke-test/SKILL.md`

- [ ] **Step 1:** Remove `/assignments` from the three route lists (≈ lines 64,
163, 267), the role-gating table row (≈ line 80), the two JSON report entries (≈
lines 312, 322). Update the mutation-route sentence (≈ line 86): **remove
`/api/assignments` from the admin-required list** — `POST /api/assignments` is now
open to any team member (`withTeam`); the admin gate is on the Bulk Assign button
only. Note the `/assignments` page route no longer exists. Update the audit-log
note (≈ line 396): assignment mutations are now `POST /api/assignments` only
(no DELETE); they append ASSIGNMENT events.

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/smoke-test/SKILL.md
git commit -m "RXR-11849: smoke-test — drop /assignments route; update mutation + audit notes"
```

## Slice 4C — Cross-team isolation tests

**Files:** Modify `lib/__tests__/isolation/crossTeam.test.js`

- [ ] **Step 1:** Remove the assignment-helper import (≈ lines 23–27), the
`assignments:` seed array (≈ lines 545–566), the entire `describe('Assignment
isolation')` block (≈ lines 819–887), and the two assignment `teamId guard` tests
(≈ lines 1041–1061). Leave all other isolation tests intact.

- [ ] **Step 2: Run and commit**

```bash
npx vitest run lib/__tests__/isolation/crossTeam.test.js
git add lib/__tests__/isolation/crossTeam.test.js
git commit -m "RXR-11849: drop assignments-collection isolation tests"
```

## Phase 4 Review Gate
Review subagent: docs match the new behavior; no `/assignments` references remain
in docs; isolation suite green.

---

# FINAL — Integration, guard, lint, full review

- [ ] **Step 1: Grep guard — zero non-doc hits.**

Run: `git grep -nE "collection\('assignments'\)|listAssignments|deleteAssignment|assignmentSchema|assignmentsListSchema|deleteAssignmentBodySchema|/assignments|migrate-eliminate-release-wide" -- ':!docs/'`
Expected: no results (docs/ excluded).

- [ ] **Step 2: Lint once (per project rule).**

Run: `npm run lint:fix`
Expected: clean.

- [ ] **Step 3: Full test suite.**

Run: `npx vitest run`
Expected: all green; no references to deleted assignment modules.

- [ ] **Step 4: Final parallel review pass.**
Dispatch review subagents across the integrated diff (one per phase area) for a
two-stage review (spec-compliance + code-quality). Resolve findings, then re-run
Steps 1–3.

- [ ] **Step 5: Manual smoke (optional, recommended).**
Reassign from a selection; Bulk Assign By Application and By Module, Active vs All
env; confirm the listing assignee updates for the active environment; delete a
release/case and confirm its events are gone.

---

## Self-Review (author checklist — completed)

- **Spec coverage:** §1 data layer → 1A; §2 schema → 1B; §3 routes → 1C; §5 counts
  → 2B+3A; §6 cascades → 2A+2B; §7 indexes → 2C; §8 migration → 2D; §9 page/nav →
  3B; §10 Reassign → 3C; §11 Bulk Assign → 3D; §12 toolbar → 3D; §13 docs → 4A+4B;
  §14 tests → 1A (data), 1C (route), 4C (isolation). All mapped.
- **Placeholder scan:** none — every code step shows full content.
- **Type consistency:** `assignTestCases(db, teamId, body, { assignedBy })` and
  the `{ ok, testCaseCount }` response are identical across 1A, 1C, and the route
  test; `countCasesByScope` signature matches 2B ↔ 3A; body field names
  (`applicationIds`/`moduleIds`/`environments`) match across schema, data layer,
  and both modals.
- **Open decision:** route auth wrapper (`withAdmin` default) — flagged above for
  plan review.
```
