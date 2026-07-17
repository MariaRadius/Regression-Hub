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
3. Set `MONGODB_URI`, `MONGODB_DB`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL` (+ optional `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` for Jira issue creation).
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
- Successful sign-in replaces the login history entry; using the browser Back button after login must not leave the user on a stale interactive login form
- Sidebar shows signed-in name, team badge (Radius / CB), and role badge (Admin / QA)
- Sign out from the sidebar; sign-out replaces the current protected-page history entry and returns to `/login` with a clear signed-out message
- Auth-sensitive pages force a fresh auth check on refresh and on browser back/forward restoration so expired or signed-out sessions never keep protected content visible from browser cache
- Collapse/expand sidebar for more screen space

### Dashboard

- Scoped to the active (Release, Environment) selection
- Live metrics: total / passed / failed / pending / known issue
- Donut chart by status (known issues are their own slice, excluded from failure counts)
- Failures-by-module pie: failure-only slices (top 8 failing modules + an `Other` rollup); each module slice links to `/test-cases?status=Fail&moduleId=<id>`; composed empty state when there are no failures
- Fail-severity pie: failures split by the test case's priority (High/Medium/Low); each slice links to `/test-cases?status=Fail&priority=<priority>`
- Bar chart by module
- Top failing modules panel: shows up to 5 modules with at least 5 failed test cases; otherwise shows a no-action-needed empty state
- Critical failures panel: failed High priority `testKey`s only, each linking to `/test-cases` with the existing Fail filter plus an exact `testKey` filter applied; module and application context shown under each id
- Known Issues panel: scoped to the active **release** but NOT the active environment — it always covers every environment defined for that release (plus any env that still holds a known issue). An in-panel environment filter (options: `All environments` + each env) defaults to `All`; the top-bar env selector does not drive it. Each visible environment shows its Known Issue count; a count > 0 is clickable and expands an inline list of the known-issue cases (`testKey`, name, Jira key(s) linked to `jiraBaseUrl/browse/<key>` when configured, else plain text). Composed empty state when the selected release has zero known issues.
- Drag-and-drop `.xlsx` upload tile

### Releases

Admin-only list of named testing cycles. QA users are redirected away from `/releases` and should never see navigation or empty-state CTAs that point there. Actions per release:

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

**Filters:** Linear-style chip strip with saved-view toggles (Mine / Pending / Failed / Known issues / High priority). All filter state is URL-persisted (`?status=`, `?testedBy=`, etc.) and survives reload. "All" clears all filters.

**Bulk actions:** Select rows → header swaps to Gmail-style toolbar → Pass / Fail / Pending / Known Issue / Reassign / Edit modals. Single-row actions are also available from the detail panel.

**Test-case business rules (enforcement is server-side; UI reflects these constraints):**

- **BR-15 — Tester identity.** QA users record results as themselves; admin may record on behalf of any active QA user.
- **R21 — Fail requires notes.** Resetting to Pending requires a reason and clears tester/date while keeping the result row.
- **Expected result required** before a case can be marked Pass or Fail.
- **Known Issue** reclassifies a failure as a tracked, accepted problem. It is settable only on a case currently marked Fail. The Jira reference is auto-fetched from the Test Issue linked when the case failed (`jiraIssueKeys` on the result row); a key is requested manually only when the failure has none linked (e.g. Jira disabled). It is its own dashboard category, excluded from failure counts, and is not importable via Excel (interactive-only).

**Detail panel:** Shows `testKey`, full editable fields, a per-environment results grid, and a bottom History toggle that lazy-loads the selected case's activity log without closing the panel. Offers opt-in "reset all environments to Pending" on content edit.

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

### Admin Panel

Admin-only hub for user management, importing, destructive maintenance, and audit review.

- Quick-access cards open Team Members, Import Test Cases, and Activity Logs
- **Activity Logs** stay collapsed until the admin explicitly opens them from `/admin`
- Activity Logs are admin-only, lazy-loaded, newest-first, and readable without leaving the admin page
- Activity entries cover admin-surface mutations such as user creation/edits, password changes, role changes, activation/deactivation, importer commits, and clear-all-data resets
- Activity Logs can be downloaded after they are opened

### Assignments

- Assign test cases to QA users from `/test-cases`: **Reassign** (selected cases,
  active environment) is available to all team members; **Bulk Assign** (every case
  in chosen applications/modules, active or all environments) is Admin-only.
- Live assignee is stored on the result row; history lives in the audit log (events)
- Assigned-to and tested-by are distinct — reports show them separately

### Audit Log

Every result write (Pass / Fail / Pending reset), test-case edit, import, and assign / unassign appends an immutable entry to the `events` collection — `tcId`, `releaseId`, `environment`, actor, and timestamp included.

Per-case history is read from the detail panel only when the user opens History. Entries are shown newest-first and include actor, local timestamp, and meaningful field transitions such as status, tester, notes, assignee, and test-case definition edits.

Admin activity logs are a separate admin-only read surface over non-test-case events. They are opened on demand from `/admin`, never loaded with the initial page, and support download after load.

### Jira Integration

Creates a Jira Cloud issue when a test case is marked **Fail**, pre-filled with the failure details, and links it to the case's Jira Story.

- Server-only env vars: `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` (Atlassian API token, Basic auth). Any missing var disables the integration; the token is never stored in the DB or sent to the client. Optional `JIRA_FIX_VERSION` (e.g. `testRelease`) sets the Jira Release on every created issue — the version must already exist in the target project.
- Admin → Settings: **Jira issue creation** mode — `Off` / `Ask each time` (default) / `Automatic`.
- **Ask mode = review before create.** After the Fail is recorded, the client fetches editable drafts (`POST /api/releases/[id]/jira-drafts`) and a stepper dialog walks through each case — QA can edit the summary/description, then Create or Skip per ticket (`POST /api/releases/[id]/jira-issues`). **Automatic mode** creates server-side during result recording with no review.
- Draft description is a structured template built from the test case: Steps to Reproduce (HTML steps flattened to plain text), Expected Result, Actual Result (the QA's failure notes), module/priority, release/environment, recorded by.
- Target project is derived from the case's Jira Story key (`RXR-123` → `RXR`); issue type is `Bug` for `Production` (case-insensitive), `Test Issue` otherwise; both are re-derived server-side on create — the client can edit only summary/description. The issue is labelled `test-atlas`, linked "Relates" to the story, and its key is appended to the result row's `jiraIssueKeys` (repeat failures keep every ticket).
- Cases without a Jira Story are skipped. Jira failures never block result recording — the result saves first; creation errors surface as warnings.
- **Story-watch notifications**: a bell icon in the Test Cases page header shows a badge when any linked Jira story has been updated since QA last acknowledged it. Click to see which stories changed and filter the list to their test cases. Stories are re-checked from Jira at most once per hour; dismissed via per-story or "Dismiss all" (`POST /api/jira/acknowledge-story`).

### Reports

One unified, release-grouped surface — every active Release × Environment is a card (no top-of-page selection):

- **Create report (PDF):** generates a fresh signed-off report, downloads it immediately, and saves it as the latest copy for that release + environment. Exactly one copy is kept per (release, environment) — creating again replaces the prior one and writes an EXPORT/PDF audit event.
- **Download copy:** re-downloads the exact saved PDF without regeneration. Shown only when a copy exists.
- **Export Excel:** includes every test case expected for the selected release + environment, even when that environment's result row is missing; preserves import-facing columns including Platform/Application, Module, Steps, Expected Result, Actual Result, Defects/Improvements, Notes, Status, Tested By, Tested On, and Software Version Tested; writes one workbook sheet per application plus summary/all-cases sheets. Never stored, never audited.
- Archived/renamed releases with a saved copy still surface as download-only cards so no stored report is hidden.

## API Routes

All routes under `/api/releases/**` are protected; 401 is enforced in `proxy.js` only.

| Method | Route | Role | Description |
| ------ | ----- | ---- | ----------- |
| GET | `/api/releases` | admin+qa | List releases for selectors, dashboards, reports, and other non-management flows |
| POST | `/api/releases` | admin | Create / clone |
| GET | `/api/releases/[id]` | admin+qa | Get release |
| PATCH | `/api/releases/[id]` | admin | Rename or archive/unarchive |
| DELETE | `/api/releases/[id]` | admin | Delete with cascade |
| POST | `/api/releases/[id]/environments` | admin | Add environment |
| DELETE | `/api/releases/[id]/environments` | admin | Remove environment |
| GET | `/api/releases/[id]/test-cases` | admin+qa | List test cases (`environment` required; supports exact `testKey`, broad `q`, `sortBy`, `sortDir`, filters, paging) |
| POST | `/api/releases/[id]/test-cases` | admin | Create test case |
| GET | `/api/releases/[id]/test-cases/[caseId]` | admin+qa | Get test case |
| GET | `/api/releases/[id]/test-cases/[caseId]/events` | admin+qa | Lazy-load per-case history for the active release |
| PATCH | `/api/releases/[id]/test-cases/[caseId]` | admin | Update test case |
| DELETE | `/api/releases/[id]/test-cases/[caseId]` | admin | Delete test case |
| GET | `/api/releases/[id]/results` | admin+qa | List results |
| GET | `/api/releases/[id]/results/[tcId]` | admin+qa | Minimal per-environment execution rows for one test case (detail panel) |
| POST | `/api/releases/[id]/results` | admin+qa | Record / bulk-record result |
| POST | `/api/releases/[id]/jira-drafts` | admin+qa | Build editable Jira issue drafts for failed cases |
| POST | `/api/releases/[id]/jira-issues` | admin+qa | Create reviewed Jira issues (link story, store key) |
| POST | `/api/releases/[id]/import` | admin | Import Excel (analyse or commit) |
| GET | `/api/admin/events` | admin | Lazy-load admin activity logs for the current team |
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
