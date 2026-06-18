# CI/CD Pipeline Integration — Design Spec

**Date:** 2026-06-18  
**Ticket:** RXR-TBD  
**Status:** Approved, pending implementation

---

## Overview

Add a "Run Pipeline" button to the Regression Hub release page that triggers the GitLab Playwright automation suite, maps results back to Regression Hub test cases, records pass/fail outcomes, fires the existing Jira on-fail flow, and maintains a per-release run history.

---

## Architecture

```
Release page (Pipeline tab)
  └─ "Run Pipeline" button (admin-only)
       │
       ▼
POST /api/releases/[id]/pipeline-runs
  ├─ Validates release + environment
  ├─ Calls GitLab API → triggers pipeline → gets gitlabPipelineId
  ├─ Creates pipelineRun doc { status: "running", ... }
  └─ Returns { runId }

Client polls every 30s:
GET /api/pipeline-runs/[runId]
  ├─ GitLab still running → { status: "running" }
  └─ GitLab done →
       ├─ Fetches GitLab test report (JUnit JSON)
       ├─ Maps TC001 → testKey via pipelineTestMappings
       ├─ Calls bulkRecordResult() for all matched cases
       ├─ Fires existing Jira on-fail flow for failures
       ├─ Updates pipelineRun doc { status: "completed", summary, results }
       └─ Returns { status: "completed", summary: { passed, failed, unmapped } }

History tab on release page:
GET /api/releases/[id]/pipeline-runs  →  all past runs for this release
```

---

## Data Model

### `pipelineRuns` collection

One document per triggered run.

```js
{
  _id,
  teamId,
  releaseId,
  environment,          // e.g. "QA"
  gitlabPipelineId,     // number returned by GitLab API
  status,               // "running" | "completed" | "failed" | "partial"
  triggeredBy,          // session.user.name
  startedAt,            // Date
  completedAt,          // Date | null
  summary: {
    passed: 12,
    failed: 3,
    unmapped: 2         // TC IDs in GitLab report with no mapping in Regression Hub
  },
  results: [
    { gitlabId: "TC001", testKey: "SAP-0001", status: "pass" | "fail", title: "..." },
  ],
  error: null           // string if GitLab API call itself failed
}
```

**Status values:**
- `running` — pipeline still executing in GitLab
- `completed` — all mapped tests processed, 0 unmapped
- `partial` — processed but some TC IDs had no mapping
- `failed` — GitLab pipeline itself failed (infra/build error), or API error

### `pipelineTestMappings` collection

One document per team. Admin-managed. Maps GitLab annotation IDs to Regression Hub testKeys.

```js
{
  _id,
  teamId,
  mappings: [
    { gitlabId: "TC001", testKey: "SAP-0001" },
    { gitlabId: "TC002", testKey: "SAP-0002" },
  ],
  updatedAt,
  updatedBy
}
```

---

## GitLab Configuration

Three new fields added to the existing settings object (stored server-side, never sent to client — same pattern as `JIRA_API_TOKEN`):

| Field | Description |
|---|---|
| `gitlabProjectId` | GitLab project numeric ID (found in project Settings > General) |
| `gitlabRef` | Branch or tag to trigger (e.g. `"main"`) |
| `gitlabToken` | GitLab personal access token with `api` scope |

---

## API Routes

### Pipeline Runs

| Method | Route | Description |
|---|---|---|
| `POST` | `/api/releases/[id]/pipeline-runs` | Trigger pipeline; create run doc; return `{ runId }` |
| `GET` | `/api/releases/[id]/pipeline-runs` | List all runs for release (history table) |
| `GET` | `/api/pipeline-runs/[runId]` | Check status; process results when done; returns summary |
| `DELETE` | `/api/pipeline-runs/[runId]` | Cancel running pipeline via GitLab cancel API |

### Pipeline Mappings (Admin)

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/admin/pipeline-mappings` | Return team's full mapping list |
| `PUT` | `/api/admin/pipeline-mappings` | Full replace of mapping list (idempotent) |
| `POST` | `/api/admin/pipeline-mappings/import` | Parse CSV (`gitlabId,testKey`), merge with existing |

**Role gating:** All pipeline-mappings routes require `role === ROLES.ADMIN`. The trigger (`POST /pipeline-runs`) also requires admin.

---

## GitLab Integration

### Trigger
```
POST https://gitlab.com/api/v4/projects/{gitlabProjectId}/pipeline
  PRIVATE-TOKEN: {gitlabToken}
  body: { ref: gitlabRef }
→ { id: 12345, status: "created" }
```

### Poll
```
GET https://gitlab.com/api/v4/projects/{gitlabProjectId}/pipelines/{pipelineId}
→ status: "running" | "success" | "failed" | "canceled"
```

### Fetch results (when status !== "running")
```
GET https://gitlab.com/api/v4/projects/{gitlabProjectId}/pipelines/{pipelineId}/test_report
→ { test_suites: [{ test_cases: [{ name, status, classname }] }] }
```
The `name` or `classname` field contains the Playwright annotation value (`TC001`). No artifact download needed — GitLab parses JUnit XML automatically.

### Cancel
```
POST https://gitlab.com/api/v4/projects/{gitlabProjectId}/pipelines/{pipelineId}/cancel
```

**New module:** `lib/server/gitlabClient.js` — thin REST wrapper mirroring `lib/server/jiraClient.js`.

---

## Result Processing

Runs server-side inside `GET /api/pipeline-runs/[runId]` when GitLab reports completion.

1. Load `pipelineTestMappings` for the team → build `Map<gitlabId → testKey>`
2. For each test case in the GitLab test report:
   - Look up `testKey` → if missing, add to `unmapped` list
   - Translate status: `"success"` → `STATUS.PASS`, `"failed"` → `STATUS.FAIL`
3. Call existing `bulkRecordResult(db, teamId, releaseId, environment, entries, opts)` with `testedBy: "GitLab CI"` and `testedOn: completedAt`
4. Collect failures → pass to existing `createIssuesForFailures()` (auto-mode) or `buildDraftsForFailures()` (ask-mode) — no new Jira code
5. Update `pipelineRun` doc with final status, summary, and per-test results array

**New module:** `lib/server/pipelineResultProcessor.js`

---

## Test ID Mapping

### Problem
Playwright tests are annotated with generic IDs (`TC001`, `TC002`) that don't match Regression Hub's `testKey` format (`SAP-0001`).

### Solution
An admin-managed mapping table (`pipelineTestMappings`) links the two ID spaces. Admins maintain this table in Admin > Pipeline Mappings.

### Mapping management options
1. **Manual entry** — add rows one at a time in the admin UI table
2. **CSV import** — upload a file with columns `gitlabId,testKey` to bulk-load mappings
3. **CSV export** — download current mappings for offline editing

### Unmapped IDs
When a pipeline run completes with unmapped IDs:
- The run gets `status: "partial"` 
- The summary banner on the release page shows: _"2 tests could not be mapped — go to Admin > Pipeline Mappings"_
- The full unmapped ID list is stored in the `pipelineRun` doc for reference

---

## UI

### Release page — Pipeline tab (new)

A new "Pipeline" tab alongside the existing results view. Admin-only.

**Trigger panel:**
- Environment selector (populated from release's declared environments)
- "Run Pipeline" button — disabled while a run is `status: "running"`
- While running: circular progress + elapsed time chip + "Cancel" button
- On completion: status banner (Completed / Partial / Failed) with passed/failed/unmapped counts
- Partial warning: collapsible list of unmapped TC IDs with link to Admin > Pipeline Mappings

**History table:**

| Started | Environment | Triggered By | Duration | Passed | Failed | Unmapped | Status |
|---|---|---|---|---|---|---|---|
| Jun 18 14:02 | QA | Maria | 4m 12s | 12 | 3 | 2 | Partial |
| Jun 17 09:15 | QA | Maria | 3m 58s | 15 | 0 | 0 | Completed |

Clicking a row opens a detail drawer with the full per-test result breakdown.

### Admin settings — Pipeline Mappings page (new)

- Table with `gitlabId` and `testKey` columns (editable inline)
- "Add row" button
- "Import CSV" button (accepts `gitlabId,testKey` format)
- "Export CSV" button
- Save/discard controls

---

## Error Handling

| Scenario | Behavior |
|---|---|
| GitLab token missing/invalid | `POST /pipeline-runs` returns 400 with actionable message |
| GitLab API unreachable | Run doc set to `status: "failed"`, error stored; shown in history |
| Pipeline canceled in GitLab | Polling detects `"canceled"`; run doc set to `status: "failed"` |
| All test cases unmapped | Run completes as `status: "partial"`; results array empty; Jira not triggered |
| `bulkRecordResult` partial failure | Individual failures logged to run doc; overall status still `completed` |
| User navigates away during run | Polling resumes on return (client re-attaches to existing `runId`) |

---

## New Files

| File | Purpose |
|---|---|
| `lib/server/gitlabClient.js` | GitLab REST API wrapper (trigger, poll, fetch report, cancel) |
| `lib/server/pipelineResultProcessor.js` | Maps TC IDs → testKeys, calls bulkRecordResult, fires Jira flow |
| `lib/db/pipelineRunsData.js` | DB queries for pipelineRuns collection |
| `lib/db/pipelineMappingsData.js` | DB queries for pipelineTestMappings collection |
| `app/api/releases/[id]/pipeline-runs/route.js` | POST (trigger) + GET (list history) |
| `app/api/pipeline-runs/[runId]/route.js` | GET (poll/process) + DELETE (cancel) |
| `app/api/admin/pipeline-mappings/route.js` | GET + PUT |
| `app/api/admin/pipeline-mappings/import/route.js` | POST CSV import |
| `components/PipelineTab.js` | Release page pipeline tab (trigger + history) |
| `components/PipelineRunDrawer.js` | Per-run detail drawer |
| `app/(app)/admin/pipeline-mappings/page.js` | Admin mappings management page |

---

## Out of Scope

- Webhook-based push from GitLab (future enhancement)
- Triggering pipelines from non-admin QA users
- Running pipelines against a specific git branch per-environment (always uses `gitlabRef` from settings)
- Parallel pipeline runs (blocked in UI while one is running)
