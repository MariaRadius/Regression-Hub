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

## Linting

ESLint 9 (flat config) with `next/core-web-vitals` + strict correctness rules (`no-unused-vars`, `eqeqeq`, `prefer-const`, `no-var`, `no-console` warn). Config lives in `eslint.config.mjs`.

```bash
npm run lint        # report violations
npm run lint:fix    # auto-fix what can be fixed
```

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

- Inline editing: actual result, status, tester, date, version, defects, priority, Jira ID
- Rich text editing (TipTap) for steps / expected / actual / defects
- Bulk fill: apply status / tester / date / version across all pending or all visible rows in one click
- Sticky defaults: set tester + version once, auto-applied on next status change
- Filters by application, module, status, tester
- Priority and Jira ID columns

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

### Test Runs

- History of every import with timestamp and counts

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
| Actual Result        | actualresult, actual           |
| Status               | status                         |
| Tested By            | testedby, tester               |
| Tested On            | testedon, testdate, date       |
| Version              | softwareversiontested, version |
| Defects              | defectsimprovements, defects   |
| Priority             | priority                       |
| Jira ID              | jiraid, jira                   |
