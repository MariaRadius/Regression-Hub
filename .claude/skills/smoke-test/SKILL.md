---
name: smoke-test
description: Use when verifying regression-hub pages render correctly end-to-end with no console or network errors — runs automated DevTools walk for both admin and QA roles and emits a structured JSON report. Download checks (PDF and Excel) are opt-in and only run when explicitly requested.
---

# Smoke Test — regression-hub (automated)

## When to use

After `npm test` passes and before opening a PR. Run the full recipe below — do not adapt on the fly; every detail is pre-baked.

---

## Prerequisites

### 1 — Load deferred tools (do this first, before any navigation)

```
ToolSearch: "select:mcp__plugin_chrome-devtools-mcp_chrome-devtools__navigate_page,mcp__plugin_chrome-devtools-mcp_chrome-devtools__list_console_messages,mcp__plugin_chrome-devtools-mcp_chrome-devtools__list_network_requests,mcp__plugin_chrome-devtools-mcp_chrome-devtools__fill,mcp__plugin_chrome-devtools-mcp_chrome-devtools__click,mcp__plugin_chrome-devtools-mcp_chrome-devtools__wait_for,mcp__plugin_chrome-devtools-mcp_chrome-devtools__new_page,mcp__plugin_chrome-devtools-mcp_chrome-devtools__evaluate_script,mcp__plugin_chrome-devtools-mcp_chrome-devtools__select_page"
```

### 2 — Start dev server

```bash
npm run dev > /tmp/smoke-dev.log 2>&1 &
SMOKE_PID=$!
```

Then poll for the ready line (up to 20 s):

```bash
for i in $(seq 1 20); do
  grep -aq "Local:" /tmp/smoke-dev.log && break
  sleep 1
done
SMOKE_PORT=$(grep -a "Local:" /tmp/smoke-dev.log | grep -o "localhost:[0-9]*" | cut -d: -f2)
echo "Server on port $SMOKE_PORT  PID $SMOKE_PID"
```

Use `$SMOKE_PORT` for all URLs below. If the port is blank after 20 s, the server failed — check `/tmp/smoke-dev.log` and stop.

---

## Credentials (from scripts/seed-users.mjs — do not re-read the file)

| Role  | username | password      |
| ----- | -------- | ------------- |
| admin | maria    | Maria@Radius1 |
| qa    | ammad    | Ammad@Radius1 |

---

## Route inventory

**All-role routes (3)** — both admin and QA walks visit these:
`/dashboard`, `/test-cases`, `/reports`

**Admin-only routes (3)** — admin walk only:
`/admin`, `/users`, `/import-cases`

On `/admin`, the Activity Logs drawer stays closed until the admin clicks `View Activity`. Opening it should trigger one `GET /api/admin/events` request, show readable newest-first entries, and keep a `Download Logs` button available inside the drawer.

**QA redirect assertions (4)** — QA walk must confirm these redirect:
`/releases` → `/dashboard`, `/admin` → `/dashboard`, `/users` → `/dashboard`, `/import-cases` → `/dashboard`

---

## Auth-adjacent internal routes

`POST /api/auth/validate-ctx` — called by `LoginForm` immediately after successful sign-in to validate and evict a stale `rh_release_ctx` cookie. Not user-facing. Auth: self-guarded via `getToken` (lives under `api/auth/` which is excluded from `proxy.js`).

## Role-gating rules (server-side, enforced in `page.js`)

| Route          | Admin | QA              |
| -------------- | ----- | --------------- |
| `/releases`    | PASS  | REDIRECT → `/dashboard` |
| `/test-cases`  | PASS  | PASS            |
| `/reports`     | PASS  | PASS            |
| `/import-cases`| PASS  | REDIRECT → `/dashboard` |
| `/admin`       | PASS  | REDIRECT → `/dashboard` |
| `/users`       | PASS  | REDIRECT → `/dashboard` |

Mutation routes (POST/PATCH/DELETE on `/api/releases/**`, `/api/test-cases/**`) require admin except result recording (`/api/releases/[id]/results`) and snapshot generation (`POST /api/releases/[id]/snapshot`) which are open to QA. `POST /api/assignments` is open to any team member (`withTeam`) — the admin gate is on the Bulk Assign button in the test-cases FilterStrip (UI only). The `/assignments` page route no longer exists.

QA users must not see a desktop/mobile nav item for `/releases`, and any empty-state CTA that links to `/releases` must be hidden for QA.

Tester-visible assignment and result dialogs also fetch `GET /api/users?role=qa`; this request must return 200 for both admin and QA users with no console or network errors. The full `GET /api/users` roster remains admin-only.

---

## Download surfaces — **skipped unless `$DOWNLOADS` is `yes`**

| ID  | Page       | Button text      | What it generates                          | Stored? | Mutates?         |
| --- | ---------- | ---------------- | ------------------------------------------ | ------- | ---------------- |
| A   | /reports   | "Create report" (per row) | jsPDF sign-off report + server upload | Yes | Yes — see below  |
| B   | /reports   | "Export Excel" (per row)  | xlsx workbook with summary, all-cases, and per-application sheets (client-side, not stored) | No  | No               |
| C   | /reports   | "Download copy" (per row) | Streams stored PDF bytes from GridFS  | N/A | No — read-only |

**Download A is a MUTATION.** Clicking a row's "Create report":
1. Generates the PDF client-side and immediately downloads it locally (Blob interceptor captures this).
2. POSTs the same bytes to `POST /api/releases/[id]/snapshot` (multipart: `file`, `environment`, `filename`).
3. Replaces any prior saved copy for that (release, environment) — old GridFS bytes are deleted.
4. Writes an audit event (`category: export`, `action: pdf`).

**Download B (Excel) is NOT a mutation** — it is never stored, never audited, and creates no saved copy. The workbook must include every expected test case for the selected release + environment, even if that environment's result row is missing, and it must include per-application sheets so the file mirrors the original import organization.

**Download C (Download copy)** hits `GET /api/snapshots/[id]/download` and returns the stored bytes with no regeneration. The "Download copy" button only appears on rows that already have a saved copy.

---

## Blob size interceptor (inject before every download click)

```js
// evaluate_script — run this immediately before clicking a download button
window.__smokeBlobs = window.__smokeBlobs || [];
(function () {
  if (window.__smokeBlobPatched) return;
  window.__smokeBlobPatched = true;
  const _orig = URL.createObjectURL.bind(URL);
  URL.createObjectURL = function (blob) {
    window.__smokeBlobs.push({ size: blob.size, type: blob.type });
    return _orig(blob);
  };
})();
window.__smokeBlobs = []; // reset before each click
```

After clicking, wait for completion (details per download below), then read:

```js
// evaluate_script — read result
window.__smokeBlobs[0]; // { size: <number>, type: '<mime>' }
```

PASS criterion: `size > 1024` (at least 1 KB — rules out empty blobs).

---

## Screenshot policy

**Do NOT use `take_screenshot` in the normal test flow.** Use `includeSnapshot: true` on whichever CDP tool call triggered the action instead — it is faster and uses fewer tokens.

Screenshots (`take_screenshot`) are allowed only as a last resort when debugging an unexpected failure that cannot be diagnosed from console messages, network requests, or snapshot output alone. If you take one, note in the report that it was a debug-only screenshot.

---

## Step-by-step recipe

### PHASE 0 — Confirm scope (do this before any navigation)

Use the `AskUserQuestion` tool with these four questions before proceeding:

```
Question 1 (header: "Test mode"):
  "How thorough should the test run be?"
  Options:
    - label: "Smoke (Recommended)"  description: "Navigate routes, check HTTP 200 and zero console errors — fast"
    - label: "Detailed"             description: "Smoke + deep interaction tests: network calls, DOM updates, console verification per action"

Question 2 (header: "Run tests"):
  "Run npm test before starting the browser walk?"
  Options:
    - label: "Yes (Recommended)"  description: "Run the unit/integration test suite first; stop if any test fails"
    - label: "No"                 description: "Skip npm test — useful when tests were already run or are known passing"

Question 3 (header: "Role scope"):
  "Which roles should the smoke test cover?"
  Options:
    - label: "Both (Recommended)"  description: "Run admin walk + QA walk"
    - label: "Admin only"          description: "Skip QA walk and redirect checks"
    - label: "QA only"             description: "Skip admin walk; still assert QA redirects"

Question 4 (header: "Downloads"):
  "Test download reports? (mutates saved PDF copies)"
  Options:
    - label: "No (Recommended)"  description: "Skip download checks — safe, non-destructive"
    - label: "Yes"               description: "Run Download A (PDF snapshot, MUTATION) and Download B (Excel)"
```

Record answers as `$MODE` (`smoke` / `detailed`), `$RUN_TESTS` (`yes` / `no`), `$ROLES` (`both` / `admin` / `qa`) and `$DOWNLOADS` (`yes` / `no`). All subsequent phases are gated on these values.

If `$RUN_TESTS` is `yes`, run `npm test` now before opening any browser page. Stop and fix if any test fails.

---

### PHASE 1 — Admin walk

> **Skip this phase if `$ROLES` is `qa`.**

Open a fresh isolated page (isolates admin cookies from QA context):

```
new_page url="http://localhost:$SMOKE_PORT/login" isolatedContext="admin-smoke"
```

#### Sign in as admin

1. `wait_for` text=`["USERNAME"]` timeout=5000 `includeSnapshot: true` → confirm login form; note `textbox "USERNAME"`, `textbox "PASSWORD"`, `button "SIGN IN"`
2. `fill` USERNAME field → `maria`
3. `fill` PASSWORD field → `Maria@Radius1`
4. `click` SIGN IN button `includeSnapshot: true`
5. `wait_for` text `["Dashboard"]` timeout=10000

Confirm URL is `/dashboard`. If still on `/login`, fail with "Admin sign-in failed".

Then verify auth-navigation history:

1. Trigger the browser Back action once.
2. PASS if the app does not leave you on a usable login form. Accept either an immediate return to `/dashboard` or a brief reload that lands on `/dashboard`.
3. Trigger the browser Forward action once and confirm you stay authenticated on a protected page with no console errors.

Before ending each authenticated walk, sign out from the profile menu and verify:

1. The app lands on `/login?reason=signed-out`.
2. A signed-out confirmation message is visible.
3. One browser Back action does not reveal protected content; accept either staying on `/login` or a brief reload that returns to `/login?reason=auth-required`.

#### Walk all 8 admin routes

For each route in order:
`/dashboard`, `/test-cases`, `/releases`, `/reports`, `/admin`, `/users`, `/import-cases`

Per route:

```
navigate_page type=url url="http://localhost:$SMOKE_PORT<route>" timeout=15000
```

Then immediately:

```
list_console_messages types=["error","warn"]   → capture all messages
list_network_requests resourceTypes=["document"] → confirm HTTP 200
```

Record result:

- `status`: PASS if HTTP 200 AND zero `[error]` messages; else FAIL
- `consoleErrors`: count of `[error]` type messages
- `consoleWarns`: count of `[warn]` type messages
- `httpCode`: status code of the document request

**Do not stop on FAIL** — continue walking all routes and collect results.

#### Extra `/admin` checks (admin walk only)

After the route walk lands on `/admin`, verify the admin activity drawer behavior:

1. Confirm the page renders a `View Activity` button/card with no `/api/admin/events` request fired on initial page load.
2. Click `View Activity` and confirm one request to `/api/admin/events` succeeds with no console errors.
3. Confirm the drawer shows readable activity rows and a `Download Logs` button.
4. Close the drawer and confirm the admin page remains interactive.

#### Extra `/test-cases` checks (run for both admin and QA walks)

After the route walk lands on `/test-cases`, verify the list controls actually work:

1. Type `maria` into the list search box and confirm the document request URL for `/api/releases/[id]/test-cases` includes `q=maria`.
2. Clear the search, click the sort button, choose a non-default option (for example `Title A-Z`), and confirm the next document request includes both `sortBy` and `sortDir`.
3. Open any test case, click the bottom `History` button in the detail panel, and confirm a request to `/api/releases/[id]/test-cases/[caseId]/events` succeeds with no console errors. Then click `Hide History` and confirm the same test case remains open.
4. After each interaction, confirm there are still no console errors and the page remains interactive.

#### Download A — PDF snapshot (on /reports)

> **Skip if `$DOWNLOADS` is `no`.**
> **This is a mutation** — it writes/replaces a saved copy and appends an audit event.

Navigate to `/reports` (reuse if already there for Download B):

```
navigate_page type=url url="http://localhost:$SMOKE_PORT/reports" timeout=15000
```

Wait for the page to load (`wait_for` text=`["Create report"]` timeout=10000 `includeSnapshot: true`).

The page lists every active release × environment as a card — no top-of-page selection. If the snapshot shows the "No releases yet" empty state, skip and mark A as `SKIPPED` with reason "no releases".

1. From the snapshot, find the first row's `button "Create report"` (aria-label `Create report for <release> <env>`)
2. `evaluate_script` → inject Blob interceptor (reset `__smokeBlobs = []`)
3. `click` the Create report button `includeSnapshot: true`
4. `wait_for` text `["Create report"]` timeout=30000 (button shows "Creating…" while generating + uploading; text reverts when done)
5. `evaluate_script` → read `window.__smokeBlobs[0]`
6. Record: `{ name: "Signoff PDF", blobSize: <size>, blobType: <type>, status: size > 1024 ? "PASS" : "FAIL" }`

After the click completes, that row should gain a "Saved" chip and a "Download copy" button. Confirm with a `wait_for` (at minimum, no `list_console_messages` errors).

If `/reports` has no data, mark A as `SKIPPED` with reason "no data".

#### Download B — Excel (on /reports)

> **Skip if `$DOWNLOADS` is `no`.**

Navigate to `/reports` (reuse if already there for Download A):

```
navigate_page type=url url="http://localhost:$SMOKE_PORT/reports" timeout=15000
```

Wait for the page to load (`wait_for` text=`["Export Excel"]` timeout=10000 `includeSnapshot: true`).

1. From the snapshot, find `button "Export Excel"`
2. `evaluate_script` → inject Blob interceptor (reset `__smokeBlobs = []`)
3. `click` the Export Excel button
4. `evaluate_script` after 2 s → read `window.__smokeBlobs[0]` (xlsx is synchronous — no loading state)
   - If `__smokeBlobs` is still empty after 2 s, retry once more after 2 s.
5. Record: `{ name: "Excel", blobSize: <size>, blobType: <type>, status: size > 1024 ? "PASS" : "FAIL" }`

If `/reports` has no data, mark B as `SKIPPED` with reason "no data".

#### Font check (run once, on any already-loaded page)

```
list_network_requests resourceTypes=["font"]
```

PASS: every font URL matches `/_next/static/media/` or `/__nextjs_font/`. Any hit containing `fonts.googleapis.com` or `fonts.gstatic.com` is a FAIL.

Record: `{ selfHostedOnly: <bool>, cdnHits: [<urls if any>], status: <"PASS"|"FAIL"> }`

---

### PHASE 2 — QA walk

> **Skip this phase if `$ROLES` is `admin`.**

Open a **new isolated page** (separate cookie jar — do not reuse admin context):

```
new_page url="http://localhost:$SMOKE_PORT/login" isolatedContext="qa-smoke"
```

#### Sign in as QA

1. `wait_for` text=`["USERNAME"]` timeout=5000 `includeSnapshot: true` → confirm login form; note USERNAME / PASSWORD / SIGN IN fields
2. `fill` USERNAME → `ammad`
3. `fill` PASSWORD → `Ammad@Radius1`
4. `click` SIGN IN `includeSnapshot: true`
5. `wait_for` text `["Dashboard"]` timeout=10000

Confirm URL is `/dashboard`. If not, fail "QA sign-in failed".

#### Walk 4 QA-visible routes

Same per-route check as admin walk (navigate → console errors → HTTP 200):
`/dashboard`, `/test-cases`, `/releases`, `/reports`

Record same fields as admin walk.

#### Assert 3 QA redirect checks

For each restricted route (`/admin`, `/users`, `/import-cases`):

```
navigate_page type=url url="http://localhost:$SMOKE_PORT/<route>" timeout=10000
```

After navigation, the current URL must be `http://localhost:$SMOKE_PORT/dashboard`.

- PASS: URL ends with `/dashboard`
- FAIL: URL ends with the route (page rendered — auth guard broken)

Record:

```json
{ "route": "/users", "expectedRedirect": "/dashboard", "actualUrl": "<url>", "status": "PASS"|"FAIL" }
```

---

### PHASE 3 — Teardown

```bash
kill $SMOKE_PID 2>/dev/null
```

---

### PHASE 5 — Detailed interaction tests

> **Skip this phase entirely if `$MODE` is `smoke`.**

Run in the **admin context** (reuse the `admin-smoke` page if it is still alive, or sign in again as admin using the credentials above).

---

#### Scenario D1 — Dashboard: release/environment selector change

**Important:** Changing the selector does not fire any `/api/…` fetch. It sets a cookie (`rh-release-ctx`) and calls `router.refresh()`, which causes Next.js to re-execute the RSC and issue a standard **document navigation** for `/dashboard`. Verify that document request, not an XHR.

Steps:
1. Navigate to `/dashboard`.
2. `wait_for` text matching any of the visible section labels (e.g. `"Pass / Fail / Pending"` or `"Application Summary"`) timeout=10000.
3. `evaluate_script` → read the current selector value: `document.querySelector('input[placeholder="Select context…"]')?.value` — record as `$PREV_CTX`.
4. `click` the `input[placeholder="Select context…"]` to open the dropdown.
5. `wait_for` selector `li[role="option"]` timeout=5000 (wait for options to appear).
6. Read visible option text via `evaluate_script` → `Array.from(document.querySelectorAll('li[role="option"]')).map(el => el.textContent.trim())`. Record the list.
7. If there is at least one option different from `$PREV_CTX`, click it. Otherwise mark D1 as `SKIPPED` with reason "only one context available".
8. `wait_for` text matching any dashboard section label timeout=10000 (page re-rendered via RSC refresh).
9. `list_network_requests resourceTypes=["document"]` — confirm a request to `/dashboard` with HTTP 200 appears after the selection.
10. `list_console_messages types=["error"]` — assert zero errors.
11. `evaluate_script` → read new value: `document.querySelector('input[placeholder="Select context…"]')?.value` — assert it differs from `$PREV_CTX`.
12. Visually confirm at least one dashboard section is still rendered (e.g. `wait_for` text `"Pass / Fail / Pending"` timeout=5000).

Record: `{ scenario: "D1", status: "PASS"|"FAIL"|"SKIPPED", prevCtx, newCtx, dashboardDocumentStatus, consoleErrors }`.

---

#### Scenario D2 — Test Cases: checkbox selection + bulk status + bulk reassign

Steps:
1. Navigate to `/test-cases`.
2. `wait_for` selector `[data-case-id]` timeout=10000 (at least one test case row rendered). If none appear, mark D2 as `SKIPPED` with reason "no test cases".
3. `evaluate_script` → get the first row's ID and current status:
   ```js
   const row = document.querySelector('[data-case-id]');
   ({ caseId: row?.dataset?.caseId, statusText: row?.querySelector('[data-testid="status-chip"], [class*="status"]')?.textContent?.trim() })
   ```
   Record `$TC_ID` and `$INITIAL_STATUS`.
4. Click the checkbox for that row: `click` selector `[data-case-id="${$TC_ID}"] input[type="checkbox"]`.
5. `wait_for` text matching `/\d+ selected/` timeout=3000 — confirms bulk toolbar appeared.
6. `evaluate_script` → confirm the detail panel is NOT open: `!document.querySelector('[role="dialog"], [aria-label="Close detail panel"]')` must be `true`. If panel is open, record a FAIL note "checkbox opened detail panel unexpectedly".
7. `evaluate_script` → read current assignee if visible: `document.querySelector('[data-case-id="${$TC_ID}"] [data-testid="assignee"]')?.textContent?.trim() ?? 'unknown'` — record `$INITIAL_ASSIGNEE`.

**Bulk status change (choose a status different from `$INITIAL_STATUS`; if unknown default to "Pending"):**
8. Click the appropriate bulk toolbar button (one of: `button` with text "Pass", "Fail", or "Pending" — pick one that differs from `$INITIAL_STATUS`). Note which status was selected as `$TARGET_STATUS`.
9. A modal opens. Look for a confirm/submit button. Click it (look for button text "Confirm", "Save", or "Record" — use `wait_for` to find it first).
10. `wait_for` absence of modal timeout=10000 (modal closes after API call).
11. `list_network_requests resourceTypes=["fetch","xhr"]` — find the `PATCH /api/releases/.*/results` call and confirm it returned 200.
12. `list_console_messages types=["error"]` — assert zero errors.
13. `evaluate_script` → verify the status chip on the row updated (it may now show `$TARGET_STATUS`; exact text depends on casing in the app — just confirm it changed from `$INITIAL_STATUS` if that was readable).

**Bulk reassign:**
14. Ensure the same row is still selected (if deselected, click the checkbox again).
15. Click the "Reassign" button in the toolbar.
16. `wait_for` selector for the modal or text "Reassign" in a dialog context timeout=5000.
17. Look for an assignee dropdown/select and pick any available option (use `evaluate_script` to find the first option: `document.querySelector('[role="dialog"] [role="option"], [role="dialog"] li')?.textContent?.trim()`).
18. Click confirm/save.
19. `list_network_requests resourceTypes=["fetch","xhr"]` — find `POST /api/assignments` and confirm 200.
20. `list_console_messages types=["error"]` — assert zero errors.

Record: `{ scenario: "D2", status: "PASS"|"FAIL"|"SKIPPED", tcId, initialStatus, targetStatus, bulkStatusApiStatus, bulkAssignApiStatus, panelOpenedOnCheckbox: false, consoleErrors }`.

---

#### Scenario D3 — Test Cases: detail panel open + status change + Results by Environment + History

Steps:
1. Navigate to `/test-cases` (or reuse if already there).
2. `wait_for` selector `[data-case-id]` timeout=10000. If none, mark D3 as `SKIPPED`.
3. `evaluate_script` → get the first row ID: `document.querySelector('[data-case-id]')?.dataset?.caseId`. Record `$TC_ID2` (may be same as `$TC_ID` from D2 — that is fine).
4. Click the row (not the checkbox): `click` selector `[data-case-id="${$TC_ID2}"]`. Use `evaluate_script` first to make sure the checkbox is NOT being targeted: `document.querySelector('[data-case-id="${$TC_ID2}"]')?.getAttribute('role')` should equal `"button"`.
5. `wait_for` selector `#execution-action-buttons` timeout=8000 — confirms detail panel opened.
6. `list_network_requests resourceTypes=["fetch","xhr"]` — confirm `GET /api/releases/.*/results/$TC_ID2` returned 200.
7. `list_console_messages types=["error"]` — assert zero errors.
8. `wait_for` text `"Results by Environment"` timeout=5000 — section is rendered.

**Status change from detail panel:**
9. Click one of the status buttons inside `#execution-action-buttons` (Pass, Fail, or Pending — pick any one).
10. `wait_for` modal confirm button (text "Confirm", "Save", or "Record") timeout=5000. Click it.
11. `wait_for` absence of modal timeout=10000.
12. `list_network_requests resourceTypes=["fetch","xhr"]` — confirm `POST /api/releases/.*/results` returned 200.
13. `list_console_messages types=["error"]` — assert zero errors.
14. `evaluate_script` → confirm "Results by Environment" section still present and that the row for the current environment reflects the new status (look for the status text that was selected in the env grid).

**History / events log:**
15. `click` `aria-label="Show history"` button.
16. `wait_for` text `"History"` in a card context timeout=8000.
17. `list_network_requests resourceTypes=["fetch","xhr"]` — confirm `GET /api/releases/.*/test-cases/$TC_ID2/events` returned 200.
18. `list_console_messages types=["error"]` — assert zero errors.
19. `evaluate_script` → count visible history entries: `document.querySelectorAll('[aria-label="Hide history"] ~ * [class*="event"], [data-testid*="event"]').length` — expect at least 1. If the count is 0, fall back to checking that the History card is non-empty (no "no history" empty state text visible).
20. `click` `aria-label="Hide history"` — confirm panel collapses without error.
21. `list_console_messages types=["error"]` — assert zero errors.

Record: `{ scenario: "D3", status: "PASS"|"FAIL"|"SKIPPED", tcId, panelOpened: true, resultsApiStatus, statusChangeApiStatus, historyApiStatus, historyEntries, consoleErrors }`.

---

## PHASE 4 — Generate JSON report

Assemble and print the following JSON (fill in real values):

```json
{
  "timestamp": "<ISO-8601 timestamp>",
  "branch": "<output of: git branch --show-current>",
  "serverPort": <SMOKE_PORT as number>,
  "adminWalk": [
    { "route": "/dashboard",    "httpCode": 200, "consoleErrors": 0, "consoleWarns": 0, "status": "PASS" },
    { "route": "/test-cases",   "httpCode": 200, "consoleErrors": 0, "consoleWarns": 0, "status": "PASS" },
    { "route": "/releases",     "httpCode": 200, "consoleErrors": 0, "consoleWarns": 0, "status": "PASS" },
    { "route": "/reports",      "httpCode": 200, "consoleErrors": 0, "consoleWarns": 0, "status": "PASS" },
    { "route": "/admin",        "httpCode": 200, "consoleErrors": 0, "consoleWarns": 0, "status": "PASS" },
    { "route": "/users",        "httpCode": 200, "consoleErrors": 0, "consoleWarns": 0, "status": "PASS" },
    { "route": "/import-cases", "httpCode": 200, "consoleErrors": 0, "consoleWarns": 0, "status": "PASS" }
  ],
  "qaWalk": [
    { "route": "/dashboard",    "httpCode": 200, "consoleErrors": 0, "consoleWarns": 0, "status": "PASS" },
    { "route": "/test-cases",   "httpCode": 200, "consoleErrors": 0, "consoleWarns": 0, "status": "PASS" },
    { "route": "/releases",     "httpCode": 200, "consoleErrors": 0, "consoleWarns": 0, "status": "PASS" },
    { "route": "/reports",      "httpCode": 200, "consoleErrors": 0, "consoleWarns": 0, "status": "PASS" }
  ],
  "redirectChecks": [
    { "route": "/admin",        "expectedRedirect": "/dashboard", "actualUrl": "<url>", "status": "PASS" },
    { "route": "/users",        "expectedRedirect": "/dashboard", "actualUrl": "<url>", "status": "PASS" },
    { "route": "/import-cases", "expectedRedirect": "/dashboard", "actualUrl": "<url>", "status": "PASS" }
  ],
  "detailedTests": "<omit this key entirely when $MODE is smoke; include array below only when $MODE is detailed>",
  "downloadChecks": "<omit this key entirely when $DOWNLOADS is no; include array below only when $DOWNLOADS is yes>",
  "fontCheck": {
    "selfHostedOnly": true,
    "cdnHits": [],
    "status": "PASS"
  },
  "summary": {
    "total":  <count of all checks, including detailed test scenarios when $MODE is detailed>,
    "passed": <count where status=PASS>,
    "failed": <count where status=FAIL>,
    "skipped": <count where status=SKIPPED>,
    "verdict": "PASS"
  }
}
```

When `$MODE` is `detailed`, include `detailedTests` as an array:

```json
"detailedTests": [
  { "scenario": "D1", "prevCtx": "<value>", "newCtx": "<value>", "dashboardDocumentStatus": 200, "consoleErrors": 0, "status": "PASS" },
  { "scenario": "D2", "tcId": "<id>", "initialStatus": "<status>", "targetStatus": "<status>", "bulkStatusApiStatus": 200, "bulkAssignApiStatus": 200, "panelOpenedOnCheckbox": false, "consoleErrors": 0, "status": "PASS" },
  { "scenario": "D3", "tcId": "<id>", "panelOpened": true, "resultsApiStatus": 200, "statusChangeApiStatus": 200, "historyApiStatus": 200, "historyEntries": 3, "consoleErrors": 0, "status": "PASS" }
]
```

When `$DOWNLOADS` is `yes`, include `downloadChecks` as an array:

```json
"downloadChecks": [
  { "name": "Signoff PDF", "blobSizeBytes": 0, "blobType": "application/pdf",          "status": "PASS" },
  { "name": "Excel",       "blobSizeBytes": 0, "blobType": "application/octet-stream", "status": "PASS" }
]
```

`verdict` is `"PASS"` only when `failed === 0`. Any failure sets verdict to `"FAIL"`.

For FAIL entries, add a `"detail"` field with the error text, HTTP code, or console message verbatim.

---

## PASS / FAIL criteria

| Check         | PASS condition                                                    |
| ------------- | ----------------------------------------------------------------- |
| Route render  | HTTP 200 AND zero `[error]` console messages                      |
| QA redirect   | Final URL is `/dashboard` after navigating to restricted route    |
| Download blob | `size > 1024` bytes (at least 1 KB) — only checked when opted in  |
| Fonts         | No `fonts.googleapis.com` or `fonts.gstatic.com` in font requests |

Warnings (`[warn]`) do **not** cause FAIL — include them in the report for visibility.

---

## Common failure modes and what to check

| Symptom                                     | Likely cause                                                                                                                       |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `/login` returns 500                        | Barrel import `from '@mui/material'` in an RSC file — switch to targeted imports                                                   |
| Hydration error on any route                | Block element nested inside inline element (e.g. `<div>` inside `<span>`) or variantMapping not applied; check console diff output |
| `item` prop DOM warning                     | `<Grid item xs={N}>` — use Grid v2: `<Grid size={{ xs: N }}>`                                                                      |
| `InputLabelProps`/`SelectProps` DOM warning | Deprecated in MUI v9 — use `slotProps={{ inputLabel: … }}` and `slotProps={{ select: … }}`                                         |
| Download blob is empty or missing           | Interceptor was injected after the click, or the button was disabled — check snapshot for disabled state before clicking           |
| QA redirect does not fire                   | Role check is happening client-side instead of server-side in `page.js`                                                            |

---

## Notes

- Credentials are hardcoded above — do not read `seed-users.mjs` or `.env.local` at runtime.
- No DB seed step; assumes local Mongo is populated.
- `utils/__tests__/smoke.test.js` is a `1+1` sanity test — ignore it.
- The download interceptor patches `URL.createObjectURL` for the lifetime of the page tab. If multiple downloads are tested on the same page, reset `window.__smokeBlobs = []` before each click (the injector script above already does this).
- Port may be 3000–3099 depending on what is already running. Always parse from the server log.
- `softwareVersionTested` **no longer exists** — it has been removed from test cases entirely. Do not look for it on any form, API, or export.
- Result mutations (`POST /api/releases/[id]/results`, `PATCH /api/releases/[id]/results`), assignment mutations (`POST /api/assignments`), and test-case definition edits (`PATCH /api/releases/[id]/test-cases/[caseId]`) append entries to the `events` collection (audit log). Entries carry `tcId`, `releaseId`, `environment`, actor, and timestamp. A smoke test that fires these mutations and then queries `events` directly should find matching entries — category `result`, `assignment`, or `test_case`.
- Opening a test case's detail panel on `/test-cases` fires a single `GET /api/releases/[id]/results/[tcId]` returning the minimal per-environment execution rows (`environment`, `status`, `testedBy`, `testedOn`, `assignedTo`, `notes`) for that one case. It is a read route (admin+qa); it must not appear more than once per panel open and must not fan out per environment.
- The release/environment selector is a single combined searchable dropdown inside TopNav (right side, before the profile avatar), visible on every authenticated route including mobile. If it is missing on any route, the context wiring is broken.
- `POST /api/releases/[id]/snapshot` is a **mutation**: it replaces the stored GridFS PDF for the given (release, environment) and appends an audit event (`category: export`, `action: pdf`). It accepts multipart form data with fields `file` (PDF blob), `environment` (string), and `filename` (string). Returns `200` with the snapshot metadata doc on success; `400` if `environment` or `file` is missing; `404` if the release does not exist.
- `GET /api/releases/[id]/scope-counts` (read-only, `withTeam`) backs the Bulk Assign picker — returns test-case counts by scope for a given release. Admin and QA can call it; no mutation occurs.
- The Bulk Assign button in the test-cases FilterStrip is admin-only (UI gate); it is hidden for QA. Clicking it triggers `POST /api/assignments`, which is open to any team member at the API level.
- `GET /api/snapshots` returns the team-scoped saved-copy list — one entry per (release, environment), newest first.
- `GET /api/snapshots/[id]/download` streams the stored PDF bytes with `Content-Type: application/pdf` and `Content-Disposition: attachment; filename="<original filename>"`. Returns `404` if the snapshot does not exist or belongs to a different team.
- Archived releases must not appear in the default release selector dropdown; they must still be findable by typing in the selector's search input.
- Admin mutations on an archived release (edit, import, add result, add assignment) must return 409; verify with a direct API call if needed.
