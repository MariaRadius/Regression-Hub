# QA Regression Test Manager

QA regression testing platform with auth, role-based access, and team scoping (Radius / CB).

## Quick Start

```bash
npm install
cp .env.example .env.local          # MONGODB_URI, MONGODB_DB, NEXTAUTH_SECRET
node scripts/seed-users.mjs         # seed admin + QA accounts per team
npm run dev                         # http://localhost:3000
```

Free MongoDB M0 cluster: <https://cloud.mongodb.com>

## Tech Stack

Next.js 16 · React 19 · MongoDB 6 · NextAuth 4 · React Query 5 · TipTap 3 · Recharts · jsPDF · xlsx · bcryptjs · MUI v9

## Linting & Duplication

[Biome](https://biomejs.dev) for lint + format; [jscpd](https://github.com/kucherenko/jscpd) for copy-paste detection. Pre-commit hook runs both automatically via `simple-git-hooks` + `lint-staged` (installed by `npm install`).

```bash
npm run lint        # biome check — report violations
npm run lint:fix    # biome check --write — auto-fix
npm run dup         # jscpd . — report duplicates
```

Global install (optional, for IDE integration): `npm i -g @biomejs/biome jscpd`

To (re)install the pre-commit hook after cloning: `npx simple-git-hooks`

## Testing

Vitest + React Testing Library. Tests live in `__tests__/` directories colocated next to source files (e.g. `utils/__tests__/buildModuleMap.test.js`, `components/__tests__/Modal.test.jsx`).

```bash
npm test          # run all tests once
npm run test:watch  # re-run on file change
```

Every shared module in `utils/`, `hooks/`, and `components/` must ship with a test. Tests for React components use RTL; tests for pure utility functions use plain assertions. Mock only what is unavoidable (e.g. dynamic imports of third-party libs).

## Deploy to Vercel

1. Push the repo to GitHub.
2. Import the repo in Vercel.
3. Set `MONGODB_URI`, `MONGODB_DB`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`.
4. Deploy.

## Roles

| Role      | Can do                                                                              |
| --------- | ----------------------------------------------------------------------------------- |
| **QA**    | Sign in, record results, reassign cases (from `/test-cases`), view dashboards and reports, load the active QA roster for assignment/tester pickers |
| **Admin** | All QA permissions + manage users, manage releases, import cases, bulk-assign cases       |

## Domain Model

**Release → Test Case → Result (per Environment)**

- A **Release** is a named testing cycle (e.g. `v2.9`). Admins create releases; a release owns its test cases and declares its environments (QA / Sandbox / Production by default).
- A **Test Case** belongs to exactly one release. All environments in that release share the same test-case definition. Every test case carries a DB-unique `testKey` (display identifier and import dedup key, e.g. `SAP-0001`); test cases are referenced across collections by their MongoDB `_id`.
- A **Result** records Pass / Fail / Pending for one (test case × environment). Every valid pair always has exactly one result row (dense invariant — no "missing = Pending" special case).
- **Applications and Modules** are team-global; referenced by stable ID so renaming never breaks lineage. Auto-created on import; cannot be deleted while any test case references them.
- The active **(Release, Environment)** working context is a persistent bar below the top nav, stored in session only — never on the user record.

## User Experience

### Sign-in & Identity

- Username + password login at `/login`
- Sidebar shows signed-in name, team badge (Radius / CB), and role badge (Admin / QA)
- Sign out from the sidebar; collapse/expand sidebar for more screen space

### Dashboard

- Scoped to the active (Release, Environment) selection
- Live metrics: total / passed / failed / pending
- Donut chart by status
- Bar chart by module
- Drag-and-drop `.xlsx` upload tile

### Releases

Admin-managed list of named testing cycles. Actions per release:

- **Create** — empty, clone from an existing release, or start from Excel import
- **Clone** — copies test cases with new `_id`s; fresh Pending results for each new `_id`; assignees opt-in only
- **Archive / Unarchive** — frozen and hidden from default selectors while archived; fully reversible
- **Delete** — cascades to test cases, results, and events including assignment history (confirmation dialog restates cascade)
- **Add / Remove Environment** — fan-out generates / removes result rows for all cases in the release

An archived release is read-only — no results, edits, reassignments, or imports until unarchived.

### Test Cases

Master·Detail layout: scannable list (left 46%) + detail panel (right 54%).

List is driven from `testResults` for the active (Release, Environment); switching either resets to page 1.

Search is server-backed and matches test-case title, application name, module name, and assignee name across the full release/environment result set.

Sort is explicit from the list header (not column-click) and supports oldest/newest, title A→Z / Z→A, and assignee A→Z / Z→A.

**Filters:** Linear-style chip strip with saved-view toggles (Mine / Pending / Failed / High priority). All filter state is URL-persisted (`?status=`, `?testedBy=`, etc.) and survives reload. "All" clears all filters.

**Bulk actions:** Select rows → header swaps to Gmail-style toolbar → Pass / Fail / Pending / Reassign / Edit modals. Single-row actions are also available from the detail panel.

**Test-case business rules (enforcement is server-side; UI reflects these constraints):**

- **BR-15 — Tester identity.** QA users record results as themselves; admin may record on behalf of any active QA user.
- **R21 — Fail requires notes.** Resetting to Pending requires a reason and clears tester/date while keeping the result row.
- **Expected result required** before a case can be marked Pass or Fail.

**Detail panel:** Shows `testKey`, full editable fields, and a per-environment results grid. Offers opt-in "reset all environments to Pending" on content edit.

**Pagination:** URL-persisted (`?page=`, `?size=`). Defaults: page 1, 50 rows. Options: 10 / 50 / 100.

### Excel Import

Admin-only. Two-phase: analyse (dry-run preview) → confirm (transactional commit).

- Drag-and-drop `.xlsx`
- Fuzzy header matching (case + spaces + punctuation ignored)
- **Identity ladder:** Test Key column (round-trip id) matched first; content fingerprint across releases as fallback; new case if neither matches
- In-file duplicates reject the entire import before commit
- Import generates Pending results for **all** environments, then writes result columns to the chosen environment
- New application initials (3-char, DB-unique) are editable in the confirmation dialog before commit

### Applications & Modules

- Browse the application registry (team-global, auto-created on import)
- View modules grouped by application
- Deletion blocked while any test case in any release references the application or module

### Assignments

- Assign test cases to QA users from `/test-cases`: **Reassign** (selected cases,
  active environment) is available to all team members; **Bulk Assign** (every case
  in chosen applications/modules, active or all environments) is Admin-only.
- Live assignee is stored on the result row; history lives in the audit log (events)
- Assigned-to and tested-by are distinct — reports show them separately

### Audit Log

Every result write (Pass / Fail / Pending reset) and every assign / unassign appends an immutable entry to the `events` collection — `tcId`, `releaseId`, `environment`, actor, and timestamp included.

### Reports

One unified, release-grouped surface — every active Release × Environment is a card (no top-of-page selection):

- **Create report (PDF):** generates a fresh signed-off report, downloads it immediately, and saves it as the latest copy for that release + environment. Exactly one copy is kept per (release, environment) — creating again replaces the prior one and writes an EXPORT/PDF audit event.
- **Download copy:** re-downloads the exact saved PDF without regeneration. Shown only when a copy exists.
- **Export Excel:** always reflects the latest saved data; import-compatible (round-trips through the Excel importer). Never stored, never audited.
- Archived/renamed releases with a saved copy still surface as download-only cards so no stored report is hidden.

## API Routes

All routes under `/api/releases/**` are protected; 401 is enforced in `proxy.js` only.

| Method | Route | Role | Description |
| ------ | ----- | ---- | ----------- |
| GET | `/api/releases` | admin+qa | List releases |
| POST | `/api/releases` | admin | Create / clone |
| GET | `/api/releases/[id]` | admin+qa | Get release |
| PATCH | `/api/releases/[id]` | admin | Rename or archive/unarchive |
| DELETE | `/api/releases/[id]` | admin | Delete with cascade |
| POST | `/api/releases/[id]/environments` | admin | Add environment |
| DELETE | `/api/releases/[id]/environments` | admin | Remove environment |
| GET | `/api/releases/[id]/test-cases` | admin+qa | List test cases (`environment` required; supports `q`, `sortBy`, `sortDir`, filters, paging) |
| POST | `/api/releases/[id]/test-cases` | admin | Create test case |
| GET | `/api/releases/[id]/test-cases/[caseId]` | admin+qa | Get test case |
| PATCH | `/api/releases/[id]/test-cases/[caseId]` | admin | Update test case |
| DELETE | `/api/releases/[id]/test-cases/[caseId]` | admin | Delete test case |
| GET | `/api/releases/[id]/results` | admin+qa | List results |
| GET | `/api/releases/[id]/results/[tcId]` | admin+qa | Minimal per-environment execution rows for one test case (detail panel) |
| POST | `/api/releases/[id]/results` | admin+qa | Record / bulk-record result |
| POST | `/api/releases/[id]/import` | admin | Import Excel (analyse or commit) |
| POST | `/api/releases/[id]/snapshot` | admin+qa | Generate + store PDF snapshot (replaces prior snapshot for same release+environment; writes EXPORT/PDF audit event) |
| GET | `/api/users?role=qa` | admin+qa | List active QA users for team-scoped assignment/tester pickers |
| GET | `/api/users` | admin | List all team users for user management |
| GET | `/api/snapshots` | admin+qa | List stored PDF snapshots for team (Version History) |
| GET | `/api/snapshots/[id]/download` | admin+qa | Download stored PDF bytes (no regeneration) |

## Excel Column Headers

Auto-detected (case-insensitive, spaces/punctuation ignored):

| Field                | Accepted Headers               |
| -------------------- | ------------------------------ |
| Platform/Application | platform, application, app     |
| Module               | module, modulename             |
| Test Key             | testkey, testid, tcid          |
| Test Case            | testcase, testcasename         |
| Steps                | steps, teststeps               |
| Expected Result      | expectedresult, expected       |
| Notes                | notes, note, comments, comment, actualresult, actual, defectsimprovements, defects |
| Status               | status                         |
| Tested By            | testedby, tester               |
| Tested On            | testedon, testdate, date       |
| Priority             | priority                       |
| Jira ID              | jiraid, jira                   |

`softwareVersionTested` / `Version` columns are **ignored** — the release owns the version context.
