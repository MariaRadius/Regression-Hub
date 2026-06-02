# Eliminate `caseId` — `_id`-based FK + field renames

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the `caseId` field entirely; use the test case's MongoDB `_id` (stored as `tcId` on referencing documents) as the FK in `testResults`, `assignments`, and `events`; rename the user-entered label field from `testCaseId` to `externalCaseId`; ensure `createTestCase` mints a `testKey` for display and import dedup.

**Architecture:** Extract a shared `mintTestKey` atomic helper for display-key generation; replace every `caseId` FK with `tcId` (= `tc._id.toString()`) across the DB layer, API routes, schemas, and client components; rename `testCaseId` → `externalCaseId` on `testCases` documents and all callers; drop `caseId` from all insert documents and queries.

**Tech Stack:** Node.js, MongoDB (native driver), Next.js App Router, Zod, Vitest

---

## Background — what each name meant and what it becomes

| Field | Location | Was | After this plan |
|---|---|---|---|
| `_id` | `testCases` | MongoDB document row identity | unchanged |
| `caseId` | `testCases`, `testResults`, `assignments`, `events` | opaque `ObjectId().toString()` — lineage FK | **eliminated** |
| `testKey` | `testCases` only | `"AAA-0001"` human label + import dedup key | unchanged — stays on `testCases` for display and import identity only |
| `tcId` | `testResults`, `assignments`, `events` | _(new)_ | the test case's `_id` as a string — the FK that replaces `caseId` |
| `testCaseId` | `testCases` | user-entered external label (e.g. `"TC-001"`) | **renamed to `externalCaseId`** |

### Why `_id` not `testKey` as FK

`testKey` is the human identifier and import key — it lives only on `testCases`. Using it as a cross-collection FK couples the import identity scheme to result storage. `_id` is simpler: it is already the authoritative identity for a specific test case document. When a release is cloned, new documents with new `_id`s are created; `generateDenseResults` creates fresh result rows for those new `_id`s automatically.

### Why `externalCaseId` not `testCaseId`

The `testCaseId` name collided with `testCaseId` on `events` documents (where it holds the MongoDB `_id`, not a user label). Renaming to `externalCaseId` eliminates the collision and makes the field's purpose self-documenting.

**Note:** `testCaseId` on `events` documents (holding the MongoDB `_id` value of the test case) is a separate field — it is **not** renamed.

---

## File map

| File | Change |
|---|---|
| `lib/db/sequences.js` | **new** — `mintTestKey(db, appId, initial, opts?)` atomic helper; `formatTestKey(initial, serial)` shared formatter |
| `lib/db/testCasesData.js` | `createTestCase` mints `testKey`; `resolveAssignees` queries by `tcId`; `deleteTestCase` cascades by `tcId`; `testCaseId` → `externalCaseId` in `PATCH_ALLOWED_FIELDS`, insert doc, projection, and audit event |
| `lib/db/testResultsData.js` | `caseId` param/field → `tcId`; composite key `(teamId, releaseId, tcId, environment)`; `testCases` lookup uses `_id` |
| `lib/db/assignmentsData.js` | `caseId`/`caseIds` → `tcId`/`tcIds` everywhere |
| `lib/db/eventsData.js` | `caseId`/`caseIds` → `tcId`/`tcIds` on event documents (leave `testCaseId` field untouched — that's the events' own `_id`-holding field) |
| `lib/db/releasesData.js` | clone passes new `_id`s (not `caseId`s) to `generateDenseResults`; `addEnvironment` projects `_id` |
| `lib/db/importExcelData.js` | `existingCaseId` → `existingTcId` on resolved rows; import `formatTestKey` from `lib/db/sequences.js`; remove `caseId` from insert docs; update `commitImport` tracking maps |
| `lib/schemas/results.js` | `caseId` → `tcId`; `caseIds` → `tcIds` |
| `lib/schemas/assignments.js` | `caseId` → `tcId` |
| `lib/schemas/import.js` | `caseId` → `tcId` on resolved-row schema |
| `lib/schemas/testCases.js` | `testCaseId` → `externalCaseId` |
| `lib/indexes.js` | add compound index on `testResults(teamId, releaseId, tcId, environment)` and `testCases(teamId, testKey)` |
| `app/api/releases/[id]/results/route.js` | `caseId`/`caseIds` → `tcId`/`tcIds` in request parsing and downstream calls |
| `app/api/releases/[id]/test-cases/[caseId]/route.js` | rename destructured param `caseId` → `tcId` (URL segment folder name stays) |
| `lib/api/releases.js` | rename param `caseId` → `tcId` in JSDoc + function signatures |
| `utils/pdf/reportTables.js` | `t.testCaseId` → `t.externalCaseId` |
| `app/(app)/test-cases/master-detail/TestCaseDetailPanel.jsx` | `caseId` → `tcId` in `listResults` call + result matching |
| `app/(app)/test-cases/master-detail/bulk/BulkModalRenderer.jsx` | `caseId: c.caseId` → `tcId: c._id` |
| `app/(app)/test-cases/master-detail/bulk/BulkModalShell.jsx` | `s.testKey \|\| s.caseId \|\| '—'` → `s.testKey \|\| '—'` |
| `app/(app)/test-cases/master-detail/bulk/BulkReassignModal.jsx` | `caseIds` → `tcIds` |
| `app/(app)/test-cases/master-detail/bulk/BulkPendingModal.jsx` | `caseIds` → `tcIds` |
| `app/(app)/test-cases/master-detail/bulk/BulkFailModal.jsx` | `caseIds` → `tcIds` |
| `app/(app)/test-cases/master-detail/bulk/BulkPassModal.jsx` | `caseIds` → `tcIds` |
| `app/(app)/assignments/AssignmentsClient.jsx` | `form.caseId` / `caseIds` → `form.tcId` / `tcIds` |
| `components/ImportConfirmationDialog.jsx` | remove `r.caseId` fallback from `key` prop |
| `lib/__tests__/db/sequences.test.js` | **new** — unit tests for `mintTestKey` |
| `lib/__tests__/db/assignmentsData.test.js` | `caseId` → `tcId` throughout |
| `lib/__tests__/db/eventsData.test.js` | `caseId` → `tcId` throughout |
| `lib/__tests__/db/importExcelData.test.js` | `caseId` → `tcId` throughout |
| `lib/__tests__/db/analyseImport.test.js` | `caseId` → `tcId` in fixture data |
| `lib/__tests__/db/testCasesData.test.js` | `testCaseId` → `externalCaseId` in fixtures; `caseId` → `tcId` where used as FK |
| `lib/__tests__/isolation/crossTeam.test.js` | `caseId` → `tcId` throughout |
| `lib/__tests__/schemas/results.test.js` | `caseId` → `tcId` |
| `app/api/assignments/__tests__/route.test.js` | `caseIds` → `tcIds` |
| `app/api/releases/[id]/results/__tests__/route.test.js` | `caseId`/`caseIds` → `tcId`/`tcIds` |
| `README.md` | update field names |
| `.claude/skills/smoke-test/SKILL.md` | update field names |

---

## Task 1 — Shared sequences util (`lib/db/sequences.js`)

**Files:**
- Create: `lib/db/sequences.js`
- Create: `lib/__tests__/db/sequences.test.js`

**Context:** `formatTestKey` is currently defined locally in `importExcelData.js`. Move it to a shared module and add `mintTestKey` — an atomic single-record helper used by `createTestCase`. The bulk import path keeps its pre-loaded sequence approach for performance; it will import `formatTestKey` from this module.

- [ ] **Step 1: Write the failing test**

```js
// lib/__tests__/db/sequences.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { mintTestKey, formatTestKey } from '../../db/sequences.js';

function makeDb() {
  const store = new Map();
  return {
    collection: () => ({
      findOneAndUpdate: async (filter, update) => {
        const id = filter._id;
        const cur = store.get(id)?.nextSerial ?? 0;
        const next = cur + update.$inc.nextSerial;
        store.set(id, { nextSerial: next });
        return { nextSerial: next };
      },
    }),
  };
}

describe('formatTestKey', () => {
  it('pads serial to 4 digits', () => {
    expect(formatTestKey('SAP', 1)).toBe('SAP-0001');
    expect(formatTestKey('SAP', 42)).toBe('SAP-0042');
    expect(formatTestKey('SAP', 1000)).toBe('SAP-1000');
  });
  it('throws when initial is falsy', () => {
    expect(() => formatTestKey('', 1)).toThrow('application initial');
  });
});

describe('mintTestKey', () => {
  it('returns APP-0001 on first call', async () => {
    expect(await mintTestKey(makeDb(), 'app-1', 'APP')).toBe('APP-0001');
  });
  it('increments on successive calls to the same app', async () => {
    const db = makeDb();
    await mintTestKey(db, 'app-1', 'APP');
    expect(await mintTestKey(db, 'app-1', 'APP')).toBe('APP-0002');
  });
  it('sequences are independent per applicationId', async () => {
    const db = makeDb();
    expect(await mintTestKey(db, 'app-1', 'AAA')).toBe('AAA-0001');
    expect(await mintTestKey(db, 'app-2', 'BBB')).toBe('BBB-0001');
  });
  it('throws when initial is falsy', async () => {
    await expect(mintTestKey(makeDb(), 'app-1', '')).rejects.toThrow('application initial');
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run lib/__tests__/db/sequences.test.js
```
Expected: FAIL — module not found.

- [ ] **Step 3: Create `lib/db/sequences.js`**

```js
/**
 * @param {string} initial
 * @param {number} serial
 * @returns {string}
 */
export function formatTestKey(initial, serial) {
  if (!initial) throw new Error('Cannot build a testKey without an application initial');
  return `${initial}-${String(serial).padStart(4, '0')}`;
}

/**
 * Atomically increments the sequence for `applicationId` and returns the
 * next formatted testKey. Use for single-record creation; the bulk import
 * path pre-loads sequences for performance and uses formatTestKey directly.
 *
 * @param {import('mongodb').Db} db
 * @param {string} applicationId
 * @param {string} initial - 3-char application initial
 * @param {{ session?: import('mongodb').ClientSession }} [opts]
 * @returns {Promise<string>}
 */
export async function mintTestKey(db, applicationId, initial, opts = {}) {
  if (!initial) throw new Error('Cannot mint a testKey without an application initial');
  const result = await db.collection('sequences').findOneAndUpdate(
    { _id: applicationId },
    { $inc: { nextSerial: 1 } },
    { upsert: true, returnDocument: 'after', session: opts.session },
  );
  return formatTestKey(initial, result.nextSerial);
}
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
npx vitest run lib/__tests__/db/sequences.test.js
```
Expected: PASS (8 tests).

- [ ] **Step 5: Update `importExcelData.js` to import `formatTestKey` from the new module**

In `lib/db/importExcelData.js`:
- Add at the top: `import { formatTestKey } from './sequences.js';`
- Delete the local `formatTestKey` function definition.

- [ ] **Step 6: Confirm existing import tests still pass**

```bash
npx vitest run lib/__tests__/db/importExcelData.test.js
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/db/sequences.js lib/__tests__/db/sequences.test.js lib/db/importExcelData.js
git commit -m "RXR-XXXX: extract formatTestKey/mintTestKey to lib/db/sequences.js"
```

---

## Task 2 — `createTestCase` mints `testKey`; rename `testCaseId` → `externalCaseId`

**Files:**
- Modify: `lib/db/testCasesData.js`
- Modify: `lib/schemas/testCases.js`
- Modify: `utils/pdf/reportTables.js`
- Modify: `lib/__tests__/db/testCasesData.test.js`

**Context:** Two independent changes in one task because they both touch `testCasesData.js`:
1. `createTestCase` gains `testKey` minting when `applicationId` resolves an `initial`.
2. The user-entered label field `testCaseId` is renamed to `externalCaseId` throughout `testCases` documents and all callers. **Do not rename** the `testCaseId` field on `events` documents — that field holds the MongoDB `_id` and is unrelated.

- [ ] **Step 1: Add failing tests for both changes**

In `lib/__tests__/db/testCasesData.test.js`:

```js
// In the createTestCase describe block:
it('mints a testKey when applicationId resolves an initial', async () => {
  await db.collection('applications').insertOne({
    _id: new ObjectId(APP_ID),
    teamId: TEAM_ID,
    name: 'Test App',
    initial: 'TST',
  });
  const result = await createTestCase(db, TEAM_ID, RELEASE_ID, {
    applicationId: APP_ID,
    testCase: 'My new case',
  });
  const doc = await db.collection('testCases').findOne({ _id: new ObjectId(result.id) });
  expect(doc.testKey).toMatch(/^TST-\d{4}$/);
});

it('creates without testKey when applicationId is absent', async () => {
  const result = await createTestCase(db, TEAM_ID, RELEASE_ID, { testCase: 'No app' });
  const doc = await db.collection('testCases').findOne({ _id: new ObjectId(result.id) });
  expect(doc.testKey).toBeFalsy();
});

// In the updateTestCase describe block — update existing fixture:
// Change all occurrences of testCaseId: 'TC-001' to externalCaseId: 'TC-001'
// Change all occurrences of testCaseId: undefined to externalCaseId: undefined
// Line 590: 'sets externalId=null when existing.testCaseId is absent'
//   → 'sets externalId=null when existing.externalCaseId is absent'
// Line 591: existingNoExternal = { ...EXISTING, testCaseId: undefined }
//   → existingNoExternal = { ...EXISTING, externalCaseId: undefined }
```

Adjust `APP_ID`, `TEAM_ID`, `RELEASE_ID` to match constants already used in the file.

- [ ] **Step 2: Run to confirm the new tests fail**

```bash
npx vitest run lib/__tests__/db/testCasesData.test.js
```
Expected: new tests FAIL; existing tests PASS.

- [ ] **Step 3: Update `lib/schemas/testCases.js`**

Rename the `testCaseId` field to `externalCaseId` in both the create-body schema and the document shape schema.

- [ ] **Step 4: Update `lib/db/testCasesData.js`**

**testCaseId → externalCaseId:**
- `PATCH_ALLOWED_FIELDS`: `'testCaseId'` → `'externalCaseId'`
- `createTestCase` insert doc: `testCaseId: fields.testCaseId || ''` → `externalCaseId: fields.externalCaseId || ''`
- `updateTestCase` projection: `{ testCaseId: 1, ... }` → `{ externalCaseId: 1, ... }`
- `updateTestCase` audit event: `externalId: existing?.testCaseId ?? null` → `externalId: existing?.externalCaseId ?? null`

**testKey minting — add imports at top of file:**
```js
import { mintTestKey } from './sequences.js';
import { idQuery } from './idQuery.js';
```

**Inside `createTestCase`, before `insertOne`:**
```js
let testKey;
if (fields.applicationId) {
  const app = await db
    .collection('applications')
    .findOne(idQuery(fields.applicationId), { projection: { initial: 1 } });
  if (app?.initial) {
    testKey = await mintTestKey(db, fields.applicationId, app.initial);
  }
}
```

**Add `testKey` to the inserted document** (alongside other fields):
```js
...(testKey ? { testKey } : {}),
```

- [ ] **Step 5: Update `utils/pdf/reportTables.js`**

```js
// Before:
t.testCaseId ? `${t.testCaseId} — ${t.testCase || ''}` : t.testCase || '—',
// After:
t.externalCaseId ? `${t.externalCaseId} — ${t.testCase || ''}` : t.testCase || '—',
```

- [ ] **Step 6: Run all tests for this task**

```bash
npx vitest run lib/__tests__/db/testCasesData.test.js
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/db/testCasesData.js lib/schemas/testCases.js utils/pdf/reportTables.js \
  lib/__tests__/db/testCasesData.test.js
git commit -m "RXR-XXXX: createTestCase mints testKey; rename testCaseId -> externalCaseId"
```

---

## Task 3 — `testResultsData.js`: `caseId` → `tcId` (MongoDB `_id` string)

**Files:**
- Modify: `lib/db/testResultsData.js`
- Modify: `lib/schemas/results.js`
- Modify: `app/api/releases/[id]/results/route.js`
- Modify: `lib/__tests__/schemas/results.test.js`
- Modify: `app/api/releases/[id]/results/__tests__/route.test.js`

**Context:** `testResults` documents store `caseId` as the FK back to a test case. Replace with `tcId` = the test case's MongoDB `_id` as a string. The composite key becomes `(teamId, releaseId, tcId, environment)`. The `testCases` lookup inside `recordResult` (R21 expectedResult guard) changes from `{ caseId, releaseId, teamId }` to `idQuery(tcId)` — no need for `releaseId` since `_id` is already unique to one document.

- [ ] **Step 1: Update `lib/schemas/results.js`**

```js
// Single-result POST body:
caseId: z.string().min(1),   →   tcId: z.string().min(1),

// Bulk POST body:
caseIds: z.array(z.string().min(1)).min(1),   →   tcIds: z.array(z.string().min(1)).min(1),

// Result document shape:
caseId: z.string(),   →   tcId: z.string(),
```

- [ ] **Step 2: Update `lib/db/testResultsData.js`**

Rename throughout:
- `generateDenseResults(db, teamId, releaseId, caseIds, session)` → `generateDenseResults(db, teamId, releaseId, tcIds, session)`
- `for (const caseId of caseIds)` → `for (const tcId of tcIds)`
- Inserted document field: `caseId,` → `tcId,`
- `recordResult(db, teamId, releaseId, caseId, environment, payload, opts)` → `...tcId...`
- All internal uses of the `caseId` variable → `tcId`
- `testCases` lookup (R21 guard, line ~188):

```js
// Before:
const testCase = await db.collection('testCases')
  .findOne({ caseId, releaseId, teamId }, { projection: { expectedResult: 1 } });

// After (import idQuery at top of file):
import { idQuery } from './idQuery.js';
...
const testCase = await db.collection('testCases')
  .findOne({ ...idQuery(tcId), teamId }, { projection: { expectedResult: 1 } });
```

- `testResults` updateOne filter: `{ teamId, releaseId, caseId, environment }` → `{ teamId, releaseId, tcId, environment }`
- Audit event: `caseId,` → `tcId,`
- `bulkRecordResult` entries param: `{ caseId: string, ... }[]` → `{ tcId: string, ... }[]`; destructure `{ tcId, ...payload }`

- [ ] **Step 3: Update `app/api/releases/[id]/results/route.js`**

- Single-result POST: parse `tcId` from body; pass `tcId` to `recordResult`
- Bulk POST: parse `tcIds` from body; map `tcIds.map((tcId) => ({ tcId, ... }))` for `bulkRecordResult`

- [ ] **Step 4: Update test files**

`lib/__tests__/schemas/results.test.js`: replace `caseId: 'case-1'` → `tcId: 'abc123'`, `caseIds: [...]` → `tcIds: [...]`.

`app/api/releases/[id]/results/__tests__/route.test.js`: replace `caseId`/`caseIds` → `tcId`/`tcIds` in all request bodies and assertions.

- [ ] **Step 5: Run the affected tests**

```bash
npx vitest run lib/__tests__/schemas/results.test.js "app/api/releases/[id]/results/__tests__/route.test.js"
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/db/testResultsData.js lib/schemas/results.js \
  app/api/releases/[id]/results/route.js \
  lib/__tests__/schemas/results.test.js \
  "app/api/releases/[id]/results/__tests__/route.test.js"
git commit -m "RXR-XXXX: testResults composite key uses tcId (MongoDB _id) instead of caseId"
```

---

## Task 4 — `assignmentsData.js` + `eventsData.js`: `caseId` → `tcId`

**Files:**
- Modify: `lib/db/assignmentsData.js`
- Modify: `lib/db/eventsData.js`
- Modify: `lib/schemas/assignments.js`
- Modify: `lib/__tests__/db/assignmentsData.test.js`
- Modify: `lib/__tests__/db/eventsData.test.js`
- Modify: `app/api/assignments/__tests__/route.test.js`

**Context:** `assignments` documents store `caseId` as the FK. `events` documents store a `caseId` (singular, for result/test-case events) and `caseIds[]` (fan-out for assignment events). All rename to `tcId`/`tcIds`. **Leave the `testCaseId` field on events untouched** — that field holds the MongoDB `_id` of the test case and is a separate concern indexed by `{ teamId, testCaseId, at }`.

- [ ] **Step 1: Update `lib/schemas/assignments.js`**

```js
caseId: z.string().min(1),   →   tcId: z.string().min(1),
// (and document shape)
caseId: z.string(),          →   tcId: z.string(),
```

- [ ] **Step 2: Update `lib/db/assignmentsData.js`**

Rename throughout:
- `resolveAssignees`: `caseId: { $in: caseIds }` → `tcId: { $in: tcIds }`; param `caseIds` → `tcIds`; map keys `envMap[doc.caseId]` → `envMap[doc.tcId]`; `sentinelMap[doc.caseId]` → `sentinelMap[doc.tcId]`
- `listAssignments` `$lookup` pipeline: `let: { cid: '$caseId', rid: '$releaseId' }` → `{ cid: '$tcId', rid: '$releaseId' }`; join condition `{ $eq: ['$tcId', '$$cid'] }` (update both the `let` variable and the `$eq` reference on `testCases`)
- `getEffectiveAssignment`: param `{ releaseId, caseId, environment }` → `{ releaseId, tcId, environment }`; guard `if (!caseId)` → `if (!tcId)`; all queries use `tcId`
- `createAssignment`: `caseIds` → `tcIds`; `docs = tcIds.map((tcId) => ({ teamId, releaseId, tcId, ... }))`; validation message; audit fan-out: `tcIds.map((tcId, i) => ...)`; event field `caseId,` → `tcId,`
- `deleteAssignment`: `caseIds: [assignment.caseId]` → `tcIds: [assignment.tcId]`

- [ ] **Step 3: Update `lib/db/eventsData.js`**

- `appendAssignmentEvents`: `{ action, caseIds, ... }` → `{ action, tcIds, ... }`; guard `if (!caseIds.length)` → `if (!tcIds.length)`; `docs = tcIds.map((tcId) => ({ ..., tcId, ... }))`
- `listEvents`: `{ caseId, releaseId }` → `{ tcId, releaseId }`; filter `if (caseId) query.caseId = caseId` → `if (tcId) query.tcId = tcId`

- [ ] **Step 4: Update `lib/__tests__/db/eventsData.test.js`**

Replace every `caseId: 'case-X'` → `tcId: 'abc00X'`; `caseIds: [...]` → `tcIds: [...]`; all assertions `d.caseId` → `d.tcId`.

- [ ] **Step 5: Update `lib/__tests__/db/assignmentsData.test.js`**

- Rename `CASE_ID` constant → `TC_ID`, value stays a valid ID string
- Replace all `caseId`/`caseIds` in fixture data and assertions with `tcId`/`tcIds`
- `expect(docs[0].caseId).toBe(...)` → `expect(docs[0].tcId).toBe(...)`

- [ ] **Step 6: Update `app/api/assignments/__tests__/route.test.js`**

```js
// Before:
caseIds: ['1', '2'],
// After:
tcIds: ['abc001', 'abc002'],
```

- [ ] **Step 7: Run tests**

```bash
npx vitest run lib/__tests__/db/assignmentsData.test.js lib/__tests__/db/eventsData.test.js app/api/assignments/__tests__/route.test.js
```
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/db/assignmentsData.js lib/db/eventsData.js lib/schemas/assignments.js \
  lib/__tests__/db/assignmentsData.test.js lib/__tests__/db/eventsData.test.js \
  app/api/assignments/__tests__/route.test.js
git commit -m "RXR-XXXX: assignments and events use tcId (MongoDB _id) instead of caseId"
```

---

## Task 5 — `testCasesData.js`: cascade + `resolveAssignees` use `tcId`

**Files:**
- Modify: `lib/db/testCasesData.js`

**Context:** `resolveAssignees` queries `assignments` by `caseId` — now queries by `tcId`. `deleteTestCase` reads `tc.caseId` to cascade-delete — now reads `tc._id.toString()` (no stored `tcId` field needed on the test case document itself; use the document's own `_id`). Audit events emitted by `deleteTestCase` that carry `caseId:` switch to `tcId:`.

- [ ] **Step 1: Update `resolveAssignees`**

The function is called with an array of IDs to resolve assignees for. The IDs are now the test cases' `_id` strings:

```js
// Before:
async function resolveAssignees(db, teamId, releaseId, environment, caseIds) {
  if (!caseIds.length) return {};
  const docs = await db.collection('assignments').find({
    teamId, releaseId,
    caseId: { $in: caseIds },
    ...
  }).toArray();
  ...
  return Object.fromEntries(caseIds.map((id) => [id, envMap[id] ?? sentinelMap[id] ?? null]));
}

// After:
async function resolveAssignees(db, teamId, releaseId, environment, tcIds) {
  if (!tcIds.length) return {};
  const docs = await db.collection('assignments').find({
    teamId, releaseId,
    tcId: { $in: tcIds },
    ...
  }).toArray();
  const envMap = {};
  const sentinelMap = {};
  for (const doc of docs) {
    if (!envMap[doc.tcId]) envMap[doc.tcId] = doc.assignedTo;
    if (!sentinelMap[doc.tcId]) sentinelMap[doc.tcId] = doc.assignedTo;
  }
  return Object.fromEntries(tcIds.map((id) => [id, envMap[id] ?? sentinelMap[id] ?? null]));
}
```

- [ ] **Step 2: Update `listTestCases` call to `resolveAssignees`**

Where `listTestCases` builds the IDs to pass to `resolveAssignees`, change from `tc.caseId` to `tc._id.toString()`. The returned assignee map is then looked up by `tc._id.toString()` when decorating each result.

- [ ] **Step 3: Update `deleteTestCase`**

```js
// Before:
let caseId;
...
caseId = tc.caseId;
await db.collection('testResults').deleteMany({ teamId, caseId }, { session });
await db.collection('assignments').deleteMany({ teamId, caseId }, { session });
if (caseId) {
  await appendEvent(db, teamId, { ..., caseId, ... });
}

// After:
const tcId = tc._id.toString();
await db.collection('testResults').deleteMany({ teamId, tcId }, { session });
await db.collection('assignments').deleteMany({ teamId, tcId }, { session });
await appendEvent(db, teamId, { ..., tcId, ... });
```

(Remove the `if (caseId)` guard — `tcId` is always present.)

- [ ] **Step 4: Update any `appendEvent` calls in `updateTestCase`**

Find `appendEvent` calls that carry a `caseId:` field (the lineage identifier, not the MongoDB `_id`-holding `testCaseId:` field on events). Rename those occurrences to `tcId:`.

- [ ] **Step 5: Run tests**

```bash
npx vitest run lib/__tests__/db/testCasesData.test.js
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/db/testCasesData.js
git commit -m "RXR-XXXX: testCasesData cascade and resolveAssignees use tcId (_id string)"
```

---

## Task 6 — `releasesData.js`: clone + `addEnvironment`

**Files:**
- Modify: `lib/db/releasesData.js`
- Modify: `lib/__tests__/db/releasesData.test.js`

**Context:** The clone block and `addEnvironment` block both produce arrays of IDs to pass to `generateDenseResults`. After the rename, these arrays contain `_id` strings (`tcId`s) of the newly created (or existing) test case documents — not `caseId` strings.

- [ ] **Step 1: Update the clone block**

```js
// Before:
let caseIds = [];
if (sourceCases.length > 0) {
  const newCaseDocs = sourceCases.map(({ _id, releaseId: _src, createdAt: _ca, updatedAt: _ua, ...rest }) => ({
    ...rest, releaseId, createdAt: now2, updatedAt: now2,
  }));
  await db.collection('testCases').insertMany(newCaseDocs, { session });
  caseIds = sourceCases.map((tc) => tc.caseId);
  if (caseIds.length > 0) {
    await generateDenseResults(db, teamId, releaseId, caseIds, session);
  }
}

// After — use the NEW _id values from insertMany:
let tcIds = [];
if (sourceCases.length > 0) {
  const newCaseDocs = sourceCases.map(({ _id, releaseId: _src, createdAt: _ca, updatedAt: _ua, ...rest }) => ({
    ...rest, releaseId, createdAt: now2, updatedAt: now2,
  }));
  const insertResult = await db.collection('testCases').insertMany(newCaseDocs, { session });
  tcIds = Object.values(insertResult.insertedIds).map((id) => id.toString());
  if (tcIds.length > 0) {
    await generateDenseResults(db, teamId, releaseId, tcIds, session);
  }
}
```

- [ ] **Step 2: Update the `addEnvironment` block**

```js
// Before:
const existingCases = await db.collection('testCases')
  .find({ teamId, releaseId }, { projection: { caseId: 1 }, session }).toArray();
const caseIds = existingCases.map((tc) => tc.caseId).filter(Boolean);
if (caseIds.length > 0) {
  const resultDocs = caseIds.map((caseId) => ({
    teamId, releaseId, caseId, environment: normEnv, ...
  }));
  await db.collection('testResults').insertMany(resultDocs, { ordered: false, session });
}

// After:
const existingCases = await db.collection('testCases')
  .find({ teamId, releaseId }, { projection: { _id: 1 }, session }).toArray();
const tcIds = existingCases.map((tc) => tc._id.toString());
if (tcIds.length > 0) {
  await generateDenseResults(db, teamId, releaseId, tcIds, session);
}
```

Note: the inline `resultDocs.map` is replaced by `generateDenseResults` (which already does the same thing and now uses `tcId`).

- [ ] **Step 3: Update `caseId: null` in `appendEvent` calls**

Search `releasesData.js` for `caseId: null` in `appendEvent` calls. Rename to `tcId: null`.

- [ ] **Step 4: Run tests**

```bash
npx vitest run lib/__tests__/db/releasesData.test.js
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/db/releasesData.js lib/__tests__/db/releasesData.test.js
git commit -m "RXR-XXXX: releasesData clone and addEnvironment use tcId (_id) for result generation"
```

---

## Task 7 — `importExcelData.js`: remove `caseId`, rename `existingCaseId` → `existingTcId`

**Files:**
- Modify: `lib/db/importExcelData.js`
- Modify: `lib/schemas/import.js`
- Modify: `lib/__tests__/db/importExcelData.test.js`
- Modify: `lib/__tests__/db/analyseImport.test.js`
- Modify: `lib/__tests__/isolation/crossTeam.test.js`

**Context:** The import path generates `caseId` as a stable lineage identifier and stores it on `testCases` documents. After this task, the import path no longer generates or stores `caseId`. Instead:

- `existingCaseId` on resolved rows → `existingTcId` (the `_id` of an already-existing test case document for this lineage in any release)
- `inReleaseCaseIds` set → `inReleaseTcIds`
- `fpToCaseId` map → `fpToTcId`
- `inheritedTestKey` map (caseId → { testKey, createdAt }) — this becomes `fpToTestKey` (fingerprint key → testKey), since we need to inherit `testKey` across releases when the same fingerprint appears again
- `newCaseIds` array → `newTcIds` (populated from `insertResult.insertedIds` after `bulkWrite`)
- Insert documents have no `caseId` field
- Update filter: `{ caseId, releaseId, teamId }` → `{ _id: new ObjectId(existingTcId), teamId }`
- `resultOps` filter: `{ teamId, releaseId, tcId, environment }`

The bulk insert still uses MongoDB's auto-generated `_id` (not explicit). After `bulkWrite`, extract `insertedIds` to get `tcIds` for `generateDenseResults`.

**Key change in `commitImport` flow:**

```
Before: resolve caseId → look up testKey from inheritedTestKey map → insert with both
After:  resolve existingTcId (the _id of the matched doc) → inherit testKey from that doc's testKey field → insert with just testKey (no caseId)
```

- [ ] **Step 1: Update `lib/schemas/import.js`**

```js
// Before:
// Present for update rows: the stable caseId being updated
caseId: z.string().optional(),

// After:
// Present for update rows: the MongoDB _id of the matched existing test case document
existingTcId: z.string().optional(),
```

- [ ] **Step 2: Update `resolveIdentities` in `lib/db/importExcelData.js`**

Every place that sets `existingCaseId` on a resolved row:
```js
// testKey match — matched.caseId → matched._id.toString()
existingCaseId = matched.caseId ?? null;
→
existingTcId = matched._id?.toString() ?? null;

// fingerprint match — fp.caseId → fp._id.toString()
existingCaseId = fp.caseId ?? null;
→
existingTcId = fp._id?.toString() ?? null;
```

Update projections in `byTestKey` and fingerprint lookups: remove `caseId: 1`; keep `testKey: 1`; ensure `_id: 1` is included (or omitted since `_id` is always returned by default).

- [ ] **Step 3: Update `commitImport` — lineage lookup block**

```js
// Before:
const existingCaseIds = [...new Set(resolvedRows.filter(...).map((x) => x.existingCaseId))];
const inReleaseCaseIds = new Set();
const inheritedTestKey = new Map(); // caseId -> { testKey, createdAt }

if (existingCaseIds.length) {
  const matchDocs = await db.collection('testCases')
    .find({ teamId, caseId: { $in: existingCaseIds } }, {
      projection: { caseId: 1, testKey: 1, releaseId: 1, createdAt: 1 },
      session,
    })
    .toArray();
  for (const d of matchDocs) {
    if (d.releaseId === releaseId) inReleaseCaseIds.add(d.caseId);
    const prev = inheritedTestKey.get(d.caseId);
    inheritedTestKey.set(d.caseId, { testKey, createdAt }); // newest-wins
  }
}

// After:
const existingTcIds = [...new Set(resolvedRows.filter(...).map((x) => x.existingTcId).filter(Boolean))];
const inReleaseTcIds = new Set();
const tcIdToTestKey = new Map(); // _id string -> testKey (for inheriting across releases)

if (existingTcIds.length) {
  const matchDocs = await db.collection('testCases')
    .find(
      { _id: { $in: existingTcIds.map((id) => new ObjectId(id)) } },
      { projection: { testKey: 1, releaseId: 1 }, session },
    )
    .toArray();
  for (const d of matchDocs) {
    if (d.releaseId === releaseId) inReleaseTcIds.add(d._id.toString());
    if (!tcIdToTestKey.has(d._id.toString())) {
      tcIdToTestKey.set(d._id.toString(), d.testKey);
    }
  }
}
```

- [ ] **Step 4: Update `commitImport` — `fpToCaseId` → `fpToTcId`**

```js
// Before:
const fpToCaseId = new Map(); // appName::modName::fp -> caseId

// After:
const fpToTcId = new Map(); // appName::modName::fp -> _id string
```

- [ ] **Step 5: Update `commitImport` — per-row resolution block**

```js
// Before:
let caseId = r.existingCaseId ?? null;
if (!caseId && r.action === 'update') {
  caseId = fpToCaseId.get(fpKey) ?? null;
}
if (caseId && inReleaseCaseIds.has(caseId)) {
  // update path
  caseOps.push({ updateOne: { filter: { caseId, releaseId, teamId }, update: { $set: definitionFields } } });
  fpToCaseId.set(fpKey, caseId);
} else {
  const isNewLineage = !caseId;
  if (isNewLineage) caseId = new ObjectId().toString();
  const testKey =
    inheritedTestKey.get(caseId)?.testKey ??
    formatTestKey(initial, takeSerial(applicationId));
  caseOps.push({ insertOne: { document: { ..., caseId, testKey, ... } } });
  newCaseIds.push(caseId);
  inReleaseCaseIds.add(caseId);
  inheritedTestKey.set(caseId, { testKey });
  fpToCaseId.set(fpKey, caseId);
}

// After:
let existingTcId = r.existingTcId ?? null;
if (!existingTcId && r.action === 'update') {
  existingTcId = fpToTcId.get(fpKey) ?? null;
}
if (existingTcId && inReleaseTcIds.has(existingTcId)) {
  // update path — test case doc already exists in this release
  caseOps.push({
    updateOne: {
      filter: { _id: new ObjectId(existingTcId), teamId },
      update: { $set: definitionFields },
    },
  });
  fpToTcId.set(fpKey, existingTcId);
} else {
  // insert path — new doc in this release (lineage may or may not exist elsewhere)
  const testKey =
    (existingTcId ? tcIdToTestKey.get(existingTcId) : null) ??
    formatTestKey(initial, takeSerial(applicationId));
  // No explicit _id — let MongoDB generate it; capture from insertResult after bulkWrite
  caseOps.push({ insertOne: { document: { teamId, releaseId, testKey, ...definitionFields, createdAt: now, updatedAt: now } } });
  pendingInsertFpKeys.push(fpKey); // track which ops are inserts for post-bulkWrite tcId capture
}
```

Note: after `bulkWrite`, extract the `insertedIds` from the result and associate them with the `fpKey`s tracked in `pendingInsertFpKeys`. Then call `generateDenseResults` with the new `_id` strings. Update `fpToTcId` with the new `_id`s.

- [ ] **Step 6: Update `commitImport` — post-bulkWrite**

```js
// After bulkWrite on testCases:
const insertedTcIds = Object.values(caseWriteResult.insertedIds ?? {}).map((id) => id.toString());
// Associate new _ids with their fpKeys:
pendingInsertFpKeys.forEach((fpKey, i) => fpToTcId.set(fpKey, insertedTcIds[i]));

const newTcIds = insertedTcIds;
if (newTcIds.length) {
  await generateDenseResults(db, teamId, releaseId, newTcIds, session);
}
```

- [ ] **Step 7: Update `resultOps` filter**

```js
// Before:
filter: { teamId, releaseId, caseId, environment },

// After — existingTcId is the _id of the test case being updated:
filter: { teamId, releaseId, tcId: existingTcId, environment },
```

- [ ] **Step 8: Update audit events in `importExcelData.js`**

All `appendEvent` calls that pass `caseId:` → `tcId:`. Use `existingTcId` (for updates) or the newly inserted `_id` (for inserts, captured from `insertedTcIds`).

- [ ] **Step 9: Update test files**

`lib/__tests__/db/importExcelData.test.js`:
- Seeded `testCases` docs: remove `caseId` field; add a `testKey` value if the test relies on import-identity matching
- Test uniqueness emulation comment: update `(teamId, releaseId, caseId, environment)` → `(teamId, releaseId, tcId, environment)`; update the dedup check `d.caseId === doc.caseId` → `d.tcId === doc.tcId`
- Assertions: `expect(tc.caseId).toBeTruthy()` → `expect(tc.testKey).toBeTruthy()` (since the lineage display identifier is now `testKey`)
- Assertions about uniqueness of lineage: check `testKey` values are unique across inserts

`lib/__tests__/db/analyseImport.test.js`: Remove `caseId:` from all seeded `testCases` fixture docs.

`lib/__tests__/isolation/crossTeam.test.js`:
- Rename `CASE_ID_A`/`CASE_ID_B` constants → `TEST_KEY_A`/`TEST_KEY_B` (values: `'TST-0001'`); seed docs use `testKey:` instead of `caseId:`
- Assertions checking cross-team isolation switch from `tc.caseId` to `tc.testKey`

- [ ] **Step 10: Run all import-related tests**

```bash
npx vitest run lib/__tests__/db/importExcelData.test.js lib/__tests__/db/analyseImport.test.js lib/__tests__/isolation/crossTeam.test.js
```
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add lib/db/importExcelData.js lib/schemas/import.js \
  lib/__tests__/db/importExcelData.test.js \
  lib/__tests__/db/analyseImport.test.js \
  lib/__tests__/isolation/crossTeam.test.js
git commit -m "RXR-XXXX: importExcelData uses tcId (_id) as FK; removes caseId from all write paths"
```

---

## Task 8 — API route cleanup + client components

**Files:**
- Modify: `app/api/releases/[id]/test-cases/[caseId]/route.js`
- Modify: `lib/api/releases.js`
- Modify: `app/api/releases/[id]/test-cases/[caseId]/__tests__/route.test.js`
- Modify: `app/(app)/test-cases/master-detail/TestCaseDetailPanel.jsx`
- Modify: `app/(app)/test-cases/master-detail/bulk/BulkModalRenderer.jsx`
- Modify: `app/(app)/test-cases/master-detail/bulk/BulkModalShell.jsx`
- Modify: `app/(app)/test-cases/master-detail/bulk/BulkReassignModal.jsx`
- Modify: `app/(app)/test-cases/master-detail/bulk/BulkPendingModal.jsx`
- Modify: `app/(app)/test-cases/master-detail/bulk/BulkFailModal.jsx`
- Modify: `app/(app)/test-cases/master-detail/bulk/BulkPassModal.jsx`
- Modify: `app/(app)/assignments/AssignmentsClient.jsx`
- Modify: `components/ImportConfirmationDialog.jsx`

- [ ] **Step 1: Update the `[caseId]` route handler**

In `app/api/releases/[id]/test-cases/[caseId]/route.js`, rename the destructured URL param in all three handlers:
```js
// Before:
const { caseId } = await params;
// After:
const { caseId: tcId } = await params;
```
Pass `tcId` to `getTestCase`, `updateTestCase`, `deleteTestCase`. Update JSDoc to note `tcId` is the MongoDB `_id`.

- [ ] **Step 2: Update `lib/api/releases.js`**

Rename param `caseId` → `tcId` in all three function signatures and their JSDoc `@param` lines. URL template strings use `tcId`:
```js
export function getTestCaseForRelease(releaseId, tcId, opts = {}) {
  return get(`/api/releases/${releaseId}/test-cases/${tcId}`, ...);
}
```
Grep for call-sites — they already pass `tc._id`, so only the parameter name changes.

- [ ] **Step 3: Update `TestCaseDetailPanel.jsx`**

```js
// Before:
const caseId = displayCase?.caseId ?? null;
if (!releaseId || !caseId || ...) { ... }
listResults(releaseId, { environment: env, caseId }).then(...)
result: rows.find((r) => r.caseId === caseId) ?? null
}, [releaseId, caseId, environments]);

// After:
const tcId = displayCase?._id ?? null;
if (!releaseId || !tcId || ...) { ... }
listResults(releaseId, { environment: env, tcId }).then(...)
result: rows.find((r) => r.tcId === tcId) ?? null
}, [releaseId, tcId, environments]);
```

- [ ] **Step 4: Update `BulkModalRenderer.jsx`**

```js
// Before:
caseId: c.caseId,
// After:
tcId: c._id,
```

- [ ] **Step 5: Update `BulkModalShell.jsx`**

```js
// Before:
{s.testKey || s.caseId || '—'}
// After:
{s.testKey || '—'}
```

- [ ] **Step 6: Update bulk-result modals**

In each of `BulkReassignModal.jsx`, `BulkPendingModal.jsx`, `BulkFailModal.jsx`, `BulkPassModal.jsx`:

```js
// Before:
caseIds: selection.map((s) => s.caseId),
// After:
tcIds: selection.map((s) => s.tcId),
```

(Selection items now carry `tcId` instead of `caseId`, set in `BulkModalRenderer` above.)

- [ ] **Step 7: Update `AssignmentsClient.jsx`**

```js
// form state:
// Before: caseId: ''
// After:  tcId: ''

// validation:
// Before: if (!form.caseId) { ... }
// After:  if (!form.tcId) { ... }

// POST body:
// Before: caseIds: [form.caseId],
// After:  tcIds: [form.tcId],

// select value:
// Before: value={form.caseId}
// After:  value={form.tcId}

// onChange:
// Before: const tc = testCases.find((c) => c.caseId === e.target.value);
//         setState({ ...form, caseId: e.target.value })
// After:  const tc = testCases.find((c) => c._id === e.target.value);
//         setState({ ...form, tcId: e.target.value })

// MenuItem:
// Before: <MenuItem key={tc.caseId} value={tc.caseId}>
// After:  <MenuItem key={tc._id} value={tc._id}>

// display fallback:
// Before: {a.caseName || a.caseId}
// After:  {a.caseName || a.testKey}
```

- [ ] **Step 8: Update `ImportConfirmationDialog.jsx`**

```js
// Before:
key={r.caseId ?? r.testKey ?? r.rowIndex}
// After:
key={r.testKey ?? r.rowIndex}
```

- [ ] **Step 9: Commit**

```bash
git add \
  "app/api/releases/[id]/test-cases/[caseId]/route.js" \
  "app/api/releases/[id]/test-cases/[caseId]/__tests__/route.test.js" \
  lib/api/releases.js \
  "app/(app)/test-cases/master-detail/TestCaseDetailPanel.jsx" \
  "app/(app)/test-cases/master-detail/bulk/BulkModalRenderer.jsx" \
  "app/(app)/test-cases/master-detail/bulk/BulkModalShell.jsx" \
  "app/(app)/test-cases/master-detail/bulk/BulkReassignModal.jsx" \
  "app/(app)/test-cases/master-detail/bulk/BulkPendingModal.jsx" \
  "app/(app)/test-cases/master-detail/bulk/BulkFailModal.jsx" \
  "app/(app)/test-cases/master-detail/bulk/BulkPassModal.jsx" \
  "app/(app)/assignments/AssignmentsClient.jsx" \
  components/ImportConfirmationDialog.jsx
git commit -m "RXR-XXXX: client components and routes use tcId (_id) and externalCaseId"
```

---

## Task 9 — Indexes

**Files:**
- Modify: `lib/indexes.js`

- [ ] **Step 1: Add indexes for new fields**

```js
// testResults lookup by composite key (recordResult, listResultsForRelease, getResultSummary)
await db
  .collection('testResults')
  .createIndex({ teamId: 1, releaseId: 1, tcId: 1, environment: 1 });

// testCases testKey lookup for import identity resolution
await db
  .collection('testCases')
  .createIndex({ teamId: 1, testKey: 1 });
```

- [ ] **Step 2: Add drop entries for any residual caseId-named indexes**

If `testResults` or `assignments` previously had a `caseId` index, add a `.dropIndex(...)` call before the create block (mirrors the pattern used for other legacy index drops at the top of the file). If none existed, skip this step.

- [ ] **Step 3: Commit**

```bash
git add lib/indexes.js
git commit -m "RXR-XXXX: add tcId and testKey compound indexes; drop caseId residue"
```

---

## Task 10 — Docs

**Files:**
- Modify: `README.md`
- Modify: `.claude/skills/smoke-test/SKILL.md`

- [ ] **Step 1: Update `README.md`**

- Line 64: `stable \`caseId\` (lineage across releases) and a DB-unique \`testKey\`` → `DB-unique \`testKey\` (display identifier, import dedup key); test cases are referenced across collections by their MongoDB \`_id\``
- Line 90: `Clone — copies test cases (same \`caseId\` lineage, fresh Pending results)` → `Clone — copies test cases with new \`_id\`s; fresh Pending results for each new \`_id\``
- Line 142: `audit log entries carry \`caseId\`` → `audit log entries carry \`tcId\``

- [ ] **Step 2: Update `.claude/skills/smoke-test/SKILL.md`**

Find: `Entries carry \`caseId\`, \`releaseId\`, \`environment\`, actor, and timestamp`
Replace: `Entries carry \`tcId\`, \`releaseId\`, \`environment\`, actor, and timestamp`

- [ ] **Step 3: Commit**

```bash
git add README.md .claude/skills/smoke-test/SKILL.md
git commit -m "RXR-XXXX: docs: caseId eliminated; _id (tcId) is cross-collection FK; externalCaseId replaces testCaseId"
```

---

## Task 11 — Full test run + lint

- [ ] **Step 1: Run the full test suite**

```bash
npx vitest run
```
Expected: PASS across all test files. Fix any remaining `caseId` references that surface as failures.

- [ ] **Step 2: Lint**

```bash
npm run lint:fix
```
Expected: no errors.

- [ ] **Step 3: Grep for remaining `caseId` references in source files**

```bash
grep -r "\bcaseId\b" \
  --include="*.js" --include="*.jsx" --include="*.ts" --include="*.tsx" \
  --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=docs \
  -l
```

Expected: only `app/api/releases/[id]/test-cases/[caseId]/route.js` (the directory name in the import path, not a code symbol). Any other file is a missed rename.

- [ ] **Step 4: Grep for `testCaseId` referencing the user-label field on `testCases` docs**

```bash
grep -rn "\.testCaseId\b\|testCaseId:" \
  --include="*.js" --include="*.jsx" \
  --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=docs \
  .
```

Expected: only occurrences that reference the `testCaseId` field on `events` documents (the MongoDB `_id`-holding field) — these are intentional and correct. Any reference to the `testCases` collection's user-label field is a missed rename.

- [ ] **Step 5: Final commit if any fixes needed**

```bash
git add -p
git commit -m "RXR-XXXX: fix remaining caseId/testCaseId references missed in prior tasks"
```

---

## Self-review checklist

- [x] `lib/db/sequences.js` — shared `mintTestKey` + `formatTestKey`
- [x] `createTestCase` — mints `testKey` when `applicationId` resolves an `initial`
- [x] `testResults` composite key — `(teamId, releaseId, tcId, environment)` where `tcId = tc._id.toString()`
- [x] `assignments` FK — `tcId`
- [x] `events` documents — `tcId`/`tcIds`; `testCaseId` on events (MongoDB `_id`-holding field) left untouched
- [x] `importExcelData` — no `caseId` in inserts; `existingTcId` on resolved rows; `tcIdToTestKey` map for testKey inheritance
- [x] `releasesData` clone — uses `insertResult.insertedIds` (new `_id`s) for `generateDenseResults`
- [x] `releasesData` addEnvironment — projects `_id`, passes `tcIds` to `generateDenseResults`
- [x] `testCaseId` → `externalCaseId` on `testCases` documents and all callers
- [x] All schemas updated
- [x] API routes updated; `[caseId]` URL param renamed to `tcId` internally
- [x] Client components use `tcId` (= `_id`) for results/assignments; `s.testKey` for display
- [x] Indexes added for `tcId` and `testKey`
- [x] Tests updated across all affected files
- [x] Docs updated (README + SKILL.md per project rule)
- [x] No `caseId` symbol remaining in `.js`/`.jsx` files except the URL-segment directory name
