# Events / Activity Log — Phase 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the `resultEvents` collection and its helpers to the general `events` name, and extend the audit constants to the full 9-category taxonomy — migrating every existing caller and test so the suite stays green, with no change yet to *what* is recorded.

**Architecture:** Pure clean-slate rename + constant extension. The data-layer module `lib/db/resultEventsData.js` becomes `lib/db/eventsData.js` with `appendResultEvent`/`appendResultEvents`/`listResultEvents` renamed to `appendEvent`/`appendEvents`/`listEvents` (and `appendAssignmentEvents` kept). The Mongo collection `resultEvents` becomes `events`. `lib/constants.js` gains the new `AUDIT_CATEGORY`/`AUDIT_ACTION` values plus two classification lists (`PER_CASE_CATEGORIES`, `CASCADE_CATEGORIES`) that later phases consume. No event-emission behavior changes in this phase — every current emission keeps firing, just through the renamed helpers.

**Tech Stack:** Next.js (App Router) route handlers, MongoDB driver, Vitest + jsdom, Biome (lint via `npm run lint:fix`).

**Scope boundary:** This phase does NOT add any new event emissions, the cascade hook, the read route, the beacon, or UI. Those are Phases 2–4. The only observable change is the collection name and helper/constant names.

**Operational note (collection rename):** This is a pre-launch clean-slate rename (per project rule "perform clean slate operations; no backward compatibility"). Existing `resultEvents` documents in any live DB are intentionally abandoned — there is no data-migration shim. If a non-throwaway environment ever needs the old rows, rename the collection in Mongo manually (`db.resultEvents.renameCollection('events')`) before deploy; it is out of scope for this plan.

---

## File Structure

| File | Responsibility | Action |
| --- | --- | --- |
| `lib/constants.js` | Domain enums incl. audit categories/actions + classification lists | Modify |
| `lib/db/eventsData.js` | Append/list helpers over the `events` collection | Create (from `resultEventsData.js`) |
| `lib/db/resultEventsData.js` | Old module | Delete |
| `lib/__tests__/db/eventsData.test.js` | Unit tests for the helpers | Create (from `resultEventsData.test.js`) |
| `lib/__tests__/db/resultEventsData.test.js` | Old test | Delete |
| `lib/db/testCasesData.js` | Imports `appendEvent`; uses `events` collection in `resetTeamData` | Modify |
| `lib/db/testCasesBulkData.js` | Imports `appendEvents` | Modify |
| `lib/db/assignmentsData.js` | Imports `appendAssignmentEvents` | Modify |
| `lib/indexes.js` | Indexes on the `events` collection | Modify |
| `lib/__tests__/db/testCasesData.test.js` | Stubs `collections.events` | Modify |
| `lib/__tests__/db/testCasesBulkData.test.js` | Stubs `collections.events` | Modify |
| `lib/__tests__/db/assignmentsData.test.js` | Stubs `collections.events` | Modify |
| `README.md` | Collection-name reference (line ~109) | Modify |
| `.claude/skills/smoke-test/SKILL.md` | Collection-name reference (line ~383) | Modify |

---

## Task 1: Extend the audit constants

**Files:**
- Modify: `lib/constants.js:7-18` (the `AUDIT_CATEGORY` and `AUDIT_ACTION` blocks)
- Test: `lib/__tests__/constants.test.js` (create if absent)

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/constants.test.js`:

```js
import { describe, expect, it } from 'vitest';
import {
  AUDIT_ACTION,
  AUDIT_CATEGORY,
  CASCADE_CATEGORIES,
  PER_CASE_CATEGORIES,
  statusToAction,
  STATUS,
} from '@/lib/constants';

describe('AUDIT_CATEGORY', () => {
  it('covers the full 9-category taxonomy', () => {
    expect(AUDIT_CATEGORY).toEqual({
      RESULT: 'result',
      TEST_CASE: 'test_case',
      ASSIGNMENT: 'assignment',
      IMPORT: 'import',
      RELEASE: 'release',
      AUTH: 'auth',
      USER: 'user',
      EXPORT: 'export',
      CONFIG: 'config',
    });
  });
});

describe('AUDIT_ACTION', () => {
  it('keeps the existing result/assignment action values', () => {
    expect(AUDIT_ACTION.PASS).toBe('pass');
    expect(AUDIT_ACTION.FAIL).toBe('fail');
    expect(AUDIT_ACTION.RESET).toBe('reset');
    expect(AUDIT_ACTION.ASSIGN).toBe('assign');
    expect(AUDIT_ACTION.UNASSIGN).toBe('unassign');
  });

  it('adds the new action values', () => {
    expect(AUDIT_ACTION.CREATE).toBe('create');
    expect(AUDIT_ACTION.EDIT).toBe('edit');
    expect(AUDIT_ACTION.UPDATE).toBe('update');
    expect(AUDIT_ACTION.DELETE).toBe('delete');
    expect(AUDIT_ACTION.IMPORT).toBe('import');
    expect(AUDIT_ACTION.COMPLETE).toBe('complete');
    expect(AUDIT_ACTION.RESTORE).toBe('restore');
    expect(AUDIT_ACTION.LOGIN).toBe('login');
    expect(AUDIT_ACTION.LOGOUT).toBe('logout');
    expect(AUDIT_ACTION.ROLE_CHANGE).toBe('role-change');
    expect(AUDIT_ACTION.EXPORT_EXCEL).toBe('excel');
    expect(AUDIT_ACTION.EXPORT_PDF).toBe('pdf');
    expect(AUDIT_ACTION.SETTINGS_UPDATE).toBe('settings-update');
    expect(AUDIT_ACTION.MODULE_CREATE).toBe('module-create');
  });
});

describe('statusToAction (unchanged behavior)', () => {
  it('maps STATUS values to result actions', () => {
    expect(statusToAction(STATUS.PASS)).toBe(AUDIT_ACTION.PASS);
    expect(statusToAction(STATUS.FAIL)).toBe(AUDIT_ACTION.FAIL);
    expect(statusToAction(STATUS.PENDING)).toBe(AUDIT_ACTION.RESET);
  });
});

describe('category classification lists', () => {
  it('PER_CASE_CATEGORIES are exactly the testCaseId-bearing categories', () => {
    expect(PER_CASE_CATEGORIES).toEqual([
      AUDIT_CATEGORY.RESULT,
      AUDIT_CATEGORY.TEST_CASE,
      AUDIT_CATEGORY.ASSIGNMENT,
      AUDIT_CATEGORY.IMPORT,
    ]);
  });

  it('CASCADE_CATEGORIES add RELEASE to the per-case set', () => {
    expect(CASCADE_CATEGORIES).toEqual([
      AUDIT_CATEGORY.RESULT,
      AUDIT_CATEGORY.TEST_CASE,
      AUDIT_CATEGORY.ASSIGNMENT,
      AUDIT_CATEGORY.IMPORT,
      AUDIT_CATEGORY.RELEASE,
    ]);
  });

  it('never-purge categories are excluded from CASCADE_CATEGORIES', () => {
    for (const c of [
      AUDIT_CATEGORY.AUTH,
      AUDIT_CATEGORY.USER,
      AUDIT_CATEGORY.EXPORT,
      AUDIT_CATEGORY.CONFIG,
    ]) {
      expect(CASCADE_CATEGORIES).not.toContain(c);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/constants.test.js`
Expected: FAIL — `AUDIT_CATEGORY` lacks `TEST_CASE`/`IMPORT`/`RELEASE`/`AUTH`/`USER`/`EXPORT`/`CONFIG`; `PER_CASE_CATEGORIES`/`CASCADE_CATEGORIES` are `undefined` (import errors / assertion failures).

- [ ] **Step 3: Implement the constant extension**

In `lib/constants.js`, replace the existing `AUDIT_CATEGORY` and `AUDIT_ACTION` blocks (lines 7–18) with:

```js
export const AUDIT_CATEGORY = Object.freeze({
  RESULT: 'result',
  TEST_CASE: 'test_case',
  ASSIGNMENT: 'assignment',
  IMPORT: 'import',
  RELEASE: 'release',
  AUTH: 'auth',
  USER: 'user',
  EXPORT: 'export',
  CONFIG: 'config',
});

export const AUDIT_ACTION = Object.freeze({
  // result
  PASS: 'pass',
  FAIL: 'fail',
  RESET: 'reset',
  // test_case / user (shared simple verbs)
  CREATE: 'create',
  EDIT: 'edit',
  UPDATE: 'update',
  DELETE: 'delete',
  // assignment
  ASSIGN: 'assign',
  UNASSIGN: 'unassign',
  // import
  IMPORT: 'import',
  // release
  COMPLETE: 'complete',
  RESTORE: 'restore',
  // auth
  LOGIN: 'login',
  LOGOUT: 'logout',
  // user
  ROLE_CHANGE: 'role-change',
  // export
  EXPORT_EXCEL: 'excel',
  EXPORT_PDF: 'pdf',
  // config
  SETTINGS_UPDATE: 'settings-update',
  MODULE_CREATE: 'module-create',
});

// Categories whose events carry a testCaseId and are surfaced in per-case History.
export const PER_CASE_CATEGORIES = Object.freeze([
  AUDIT_CATEGORY.RESULT,
  AUDIT_CATEGORY.TEST_CASE,
  AUDIT_CATEGORY.ASSIGNMENT,
  AUDIT_CATEGORY.IMPORT,
]);

// Categories whose events die with their release (cascade on version delete).
// Excludes never-purge account/system categories (AUTH, USER, EXPORT, CONFIG).
export const CASCADE_CATEGORIES = Object.freeze([
  AUDIT_CATEGORY.RESULT,
  AUDIT_CATEGORY.TEST_CASE,
  AUDIT_CATEGORY.ASSIGNMENT,
  AUDIT_CATEGORY.IMPORT,
  AUDIT_CATEGORY.RELEASE,
]);
```

Leave `statusToAction` (lines 27–31) unchanged — it references `STATUS` and `AUDIT_ACTION.PASS/FAIL/RESET`, all still present.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/__tests__/constants.test.js`
Expected: PASS (all assertions green).

- [ ] **Step 5: Commit**

```bash
git add lib/constants.js lib/__tests__/constants.test.js
git commit -m "RXR-11849: extend audit constants to full 9-category taxonomy"
```

---

## Task 2: Create the renamed `eventsData` module + tests

**Files:**
- Create: `lib/db/eventsData.js`
- Create: `lib/__tests__/db/eventsData.test.js`
- (Old files deleted in Task 3 once callers move.)

- [ ] **Step 1: Write the test file**

Create `lib/__tests__/db/eventsData.test.js` (renamed from `resultEventsData.test.js`: imports point at `eventsData`, helper names updated, every `collections.resultEvents` becomes `collections.events`, `listResultEvents` becomes `listEvents`):

```js
import { ObjectId } from 'mongodb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectApiError } from '@/lib/__tests__/helpers/expectApiError';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';
import { AUDIT_ACTION, AUDIT_CATEGORY } from '@/lib/constants';
import {
  appendAssignmentEvents,
  appendEvent,
  appendEvents,
  listEvents,
} from '@/lib/db/eventsData';

const TEAM = 'team-1';
const { db, collections, reset } = createMockDb();

beforeEach(() => reset());

describe('appendEvent', () => {
  it('calls insertOne with teamId merged into the event doc', async () => {
    collections.events = {
      insertOne: vi.fn().mockResolvedValue({ insertedId: new ObjectId() }),
    };

    const event = {
      category: AUDIT_CATEGORY.RESULT,
      action: AUDIT_ACTION.PASS,
      testCaseId: 'tc-1',
      externalId: 'EX-1',
      status: 'Pass',
      softwareVersionTested: 'v1.0',
      notes: 'ok',
      assignmentId: null,
      assignedTo: null,
      by: 'Alice',
      at: new Date('2026-01-01T00:00:00Z'),
    };

    await appendEvent(db, TEAM, event);

    expect(collections.events.insertOne).toHaveBeenCalledOnce();
    const doc = collections.events.insertOne.mock.calls[0][0];
    expect(doc.teamId).toBe(TEAM);
    expect(doc.action).toBe(AUDIT_ACTION.PASS);
    expect(doc.by).toBe('Alice');
  });

  it('throws ApiError(400) when teamId is missing', async () => {
    await expectApiError(appendEvent(db, '', { action: AUDIT_ACTION.PASS }), {
      status: 400,
    });
    await expectApiError(appendEvent(db, null, { action: AUDIT_ACTION.PASS }), {
      status: 400,
    });
  });

  it('propagates DB failure from insertOne', async () => {
    collections.events = {
      insertOne: vi.fn().mockRejectedValue(new Error('DB error')),
    };

    await expect(
      appendEvent(db, TEAM, {
        category: AUDIT_CATEGORY.RESULT,
        action: AUDIT_ACTION.PASS,
        testCaseId: 'tc-1',
        by: 'Alice',
        at: new Date(),
      }),
    ).rejects.toThrow('DB error');
  });
});

describe('appendEvents', () => {
  it('is a no-op when the events array is empty', async () => {
    collections.events = {
      insertMany: vi.fn().mockResolvedValue({ insertedCount: 0 }),
    };

    await appendEvents(db, TEAM, []);

    expect(collections.events.insertMany).not.toHaveBeenCalled();
  });

  it('inserts one doc per event via insertMany', async () => {
    collections.events = {
      insertMany: vi.fn().mockResolvedValue({ insertedCount: 2 }),
    };

    const events = [
      { action: AUDIT_ACTION.PASS, testCaseId: 'tc-1', by: 'Alice', at: new Date() },
      { action: AUDIT_ACTION.FAIL, testCaseId: 'tc-2', by: 'Alice', at: new Date() },
    ];

    await appendEvents(db, TEAM, events);

    expect(collections.events.insertMany).toHaveBeenCalledOnce();
    const docs = collections.events.insertMany.mock.calls[0][0];
    expect(docs).toHaveLength(2);
    expect(docs[0].teamId).toBe(TEAM);
    expect(docs[0].action).toBe(AUDIT_ACTION.PASS);
    expect(docs[1].teamId).toBe(TEAM);
    expect(docs[1].action).toBe(AUDIT_ACTION.FAIL);
  });

  it('throws ApiError(400) when teamId is missing', async () => {
    await expectApiError(
      appendEvents(db, null, [{ action: AUDIT_ACTION.PASS }]),
      { status: 400 },
    );
  });
});

describe('appendAssignmentEvents', () => {
  it('is a no-op when testCaseIds is empty', async () => {
    collections.events = {
      insertMany: vi.fn().mockResolvedValue({ insertedCount: 0 }),
    };

    await appendAssignmentEvents(db, TEAM, {
      action: AUDIT_ACTION.ASSIGN,
      testCaseIds: [],
      assignmentId: 'asgn-1',
      assignedTo: 'Bob',
      by: 'Alice',
      at: new Date(),
    });

    expect(collections.events.insertMany).not.toHaveBeenCalled();
  });

  it('fans out one doc per testCaseId with category=assignment', async () => {
    collections.events = {
      insertMany: vi.fn().mockResolvedValue({ insertedCount: 3 }),
    };

    await appendAssignmentEvents(db, TEAM, {
      action: AUDIT_ACTION.ASSIGN,
      testCaseIds: ['tc-1', 'tc-2', 'tc-3'],
      assignmentId: 'asgn-1',
      assignedTo: 'Bob',
      by: 'Alice',
      at: new Date(),
    });

    expect(collections.events.insertMany).toHaveBeenCalledOnce();
    const docs = collections.events.insertMany.mock.calls[0][0];
    expect(docs).toHaveLength(3);

    for (const doc of docs) {
      expect(doc.teamId).toBe(TEAM);
      expect(doc.category).toBe(AUDIT_CATEGORY.ASSIGNMENT);
      expect(doc.action).toBe(AUDIT_ACTION.ASSIGN);
      expect(doc.assignmentId).toBe('asgn-1');
      expect(doc.assignedTo).toBe('Bob');
      expect(doc.by).toBe('Alice');
      expect(doc.status).toBeNull();
      expect(doc.softwareVersionTested).toBeNull();
      expect(doc.notes).toBeNull();
    }

    expect(docs.map((d) => d.testCaseId)).toEqual(['tc-1', 'tc-2', 'tc-3']);
  });

  it('throws ApiError(400) when teamId is missing', async () => {
    await expectApiError(
      appendAssignmentEvents(db, '', {
        action: AUDIT_ACTION.ASSIGN,
        testCaseIds: ['tc-1'],
        assignmentId: 'asgn-1',
        assignedTo: 'Bob',
        by: 'Alice',
        at: new Date(),
      }),
      { status: 400 },
    );
  });
});

describe('listEvents', () => {
  it('sorts by at desc and returns toClientDoc-mapped docs', async () => {
    const id1 = new ObjectId();
    const id2 = new ObjectId();
    const at1 = new Date('2026-01-02T00:00:00Z');
    const at2 = new Date('2026-01-01T00:00:00Z');

    const rawDocs = [
      { _id: id1, teamId: TEAM, testCaseId: 'tc-1', action: AUDIT_ACTION.PASS, at: at1 },
      { _id: id2, teamId: TEAM, testCaseId: 'tc-1', action: AUDIT_ACTION.FAIL, at: at2 },
    ];

    collections.events = {
      find: vi.fn(() => ({
        sort: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue(rawDocs) })),
      })),
    };

    const results = await listEvents(db, TEAM, { testCaseId: 'tc-1' });

    expect(collections.events.find).toHaveBeenCalledWith({
      teamId: TEAM,
      testCaseId: 'tc-1',
    });

    const sortMock = collections.events.find.mock.results[0].value.sort;
    expect(sortMock).toHaveBeenCalledWith({ at: -1 });

    expect(results).toHaveLength(2);
    expect(results[0]._id).toBe(id1.toString());
    expect(results[0].at).toBe(at1.toISOString());
    expect(results[1]._id).toBe(id2.toString());
  });

  it('throws ApiError(400) when teamId is missing', async () => {
    await expectApiError(listEvents(db, null, { testCaseId: 'tc-1' }), {
      status: 400,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/db/eventsData.test.js`
Expected: FAIL — `Cannot find module '@/lib/db/eventsData'` (module not yet created).

- [ ] **Step 3: Create the module**

Create `lib/db/eventsData.js`:

```js
import { AUDIT_CATEGORY } from '@/lib/constants';
import { toClientDoc } from '@/lib/db/util';
import { ApiError } from '@/lib/errors';

/**
 * Inserts a single event into the events collection.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {object} event - Fields to record (category, action, testCaseId, …).
 * @see {@link lib/__tests__/db/eventsData.test.js}
 */
export async function appendEvent(db, teamId, event) {
  if (!teamId) throw new ApiError(400, 'teamId required');
  await db.collection('events').insertOne({ teamId, ...event });
}

/**
 * Inserts multiple events via insertMany. No-op when events is empty.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {object[]} events
 * @see {@link lib/__tests__/db/eventsData.test.js}
 */
export async function appendEvents(db, teamId, events) {
  if (!teamId) throw new ApiError(400, 'teamId required');
  if (!events.length) return;
  const docs = events.map((e) => ({ teamId, ...e }));
  await db.collection('events').insertMany(docs);
}

/**
 * Fans out one assignment event per testCaseId via insertMany.
 * No-op when testCaseIds is empty.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {{ action: string, testCaseIds: string[], assignmentId: string, assignedTo: string, by: string, at: Date }} opts
 * @see {@link lib/__tests__/db/eventsData.test.js}
 */
export async function appendAssignmentEvents(
  db,
  teamId,
  { action, testCaseIds, assignmentId, assignedTo, by, at },
) {
  if (!teamId) throw new ApiError(400, 'teamId required');
  if (!testCaseIds.length) return;
  const docs = testCaseIds.map((testCaseId) => ({
    teamId,
    category: AUDIT_CATEGORY.ASSIGNMENT,
    action,
    testCaseId,
    externalId: null,
    status: null,
    softwareVersionTested: null,
    notes: null,
    assignmentId,
    assignedTo,
    by,
    at,
  }));
  await db.collection('events').insertMany(docs);
}

/**
 * Returns all events for a team, optionally scoped to one testCaseId,
 * sorted newest-first.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {{ testCaseId?: string }} opts
 * @returns {Promise<object[]>}
 * @see {@link lib/__tests__/db/eventsData.test.js}
 */
export async function listEvents(db, teamId, { testCaseId } = {}) {
  if (!teamId) throw new ApiError(400, 'teamId required');
  const query = { teamId };
  if (testCaseId) query.testCaseId = testCaseId;
  const docs = await db
    .collection('events')
    .find(query)
    .sort({ at: -1 })
    .toArray();
  return docs.map(toClientDoc);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/__tests__/db/eventsData.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/db/eventsData.js lib/__tests__/db/eventsData.test.js
git commit -m "RXR-11849: add events data-layer module (renamed from resultEvents)"
```

---

## Task 3: Migrate `testCasesData.js` to the new module + collection

**Files:**
- Modify: `lib/db/testCasesData.js:10` (import), `:305` (call site unchanged name → `appendEvent`), `:339` (`resetTeamData` collection name)
- Modify: `lib/__tests__/db/testCasesData.test.js` (stub `collections.events`, the `resultEventsCol` stub name, and assertions)

- [ ] **Step 1: Update the test stubs first (red)**

In `lib/__tests__/db/testCasesData.test.js`, replace every occurrence of the string `resultEvents` with `events`. This covers: the comment (lines ~17–18), the stub variable `resultEventsCol` → `eventsCol` and its `if (name === 'resultEvents') return resultEventsCol` guard → `if (name === 'events') return eventsCol`, and all `collections.resultEvents` assertions. Use a single find-replace of `resultEvents` → `events` within this file, then rename the local variable `eventsCol` consistently.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/db/testCasesData.test.js`
Expected: FAIL — production code still imports `appendResultEvent` from `@/lib/db/resultEventsData` and `resetTeamData` still deletes from `collections.resultEvents` (now unstubbed), so reset/result assertions fail.

- [ ] **Step 3: Update the production module**

In `lib/db/testCasesData.js`:

Line 10 — change the import:

```js
import { appendEvent } from '@/lib/db/eventsData';
```

Line ~305 — change the call from `appendResultEvent` to `appendEvent` (payload unchanged):

```js
    await appendEvent(db, teamId, {
      category: AUDIT_CATEGORY.RESULT,
      action: statusToAction(update.status),
      testCaseId: id,
      externalId: existing?.testCaseId ?? null,
      status: update.status,
      softwareVersionTested: existing?.softwareVersionTested ?? null,
      notes,
      assignmentId: null,
      assignedTo: null,
      by: actor ?? null,
      at: update.updatedAt,
    });
```

In `resetTeamData` (lines ~330–349) — rename the destructured binding and the collection, keeping the return-key name aligned. Replace the `resultEvents` binding, the `db.collection('resultEvents')` call, and the `resultEvents:` return key:

```js
  const [
    testCases,
    testRuns,
    modules,
    applications,
    assignments,
    events,
  ] = await Promise.all([
    db.collection('testCases').deleteMany({ teamId }),
    db.collection('testRuns').deleteMany({ teamId }),
    db.collection('modules').deleteMany({ teamId }),
    db.collection('applications').deleteMany({ teamId }),
    db.collection('assignments').deleteMany({ teamId }),
    db.collection('events').deleteMany({ teamId }),
  ]);

  return {
    testCases: testCases.deletedCount,
    testRuns: testRuns.deletedCount,
    modules: modules.deletedCount,
    applications: applications.deletedCount,
    assignments: assignments.deletedCount,
    events: events.deletedCount,
  };
```

> Note: the `resetTeamData` `deleteMany({ teamId })` over `events` still purges ALL of a team's events (including never-purge categories). That is correct — "reset team data" is a deliberate full wipe of the team's data, distinct from the per-release cascade added in Phase 2. The return key rename `resultEvents` → `events` must match the Step-1 test assertion.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/__tests__/db/testCasesData.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/db/testCasesData.js lib/__tests__/db/testCasesData.test.js
git commit -m "RXR-11849: migrate testCasesData to events module and collection"
```

---

## Task 4: Migrate `testCasesBulkData.js` to the new module

**Files:**
- Modify: `lib/db/testCasesBulkData.js:9` (import) and `:166` (call name)
- Modify: `lib/__tests__/db/testCasesBulkData.test.js` (stub `collections.events`, assertions)

- [ ] **Step 1: Update the test stubs first (red)**

In `lib/__tests__/db/testCasesBulkData.test.js`, replace every `resultEvents` with `events` (the comment on line ~47, the `collections.resultEvents = {` stub on line ~80, and the `collections.resultEvents.insertMany` assertions).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/db/testCasesBulkData.test.js`
Expected: FAIL — production still imports `appendResultEvents` from `@/lib/db/resultEventsData`; the `appendResultEvents` call writes to the (now-unstubbed) `resultEvents` collection, so insertMany assertions on `collections.events` fail.

- [ ] **Step 3: Update the production module**

In `lib/db/testCasesBulkData.js`:

Line 9 — change the import:

```js
import { appendEvents } from '@/lib/db/eventsData';
```

Line ~166 — change the call name (payload unchanged):

```js
    await appendEvents(db, teamId, events);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/__tests__/db/testCasesBulkData.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/db/testCasesBulkData.js lib/__tests__/db/testCasesBulkData.test.js
git commit -m "RXR-11849: migrate testCasesBulkData to events module"
```

---

## Task 5: Migrate `assignmentsData.js` to the new module

**Files:**
- Modify: `lib/db/assignmentsData.js:8` (import path only — function name `appendAssignmentEvents` is unchanged)
- Modify: `lib/__tests__/db/assignmentsData.test.js` (stub `collections.events`, assertions)

- [ ] **Step 1: Update the test stubs first (red)**

In `lib/__tests__/db/assignmentsData.test.js`, replace every `resultEvents` with `events` (the stub setup and the `insertMany` call assertions, lines ~173–281).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/db/assignmentsData.test.js`
Expected: FAIL — production still imports from `@/lib/db/resultEventsData` and writes to the `resultEvents` collection; assertions on `collections.events` fail.

- [ ] **Step 3: Update the production module**

In `lib/db/assignmentsData.js`, line 8 — change only the import path:

```js
import { appendAssignmentEvents } from '@/lib/db/eventsData';
```

The two call sites (lines ~247, ~312) need no change — the function name is unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/__tests__/db/assignmentsData.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/db/assignmentsData.js lib/__tests__/db/assignmentsData.test.js
git commit -m "RXR-11849: point assignmentsData at events module"
```

---

## Task 6: Rename the collection in indexes and delete the old module

**Files:**
- Modify: `lib/indexes.js:162-164` (two `createIndex` calls on `resultEvents`)
- Delete: `lib/db/resultEventsData.js`
- Delete: `lib/__tests__/db/resultEventsData.test.js`

- [ ] **Step 1: Update the index collection name**

In `lib/indexes.js`, replace the two `resultEvents` index lines (~162–164) with:

```js
  await db
    .collection('events')
    .createIndex({ teamId: 1, testCaseId: 1, at: -1 });
  await db.collection('events').createIndex({ teamId: 1, at: -1 });
```

- [ ] **Step 2: Delete the old module and its test**

```bash
git rm lib/db/resultEventsData.js lib/__tests__/db/resultEventsData.test.js
```

- [ ] **Step 3: Verify no stale references remain**

Run: `git grep -n "resultEvents\|appendResultEvent\|appendResultEvents\|listResultEvents" -- "*.js" "*.jsx"`
Expected: NO matches in `lib/`, `app/`, `hooks/`, `components/`, `utils/`. (Doc/spec references in `docs/` and `README.md`/`SKILL.md` are handled in Task 8.) If any `.js`/`.jsx` match remains, fix it before proceeding.

- [ ] **Step 4: Run the full unit suite**

Run: `npx vitest run`
Expected: PASS — entire suite green; no module-resolution errors for `resultEventsData`.

- [ ] **Step 5: Commit**

```bash
git add lib/indexes.js
git commit -m "RXR-11849: rename resultEvents collection to events; drop old module"
```

---

## Task 7: Verify route-level integration tests still pass

The routes that emit events (`test-cases/[id]`, `test-cases-bulk`, `assignments`, `assignments/[id]`, `test-cases/reset-team`) are exercised by their own test files and by the cross-team isolation suite. This task confirms the rename did not break any integration-level expectation.

**Files:** none modified — verification only. (If a route test references the `resultEvents` collection name directly, fix it here.)

- [ ] **Step 1: Search route/integration tests for the old name**

Run: `git grep -ln "resultEvents" -- "*.test.js" "*.test.jsx"`
Expected: NO matches. If a match appears (e.g. an isolation or route test), replace `resultEvents` → `events` in that file.

- [ ] **Step 2: Run the full suite**

Run: `npx vitest run`
Expected: PASS — all unit and route/integration tests green.

- [ ] **Step 3: Commit (only if a test file was changed)**

```bash
git add -A
git commit -m "RXR-11849: update remaining tests to events collection name"
```

If Step 1 found nothing, skip the commit.

---

## Task 8: Update docs that name the collection

**Files:**
- Modify: `README.md` (line ~109 — `resultEvents` collection mention)
- Modify: `.claude/skills/smoke-test/SKILL.md` (line ~383 — `resultEvents` collection mention)

> Project rule: "when adding, changing, or removing a feature that affects routes, role gating, mutations, exports, or polling, update `.claude/skills/smoke-test/SKILL.md` in the same commit." The collection rename touches mutation storage, so the smoke-test doc must reflect the new name.

- [ ] **Step 1: Update README**

In `README.md`, change the `resultEvents` collection reference (line ~109) to `events`. Read the surrounding sentence first and adjust wording so it still reads correctly (e.g. "the append-only `events` collection records …"). Keep it to the existing one-line style — do not expand (project rule: do not bloat README).

- [ ] **Step 2: Update the smoke-test skill doc**

In `.claude/skills/smoke-test/SKILL.md`, change the `resultEvents` reference (line ~383) to `events`, adjusting surrounding wording to stay accurate.

- [ ] **Step 3: Confirm no `.js`/`.jsx`/doc references to the old name remain**

Run: `git grep -n "resultEvents" -- "*.js" "*.jsx" "README.md" ".claude/skills/smoke-test/SKILL.md"`
Expected: NO matches. (Historical references inside `docs/superpowers/specs/` design docs may remain — those are point-in-time records and are out of scope.)

- [ ] **Step 4: Commit**

```bash
git add README.md .claude/skills/smoke-test/SKILL.md
git commit -m "RXR-11849: update docs to events collection name"
```

---

## Task 9: Final lint and full-suite gate

**Files:** any auto-fixable formatting touched by the rename.

- [ ] **Step 1: Lint (once, at the end — project rule)**

Run: `npm run lint:fix`
Expected: completes with no remaining errors. (Pre-existing jscpd "clone" warnings in unrelated files — dashboard charts, user dialogs, testCases schemas — are not introduced by this phase and are not blockers.)

- [ ] **Step 2: Run the full unit suite one more time**

Run: `npx vitest run`
Expected: PASS — entire suite green.

- [ ] **Step 3: Commit any lint fixes**

```bash
git add -A
git commit -m "RXR-11849: lint fixes for events rename"
```

If `npm run lint:fix` changed nothing, skip this commit.

---

## Self-Review (completed during planning)

- **Spec coverage (Phase 1 slice):** Decision #2 (single `events` collection, clean-slate rename of helpers) → Tasks 2–6. The "say _events_, not _result events_" naming intent (spec §1) → Tasks 2–8. The 9-category taxonomy + classification lists that §2/§3/§5 depend on → Task 1. Remaining spec sections (new emissions, cascade, read surface, beacon, auth hooks, isolation across new categories) are explicitly deferred to Phases 2–4 and listed in the roadmap below.
- **Placeholder scan:** none — every code step shows complete code or an exact, located edit.
- **Type/name consistency:** helper names (`appendEvent`, `appendEvents`, `appendAssignmentEvents`, `listEvents`), collection name (`events`), and constant names (`AUDIT_CATEGORY.*`, `AUDIT_ACTION.*`, `PER_CASE_CATEGORIES`, `CASCADE_CATEGORIES`) are used identically across Tasks 1–9. `resetTeamData`'s return key was deliberately renamed `resultEvents` → `events` and the test assertion updated to match (Task 3).

---

## Roadmap — subsequent phases (separate plans)

Each builds on this foundation and ships green on its own:

- **Phase 2 — Complete entity coverage + cascade.** Add the currently-missing emissions: `TEST_CASE/create` (thread `actor` through `POST /api/test-cases`), `TEST_CASE/edit` on non-status patches (single + bulk), `RESULT` fan-out for imported completed rows and `restoreVersion` overwrites, `RELEASE/delete|complete|restore`, `ASSIGNMENT` on `updateAssignment` (add `actor` param + route plumbing), and a `reset` summary for `resetTeamData`. Add `deleteEventsForVersion(db, teamId, version)` to `eventsData.js` (scoped to `CASCADE_CATEGORIES`) and call it from `deleteVersion`. Entity event payloads reuse the existing `softwareVersionTested` field for the version dimension — no parallel `version` field is added, and the per-event `environment` field is deferred until the companion Releases × Environments model lands (spec Decision #15).
- **Phase 3 — Account/system events.** `AUTH/login` via NextAuth `authorize()`; `AUTH/logout` via a NextAuth `events.signOut` hook (and the `TopNav` logout button); `USER/create|update|role-change`; `CONFIG/settings-update` and `CONFIG/module-create` (thread actor through routes); `EXPORT/excel` server-side in `getExportData`'s route; `EXPORT/pdf` via a new `POST /api/events` beacon route (category-restricted) plus a `lib/api/events.js` helper and a `post('/api/events', …, { silentFailure: true })` call wired into `useDownloadTestRunReport`.
- **Phase 4 — Per-case History read surface.** `GET /api/test-cases/[id]/events?env=…` route + `listEvents` extension to scope by `version` + env filter (`environment === env` OR env-agnostic) restricted to `PER_CASE_CATEGORIES`; a lazy-loaded "History" `<Card>` section in `TestCaseDetail.jsx` (actor · local-time · action · before→after derived from the preceding event); plus the cross-team isolation suite extended to assert team A cannot read team B's events across all categories.

---

**Dependency note for Phase 4:** the env-scoped read surface (spec §6) assumes events carry an `environment` field and that the companion Releases × Environments spec's environment model is implemented. Confirm that dependency is in place before starting Phase 4; if environment is not yet a first-class field, Phase 4 must either land after it or scope by `version` only as an interim.
