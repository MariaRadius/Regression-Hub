# Eliminate the `assignments` Collection — Design

**Jira:** RXR-11849 (new branch)
**Date:** 2026-06-02
**Status:** Approved (pending spec review)

> **Supersedes** §2 and §3.4 of `2026-06-02-test-results-as-source-of-truth-design.md`:
> that spec kept `assignments` as an append-only audit log mirrored onto the live
> store. This design removes the collection entirely. The live assignee already
> lives on `testResults.assignedTo`; assignment **history** moves to the existing
> `events` log. Path-agnostic where the codebase is mid-refactor; concrete file
> names are given where they are stable today.

## Problem

Assignment state is written in two places: `testResults.assignedTo` (the live,
per-environment store the listing reads) **and** a row in the `assignments`
collection (intended as history). The `events` collection **already** records
ASSIGN/UNASSIGN entries, so `assignments` is a redundant third copy that also
drags along indexes, cascade-delete logic in release clone/delete and test-case
delete, a release-wide migration script, two API routes, and a management page.

Separately, the only way to assign in bulk today is selection-dependent
(`BulkReassignModal` acts on checked rows), and assignment management lives on a
dedicated `/assignments` tab that duplicates state now owned by `testResults`.

## Goals

1. **Drop the `assignments` collection** and every read/write/index/cascade that
   touches it. Live assignee = `testResults.assignedTo`; history = `events`.
2. **Reassign-only, latest-wins.** No unassign/clear path or UI. `assignedTo:
   null` survives only as the dense-seed initial state (so the listing's
   "unassigned" filter still matches never-assigned rows).
3. **Remove the `/assignments` route** and its nav entry. Drop the list, scope
   filter, and unassign UI.
4. **Two bulk-assign modals in `/test-cases`:**
   - **Reassign** (existing `BulkReassignModal`) — selection-based, active
     environment, trimmed to assignee-only.
   - **Bulk Assign** (new) — selection-independent, scoped By Application / By
     Module, with per-item case counts and an Active / All-environments target.

Non-goals: changing result-recording validation; re-deriving assignee at read
time (it is read straight from `testResults`); validating `environment` against
the release's declared list (free string, matches current behavior).

## Target Model

| Collection    | Owns                                                                 | Key                                            |
| ------------- | -------------------------------------------------------------------- | ---------------------------------------------- |
| `testCases`   | Definition only (content, app/module, priority, jira, traceability). | `tcId` (`_id`) per release                     |
| `testResults` | Execution state incl. **`assignedTo`** (live assignee).              | `(teamId, releaseId, tcId, environment)`       |
| `events`      | **Sole** assignment history (ASSIGN entries) + other audit entries.  | append-only; cascade-deleted with its entity   |

There is **no** `assignments` collection.

## Changes by Unit

### 1. Data layer — `lib/db/assignmentsData.js`
- Collapse to a single export `assignTestCases(db, teamId, body, { assignedBy })`
  where `body = { releaseId, assignedTo, tcIds?, applicationIds?, moduleIds?,
  environments }`.
  - Validate: `teamId`, `releaseId`, `assignedTo`, non-empty `environments`, and
    at least one of `tcIds` / `applicationIds` / `moduleIds` (else `ApiError(400)`).
  - **Resolve scope → tcId set:** start from `tcIds`; if `applicationIds` or
    `moduleIds` are present, query `testCases` for `{ teamId, releaseId,
    applicationId ∈ … } ∪ { …, moduleId ∈ … }`, project `_id`, union and dedupe.
  - **Mirror:** `testResults.updateMany({ teamId, releaseId, tcId: { $in: set },
    environment: { $in: environments } }, { $set: { assignedTo } })`.
  - **History:** append one ASSIGN event per `(tcId, environment)` carrying
    `assignedTo` and `by: assignedBy`.
  - Return `{ ok: true, testCaseCount: set.length }`.
- **Delete** `listAssignments` and `deleteAssignment` (no consumers after the
  page and unassign path are removed).

### 2. Schema — `lib/schemas/assignments.js`
- `createAssignmentBodySchema` → `{ releaseId: objectIdString, assignedTo:
  z.string().min(1), tcIds?: z.array(z.string().min(1)), applicationIds?:
  z.array(z.string().min(1)), moduleIds?: z.array(z.string().min(1)),
  environments: z.array(z.string().min(1)).min(1) }` with a `.refine` requiring
  ≥1 of the three scope arrays.
- `createAssignmentResponseSchema` → `{ ok: z.literal(true), testCaseCount:
  z.number() }` (drop `id`).
- **Delete** `deleteAssignmentBodySchema`, `assignmentSchema`,
  `assignmentsListSchema`.

### 3. API routes
- `app/api/assignments/route.js` — keep `POST` only, re-pointed to
  `assignTestCases`; response shape `{ ok, testCaseCount }`. **Delete** the `GET`
  handler.
- **Delete** `app/api/assignments/[id]/route.js` (the whole `[id]` folder).

### 4. Client API — `lib/api/assignments.js`
- Keep `createAssignment(body)` (passthrough; new response schema). **Delete**
  `listAssignments` and `deleteAssignment`.

### 5. New counts endpoint — `GET /api/releases/[id]/scope-counts`
- Returns `{ byApplication: { [appId]: n }, byModule: { [moduleId]: n } }` from a
  `testCases` aggregation grouped per `applicationId` and per `moduleId` for the
  release (env-independent — definition counts). Backs the Bulk Assign picker.
- Query extracted to `lib/db/...Data.js` (no inline query in the route).

### 6. Cascade cleanup — `lib/db/releasesData.js`, `lib/db/testCasesData.js`
- Remove every `db.collection('assignments')` read/delete in release clone,
  release delete, and test-case delete paths (and the now-unused imports).
- **Cascade-delete `events`** for the removed entity: on release delete, delete
  events scoped to `{ teamId, releaseId }`; on test-case delete, `{ teamId, tcId }`.
  `testResults` cleanup is unchanged.
- **Spec-review flag:** cascade deletes the entity's **entire** event trail (all
  categories), not just ASSIGNMENT — broader than the old assignment-doc cascade.
  Confirm at review; narrow to `category: ASSIGNMENT` if undesired.
- Release clone no longer carries assignment docs; carried assignees (if any) are
  already handled by the `testResults` mirror per the source-of-truth spec.

### 7. Indexes — `lib/indexes.js`
- Drop the three `assignments` indexes (the `teamId/createdAt` and the two
  scoped ones). No new index required (writes hit existing `testResults`/`events`
  indexes).

### 8. Migrations — `scripts/`
- **Delete** `migrate-eliminate-release-wide-assignments.mjs` (release-wide is moot).
- **Add** `migrate-drop-assignments-collection.mjs`: clean-slate
  `db.collection('assignments').drop()` (idempotent — ignore "ns not found"),
  `--dry-run`, `.env.local` URI loader, matching existing migration conventions.
  No backfill into `events`.

### 9. Remove the page — `app/(app)/assignments/`
- Delete `page.js`, `AssignmentsClient.jsx`, `error.js`, `loading.js`.
- Remove the `/assignments` nav link in `components/TopNav.jsx`.

### 10. Reassign modal — `app/(app)/test-cases/master-detail/bulk/BulkReassignModal.jsx`
- Trim to **assignee-only**: remove Priority, Title, Due Date, Notes fields and
  the `PRIORITIES` import (they were collected but never persisted).
- Send `{ tcIds, releaseId, assignedTo, environments: [environment] }`.
- Reword title/subtitle/helper to "Reassign" (selection-scoped, active env).

### 11. New Bulk Assign modal — `app/(app)/test-cases/master-detail/bulk/BulkAssignModal.jsx`
- Selection-independent. Fields:
  - **Scope type** — exclusive `ToggleButtonGroup`: By Application / By Module
    (switching clears the picked items).
  - **Items** — multi-select checkbox list of the active type (from the page's
    `applications` / `modules` props) with a **per-item case-count badge** from
    `scope-counts`; live footer total.
  - **Assignee** — required select (`useQaUserList`).
  - **Environment** — exclusive `ToggleButtonGroup`: `Active (<env>)` / `All
    environments`, mapped to the `environments` array (`[active]` or all release
    envs).
  - **Confirm** disabled until ≥1 item and an assignee are chosen.
- MUI `Dialog` reusing the theme variants used by `BulkModalShell`
  (`panelTitle`, `metricLabel`, `mono`, `tableCell`) for visual cohesion; its own
  shell (no selection-summary box). Visual design: see the companion mockup.

### 12. Entry point — `app/(app)/test-cases/master-detail/FilterStrip.jsx`
- Add a **`Bulk Assign`** button (admin-only via a passed `isAdmin`/`user.role`)
  on the saved-view row, right-aligned, always enabled regardless of selection.
- `BulkModalRenderer` / `TestCasesClient` wire the new modal open-state and the
  `scope-counts` fetch.

### 13. Docs (same-commit, per project rules)
- `README.md` (~line 136) — drop release-wide/assignments-tab language; describe
  bulk assign from `/test-cases`.
- `.claude/skills/smoke-test/SKILL.md` — remove `/assignments` route checks; add
  Bulk Assign / Reassign mutation + admin-gating assertions; route/mutation
  surface changed.

### 14. Tests (confirm before adding/changing, per standing preference)
- Data: scope expansion (app/module → tcId union + dedup), multi-env mirror,
  empty-scope → 400, response shape.
- Cascade: release/case delete removes the scoped `events`.
- Remove obsolete `assignments`-collection tests
  (`lib/__tests__/db/assignmentsData.test.js` create/delete cases, the route
  tests under `app/api/assignments/**`, and the crossTeam isolation cases that
  asserted on the collection).

## Risks & Verification
- **Stray `assignments` reference breaks build.** Repo-wide grep for
  `collection('assignments')`, `listAssignments`, `deleteAssignment`,
  `assignmentSchema` must return zero non-doc hits after the change; lint once at
  the end.
- **Over-broad event cascade.** See §6 flag — confirm category scope at review.
- **Bulk Assign blast radius.** Per-item counts + footer total surface the case
  count before confirm; All-environments multiplies affected `testResults` rows
  (not docs) by the env count.
- **Manual smoke:** Reassign from a selection; Bulk Assign By Application and By
  Module, Active vs All env; verify the listing assignee updates for the active
  environment; delete a release/case and confirm its events are gone.

## Implementation Strategy
Parallel multi-agent development on file-disjoint slices, then a parallel review
pass (per `superpowers:dispatching-parallel-agents`): (A) data layer + schema +
routes + client API, (B) cascades + indexes + migrations, (C) page removal + nav,
(D) Reassign trim, (E) Bulk Assign modal + FilterStrip + counts wiring, (F) docs +
tests. Orchestrator integrates, runs the `assignments` grep, then `npm run
lint:fix` and the suite once at the end.
