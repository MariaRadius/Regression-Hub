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

Next.js 15 · React 18 · MongoDB 6 · NextAuth 4 · React Query 5 · TipTap 3 · Recharts · jsPDF · xlsx · bcryptjs · Tailwind CSS 3

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

| Role      | Can do                                                                                |
| --------- | ------------------------------------------------------------------------------------- |
| **QA**    | Sign in, fill results, edit own assignments, run imports, view dashboards and reports |
| **Admin** | All QA permissions + manage users, edit settings, and restore versions                |

## User Experience

### Sign-in & Identity

- Username + password login at `/login`
- Sidebar shows signed-in name, team badge (Radius / CB), and role badge (Admin / QA)
- Sign out from the sidebar; collapse/expand sidebar for more screen space

### Dashboard

- Live metrics: total / passed / failed / blocked / pending
- Donut chart by status
- Bar chart by module
- Tester breakdown
- Drag-and-drop `.xlsx` upload tile

### Test Cases

Master·Detail layout: scannable list (left 46%) + detail panel (right 54%).

**Filters:** Linear-style chip strip with saved-view toggles (Mine / Pending / Failed / High priority). All filter state is URL-persisted (`?status=`, `?testedBy=`, etc.) and survives reload. "All" clears all filters.

**Bulk actions:** Select rows → header swaps to Gmail-style toolbar → Pass / Fail / Pending / Reassign / Edit modals. Single-row actions are also available from the detail panel's Mark Pass/Fail/Pending buttons.

**Test-case business rules (enforcement is server-side; UI reflects these constraints):**

- **BR-15 — Tester ≠ Assignee (by design).** `testedBy` = whoever performs the mark; `assignedTo` = who owns the assignment. They may differ (anyone can pitch in under another's assignment). Reports must label the two distinctly — never conflate "assigned to" with "tested by."

**Detail panel:** Shows full editable fields via TestCaseRow. `testedOn` saves on blur (not on every keystroke).

**Pagination:** URL-persisted (`?page=`, `?size=`). Defaults: page 1, 50 rows. Options: 10 / 50 / 100.

### Excel Import

- Drag-and-drop `.xlsx`
- Fuzzy header matching (case + spaces + punctuation ignored)
- Deduplicates by `app::module::testCaseId` — re-importing updates instead of duplicating

### Applications & Modules

- Browse the application registry
- View modules grouped by application

### Assignments

- Assign test cases to QA users
- Track who owns what

### Audit Log

Every Pass / Fail / reset-to-Pending and every assign / unassign appends an immutable entry to the `events` collection — actor name and timestamp included — so no result or ownership change is ever anonymous or losable.

### Test Runs

- History of every import with timestamp and counts
- Software version is set only by import or version restore — never editable on an individual test case

### Reports

> Initial page data (version history, summary metrics, export settings, applications) is server-rendered; the application filter updates summary server-side via URL searchParam; exports and version mutations remain client-driven API calls.

- PDF: cover page, summary, detailed results, bug report, signoff block
- Excel export: summary sheet + full results sheet

### Version History

- Snapshot the current state as a software version
- Mark a version complete
- Restore a prior version
- View per-version detail / diff

## Excel Column Headers

Auto-detected (case-insensitive, spaces/punctuation ignored):

| Field                | Accepted Headers               |
| -------------------- | ------------------------------ |
| Platform/Application | platform, application, app     |
| Module               | module, modulename             |
| Test Case ID         | testcaseid, testid, tcid       |
| Test Case            | testcase, testcasename         |
| Steps                | steps, teststeps               |
| Expected Result      | expectedresult, expected       |
| Notes                | notes, note, comments, comment, actualresult, actual, defectsimprovements, defects |
| Status               | status                         |
| Tested By            | testedby, tester               |
| Tested On            | testedon, testdate, date       |
| Version              | softwareversiontested, version |
| Priority             | priority                       |
| Jira ID              | jiraid, jira                   |
