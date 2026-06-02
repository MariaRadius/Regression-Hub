# Design Spec: `testResults` as the Single Source of Truth for Execution State

**Date:** 2026-06-02
**Jira:** RXR-11849
**Status:** Design — approved decisions captured.

> This spec is intentionally **path-agnostic**. The application is mid-refactor and file
> locations are in flux, so the design is expressed in terms of collections, fields,
> behaviors, and capabilities — not filenames, function names, or line numbers.
>
> Merges two prior drafts: (a) making the test-case listing status environment-aware via a
> `testResults` join, and (b) wiring assignee through `testResults` into the listing. Both
> touched the same surface from different angles; this unifies them and extends to the full
> clean-slate the directive requires.

---

## 1. Context & Problem

The product separates **test-case definitions** from **per-environment execution state**:

- **Definitions** live in the `testCases` collection — one document per release × case.
- **Execution state** lives in the `testResults` collection — one row per
  `(teamId, releaseId, tcId, environment)`, pre-created dense as `Pending` for every
  declared environment and mutated when a tester records a result.

The bug: execution-state fields (`status`, `testedBy`, `testedOn`, `notes`, and the
assignee) are **also** stored on, written to, and read from `testCases`. As a result:

- The test-case **listing** reads status/tester off the definition document and **ignores
  the selected environment** — so the list status dot, tester label, status filter, and the
  detail-drawer header buttons never change when the environment selector changes.
- Reassigning a case never appears in the listing, because assignment creation writes only
  to the historical `assignments` log and never to the live store; the helper meant to
  resolve assignees was never wired in.
- Dashboard and applications metrics aggregate the stale definition-level status.

The only correct per-environment reader today is the detail drawer's
"Results by Environment" grid — which is exactly why it visibly disagrees with the list dot.

### Root-cause directive

> The fields `status`, `testedBy`, `testedOn`, `notes`, `assignee` MUST NOT live in the
> `testCases` collection — they MUST live in the `testResults` collection. The `assignments`
> collection is **only** the historical record. The listing and the drawer must use
> `testResults` for assignee info. Clean-slate, no legacy, clean as you go, remove
> redundancies; new code should be clean and idiomatic, not patchy.

### Intended outcome

`testResults` becomes the authoritative store for execution state, keyed per environment.
`testCases` holds **definition only**. Every reader — listing, drawer header, dashboard,
reports/PDF exports — derives execution state from `testResults` for the active
`(release, environment)`. `assignments` stays an append-only audit log whose latest entry is
mirrored onto the live store.

---

## 2. Target Model

| Collection    | Owns                                                                                                                                             | Key                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `testCases`   | Definition only: content, identity (`testKey`, `externalCaseId`), application/module, priority, jira story, type, traceability, expected result. | `tcId` (the `testCases` MongoDB `_id`) = per-release document; `testKey` = cross-release lineage id |
| `testResults` | Execution state: `status`, `testedBy`, `testedOn`, `notes`, **`assignedTo`**; references its case by `tcId`.                                     | `(teamId, releaseId, tcId, environment)`                                                            |
| `assignments` | Historical audit log of assignment/unassignment events only                                                                                      | append-only                                                                                         |

**Join:** `testResults.tcId` ↔ `testCases.tcId` (the `testCases` `_id`), filtered to the active `environment`. `testKey` remains the cross-release lineage id on `testCases` but is **not** the result→case link.

---

## 2a. Relationship to the `eliminate-caseId` plan

Builds on top of `docs/superpowers/plans/2026-06-02-eliminate-caseId.md` — a complementary
layer. `eliminate-caseId` is the mechanical FK/rename refactor (drops `caseId`, uses the
`_id` as `tcId`, `testCaseId`→`externalCaseId`, mints `testKey`); it does not move execution
state. This spec moves execution state off `testCases` onto `testResults`. Terminology
(`tcId`, `testKey`, `externalCaseId`) is inherited from it.

- **Ordering (agreed):** `eliminate-caseId` lands **first**; this spec builds on `tcId`.
- **Supersession (agreed):** `eliminate-caseId` Task 5 rewrites `resolveAssignees`; this spec
  **deletes** it (D5) — assignee lives on `testResults`, resolved by the listing join. Do
  **not** re-add the helper.

---

## 3. Design

Each subsection carries its approved decision tag (D1–D6) where applicable.

### 3.1 Execution-state ownership moves to `testResults` (D6)

- The dense result generator seeds every row with `assignedTo: null` alongside
  `status: Pending`, `testedBy/testedOn/notes: null`. Any other path that seeds result rows
  (e.g. adding an environment to a release) seeds the same shape.
- Creating a case writes **definition only** — no status/tester/tested-on/notes. After the
  definition is inserted, dense `Pending` result rows are fanned out for all of the release's
  environments. (**D6** — create previously did **not** fan out, despite docs claiming it
  did, leaving a new case with no rows to join against, assign, or record results on.)
- Editing a case patches **definition fields only**. The status-transition rules
  (expected-result-required-for-Pass/Fail, notes-required-for-Fail, reason-required-for-reset)
  and the result audit event are owned exclusively by the result-recording path, which already
  enforces them — removed from the edit path. Blank-guards on core definition content
  (test-case body, expected result) remain.
- The case-edit input schema no longer declares execution fields (status, tested-on); anything
  that slips through is dropped. The create schema declares none.
- The Excel import already conforms: it writes execution state
  (`status`/`testedBy`/`testedOn`/`notes`) **only** to `testResults`, keyed
  `(teamId, releaseId, tcId, environment)` and only when a row carries a status; definition
  documents receive definition fields only, and `assignedTo` is never written by import (the
  dense generator seeds it). No import change required.

### 3.2 Listing — environment-aware (D1)

The listing always runs within a `(release, environment)` context (rejected without an
environment). It:

1. Matches `testCases` on definition filters only (team, release, application, module,
   priority, jira story).
2. Joins each case to its single `testResults` row for the active environment (`testResults.tcId` ↔ `testCases.tcId`).
3. Overlays execution state onto each case (missing-row defaults: see §4).
4. Applies the **status**, **tester**, and **assignee** filters against the overlaid values (including the "unassigned" sentinel).
5. Sorts and paginates over the joined, filtered set; the total reflects that set.

The join runs **before** pagination — required so status/tester/assignee filtering, sorting,
and total counts all operate on the joined per-environment values; a post-pagination merge
would compute wrong totals and break the filters.

Because each returned row carries the overlaid execution state, all list consumers — status
dot, assignee label, tested-by label, client-side stats/rollups — work unchanged.

### 3.3 Single-case fetch & drawer header — environment-aware

Fetching one case for a `(release, environment)` overlays that environment's result row so the
drawer header's Pass/Fail/Pending active state is per-environment and agrees with the "Results
by Environment" grid. The drawer's post-mutation refresh carries the active environment. The
per-environment grid is already correct and unchanged.

### 3.4 Assignments — mirror to the live store; history append-only (D4, D5)

- **On assign (D5):** after appending the audit event(s), the assignee is mirrored onto the
  matching `testResults` rows (multi-scope targeting in §4). Latest write wins.
- **On unassign (D4):** after appending the audit event, the affected `testResults` rows have
  `assignedTo` cleared to null. No read-time re-derivation.
- The read-time effective-assignment resolver and the never-wired bulk resolver are removed;
  the live assignee is read directly from `testResults`. (See §2a — do not re-add when layering
  on `eliminate-caseId`.)

### 3.5 Release clone hygiene

Cloning a release strips execution fields from cloned definition documents (no legacy
contamination). When assignment history is carried forward, after dense results are generated
the carried assignees are mirrored onto the new release's result rows (same scoping as a fresh
assignment), so carried assignments remain visible.

### 3.6 Dashboard metrics (D2)

The dashboard re-points from definition-level status to `testResults`, **scoped to the selected
`(release, environment)`**, joining back to `testCases` for application/module grouping; tester
rollups group on the result-level tester.

- **Live surface is the server RSC path** — the dashboard renders server-side from a cached,
  team-scoped aggregation over `testCases.status`; the orphaned client-fetch component and the
  `applicationId`-only API route are **dead** (no import site / inverted from the prior draft's
  assumption that "the client path holds it"). The dead client-fetch component is removed
  (clean-slate); the dashboard stays an async RSC, consistent with the "no client-side page
  fetch" rule.
- **Threading (release, environment) (decided):** the active pair is carried as **URL search
  params** read server-side from the RSC's `searchParams`; the client syncs the sessionStorage
  working context into the URL. Because the page is refreshed/re-queried per selection, it
  carries `export const dynamic = 'force-dynamic'`, and mutations affecting it revalidate per
  the cache rules.
- **Default when no selection (decided):** when the params are absent, the server resolves to
  the **latest release and its default environment** and scopes to that combo (rather than an
  empty state or an unscoped team-wide total).
- **Applications metrics (decided):** there is **no applications page** and the unused
  application-rollup query is dead code; it is **deleted** rather than rewired. D2 collapses to
  dashboard-only. The dashboard's own per-application/module grouping already covers the need.
- The pre-existing unscoped, cross-release server computation is reconciled to this scoped path.

### 3.7 Reports / exports (D3)

The export currently filters result rows by an application field they don't carry and reads
application/module ids that are always absent — a pre-existing bug. Fix: source execution state
(status, tester, tested-on, notes) from `testResults` for the selected `(release, environment)`
and join `testCases` for definition fields (title, key, application, module, steps, expected
result, etc.). The on-screen report and the PDF then render correctly with no rendering-logic
changes.

### 3.8 Indexing

- Drop the definition-collection indexes on the execution fields (status, tester).
- Add to `testResults`: a **unique** index on `(teamId, releaseId, tcId, environment)` — powers
  the listing join and enforces one row per key (the dense insert already relies on
  duplicate-key skipping, implying this should exist); plus supporting indexes for the
  page/dashboard scans and the tester rollup.
- Retain the definition-collection indexes for its own filters (team, application, module,
  priority, created-at).

---

## 4. Edge Cases

- **Missing result row** (migration window, or a case with no row yet) → defaults to
  `Pending` / `assignedTo: null`. Safe everywhere.
- **Legacy execution fields still on definition documents** → ignored by every reader (all
  overlay from `testResults`); the clone path no longer propagates them. A one-time cleanup to
  strip them is optional, not required for correctness.
- **Release-wide vs environment-scoped assignment** → release-wide mirrors to all environment
  rows; a later environment-scoped assignment overrides only that environment (latest wins).
- **Unassign** → clears only the affected rows; never resurrects older history.
- **"Unassigned" filter** on tester/assignee → matches null/empty rows post-join.
- **Join performance** → depends on the new unique `testResults` index.

---

## 5. Validation

**Automated (TDD):**

- Listing: aggregation join — same case with different status per environment resolves per the requested environment; missing row → `Pending`; status/tester/assignee filters (incl. "unassigned") match the joined values; total/pagination over the post-join, post-filter set.
- Case-edit: remove the status-transition/audit cases (now only on the result-recording path); drop status seeds from create/list fixtures.
- Assignments: assert the live-store mirror is written on assign (release-wide vs scoped filter, assignee set) and cleared on unassign.
- Dashboard: re-point to the `testResults` aggregation with the definition join; assert `(release, environment)` scoping from the search params and the latest-release/env default when params are absent. (No applications-metrics tests — that path is deleted.)
- Export join: add coverage (previously untested and broken).
- Per the user's standing preference, confirm before adding any new test cases.

**End-to-end via CDP:**

1. Mark a case Fail in one environment → its list dot turns red there; switch the selector to
   another environment → the same case reads `Pending`; open the drawer → the header
   Pass/Fail/Pending matches the selected environment and agrees with the per-environment grid;
   switch back → Fail reappears.
2. Reassign a case → the assignee appears on the list row for the active environment
   immediately; unassign → the row reads "unassigned".
3. Status filter chips filter by the selected environment.
4. Dashboard and applications counts reflect only the selected `(release, environment)`.
5. Exports / reports / PDF show correct application/module names and per-environment
   status/tester/notes.

Lint once at the end.

---

## 6. Out of Scope

- A data-migration script to strip legacy execution fields from existing definition documents
  (optional; correctness does not depend on it).
- Any change to the result-recording validation rules (already authoritative, unchanged).
