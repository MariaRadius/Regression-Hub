# QA Regression Test Manager

A Next.js 15 + MongoDB QA regression testing management system.

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Configure MongoDB
Copy `.env.example` to `.env.local` and fill in your MongoDB URI:
```
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/
MONGODB_DB=qa-regression-management
```

> **Free MongoDB**: Create a free cluster at https://cloud.mongodb.com — M0 tier is enough.

### 3. Run
```bash
npm run dev
```

Open http://localhost:3000

---

## Features

- **Excel Import** — Drag-and-drop `.xlsx` upload with fuzzy header normalization
- **Inline Table Editing** — Edit actual results, status, tester, date, version directly in the table
- **Bulk Fill** — Apply status/tester/date/version to all pending or all visible rows at once
- **Sticky Defaults** — Set tester/version once; auto-fills on status change
- **Dashboard** — Live metrics, donut chart, bar chart by module, tester breakdown
- **PDF Reports** — Cover page, summary, detailed results, bug report, signoff block
- **Excel Export** — Summary sheet + full results sheet
- **MongoDB** — Persistent storage with deduplication via `uniqueKey = app::module::testCaseId`

## Excel Column Headers

The importer auto-detects these (case-insensitive, spaces/punctuation ignored):

| Field | Accepted Headers |
|---|---|
| Platform/Application | platform, application, app |
| Module | module, modulename |
| Test Case ID | testcaseid, testid, tcid |
| Test Case | testcase, testcasename |
| Steps | steps, teststeps |
| Expected Result | expectedresult, expected |
| Actual Result | actualresult, actual |
| Status | status |
| Tested By | testedby, tester |
| Tested On | testedon, testdate, date |
| Version | softwareversiontested, version |
| Defects | defectsimprovements, defects |

## QA Users

Edit `utils/formatters.js` to change the team list:
```js
export const QA_USERS = ['Ammad', 'Maria', 'Sohail'];
```

## Project Structure

```
app/
  layout.js               # Root layout with sidebar
  globals.css             # Design system + all styles
  page.js                 # Redirects to /dashboard
  dashboard/page.js       # Metrics + charts + upload
  test-cases/page.js      # Inline editing table
  applications/page.js    # Application registry
  modules/page.js         # Module table
  test-runs/page.js       # Import history
  reports/page.js         # PDF + Excel export
  api/
    import-excel/         # POST: parse + deduplicate + save
    dashboard/            # GET: metrics + grouped summaries
    applications/         # GET: all applications
    modules/              # GET: all modules
    test-runs/            # GET: all test runs
    test-cases/           # GET (with filters), DELETE all
    test-cases/[id]/      # PATCH single test case
    test-cases-bulk/      # PATCH many test cases
    export-data/          # GET all for export
lib/
  mongodb.js              # Singleton connection
  indexes.js              # Ensure DB indexes
utils/
  canonicalColumn.js      # Fuzzy header normalization
  excelImport.js          # Server-side Excel parsing
  formatters.js           # Constants + helpers
components/
  Toast.jsx               # Toast notifications
  UploadExcel.jsx         # Drag-and-drop upload
```

## Deploy to Vercel

1. Push to GitHub
2. Import project in Vercel
3. Add environment variables: `MONGODB_URI` and `MONGODB_DB`
4. Deploy
