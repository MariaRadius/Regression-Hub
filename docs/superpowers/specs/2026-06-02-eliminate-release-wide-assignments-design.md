# Eliminate Release-Wide Assignments — Design

**Jira:** RXR-11849
**Date:** 2026-06-02
**Status:** Approved (pending spec review)

## Problem

Assignments currently carry an `environment` field that may hold either a real
environment name (e.g. `QA`) or the sentinel `'__all__'`
(`ENVIRONMENT_SENTINEL`), the latter meaning a *release-wide* assignment that
applies to every environment in the release. This dual meaning complicates the
data layer (fan-out branches on the sentinel), the assignments UI (an extra
"Release-wide" scope), and the bulk-reassign path (which only ever creates
release-wide assignments).

## Goal

Every assignment is bound to **exactly one environment**. The
`ENVIRONMENT_SENTINEL` concept is removed entirely. `environment` becomes a
**required** field everywhere assignments are created, stored, listed, and
filtered. Existing `'__all__'` documents are migrated by a one-off script.

Non-goals: validating `environment` against the release's environment list
(out of scope; matches current behavior — `environment` is a free string).

## Changes by Unit

### 1. Constants & schema
- **`lib/constants.js`** — delete the `ENVIRONMENT_SENTINEL` export and its doc
  comment.
- **`lib/schemas/assignments.js`** — `environment` becomes
  `z.string().min(1)` (required; remove `.optional()`, the transform, and the
  sentinel default). Update the schema doc comment to drop release-wide
  language. `assignmentSchema.environment` stays `z.string()`.

### 2. Data layer — `lib/db/assignmentsData.js`
- **`createAssignment`** — require `environment`
  (`throw new ApiError(400, 'environment is required')` when falsy). Drop the
  `resolvedEnvironment`/sentinel fallback; store `environment` as given. The
  `testResults` mirror filter **always** includes `environment` (remove the
  "sentinel → all env rows" branch). Events carry the concrete `environment`.
- **`deleteAssignment`** — remove the sentinel branch; the `testResults` clear
  filter always includes the assignment's `environment`.
- Update JSDoc on both functions to drop sentinel scoping language.

### 3. Release clone — `lib/db/releasesData.js`
- In the carried-assignment `testResults` mirror loop, remove the
  `env !== ENVIRONMENT_SENTINEL` guard and the unused `ENVIRONMENT_SENTINEL`
  import — `environment` is always concrete.

### 4. Assignments page — `app/(app)/assignments/AssignmentsClient.jsx`
- Remove the "Release-wide" `ToggleButton` from **both** the scope filter and
  the create-form scope selector.
- Default the create form's `environment` to the first release environment
  (set on open, since `environments` comes from context).
- Delete `scopeLabel` and `matchesScope` sentinel handling: the scope filter
  becomes plain env-equality; the scope chip always shows the real env
  (filled/primary, drop the release-wide `default`/`outlined` variant).
- Remove the `ENVIRONMENT_SENTINEL` import and the
  `setScopeFilter(ENVIRONMENT_SENTINEL)` reset (default the filter to the first
  environment, or an "all environments" client-only filter token that is **not**
  the removed sentinel — decision: default to first environment for symmetry
  with the form).

### 5. Bulk reassign — `app/(app)/test-cases/master-detail/bulk/`
- **`BulkReassignModal.jsx`** — accept an `environment` prop and pass it to
  `createAssignment`. Update the "creates a release-wide assignment"
  comment/subtitle to environment-scoped language.
- **`BulkModalRenderer.jsx`** — forward the already-received `environment` prop
  to `BulkReassignModal` (currently only Pass/Fail/Pending get it).

### 6. Migration — `scripts/migrate-eliminate-release-wide-assignments.mjs`
- **Expand-per-environment** (chosen over delete): for each assignment with
  `environment === '__all__'`, look up its release's `environments[]` and
  replace the single doc with N docs (one per environment), preserving
  `tcId/releaseId/teamId/assignedTo/assignedBy/createdAt`. A single-environment
  release collapses to a rename. Assignments whose release is missing (orphans)
  are deleted.
- `testResults` need no change — release-wide assignments already mirrored
  `assignedTo` onto all environment rows.
- Idempotent (only touches `environment: '__all__'` docs) with `--dry-run`,
  matching `scripts/migrate-caseId-to-tcId.mjs` conventions (`.env.local` URI
  loader, `MongoClient`).

### 7. Docs (project rules require same-commit updates)
- **`README.md`** line ~136 — "Assign test cases to QA users; scope
  release-wide or to a specific environment" → "Assign test cases to QA users,
  scoped to a specific environment."
- **`.claude/skills/smoke-test/SKILL.md`** — no scope-specific assertion
  references release-wide; verify and leave unchanged unless a reference exists.

### 8. Tests
- Update `lib/__tests__/db/assignmentsData.test.js`: drop sentinel-scoped
  create/delete cases; ADD "missing environment → 400" and "env-scoped mirror
  only touches that env's results" assertions (user-approved).
- Update `lib/__tests__/isolation/crossTeam.test.js`: replace any sentinel use
  with a concrete environment.

## Risks & Verification

- **Build breakage from a stray `ENVIRONMENT_SENTINEL` reference.** Mitigation:
  a repo-wide grep for the symbol must return zero hits after the change; lint
  runs once at the end.
- **UI regression in the scope filter default.** Mitigation: manual smoke of
  `/assignments` (filter + create) and bulk reassign from `/test-cases`.
- **Migration correctness.** Mitigation: `--dry-run` first; verify counts
  (N `__all__` docs → sum of release env counts).

## Implementation Strategy

Parallel multi-agent development (file-disjoint slices) followed by a parallel
review pass, per `superpowers:dispatching-parallel-agents`. Slices: (A)
constants+schema, (B) data layer + clone, (C) assignments UI, (D) bulk reassign,
(E) migration script, (F) docs + tests. Orchestrator integrates, runs the
sentinel grep, then `npm run lint:fix` and the test suite once at the end.
