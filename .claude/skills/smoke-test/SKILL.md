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

### 2 — Verify tests pass

```bash
npm test
```

Stop if any test fails. Fix first.

### 3 — Start dev server

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

**All-role routes (5)** — both admin and QA walks visit these:
`/dashboard`, `/test-cases`, `/assignments`, `/releases`, `/reports`

**Admin-only routes (3)** — admin walk only:
`/admin`, `/users`, `/import-cases`

**QA redirect assertions (3)** — QA walk must confirm these redirect:
`/admin` → `/dashboard`, `/users` → `/dashboard`, `/import-cases` → `/dashboard`

---

## Role-gating rules (server-side, enforced in `page.js`)

| Route          | Admin | QA              |
| -------------- | ----- | --------------- |
| `/releases`    | PASS  | PASS (read-only mutations blocked) |
| `/test-cases`  | PASS  | PASS            |
| `/assignments` | PASS  | PASS (mutations blocked) |
| `/reports`     | PASS  | PASS            |
| `/import-cases`| PASS  | REDIRECT → `/dashboard` |
| `/admin`       | PASS  | REDIRECT → `/dashboard` |
| `/users`       | PASS  | REDIRECT → `/dashboard` |

Mutation routes (POST/PATCH/DELETE on `/api/releases/**`, `/api/assignments`, `/api/test-cases/**`) require admin except result recording (`/api/releases/[id]/results`) which is open to QA.

---

## Download surfaces — **all opt-in, skip by default**

> **Do not run any download check unless the user explicitly asked** (e.g. "also test downloads", "run download checks", "test the PDF/Excel export").

All downloads are generated **client-side** (no HTTP download response). Use the Blob interceptor below to capture file sizes.

| ID  | Page       | Button text          | What it generates     |
| --- | ---------- | -------------------- | --------------------- |
| A   | /reports   | "Export PDF Signoff" | jsPDF sign-off report |
| B   | /reports   | "Export Excel"       | xlsx workbook         |

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

## Step-by-step recipe

### PHASE 1 — Admin walk

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

#### Walk all 8 admin routes

For each route in order:
`/dashboard`, `/test-cases`, `/assignments`, `/releases`, `/reports`, `/admin`, `/users`, `/import-cases`

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

#### Download A — Signoff PDF (on /reports) — **opt-in only**

> **Skip unless the user explicitly asked to test downloads.**

Navigate to `/reports` (reuse if already there for Download B):

```
navigate_page type=url url="http://localhost:$SMOKE_PORT/reports" timeout=15000
```

Wait for the page to load (`wait_for` text=`["Export Excel"]` timeout=10000 `includeSnapshot: true`).

1. From the snapshot, find `button "Export PDF Signoff"` (in Custom Export panel)
2. `evaluate_script` → inject Blob interceptor (reset `__smokeBlobs = []`)
3. `click` the Export PDF Signoff button `includeSnapshot: true`
4. `wait_for` text `["Export PDF Signoff"]` timeout=20000 (button text reverts after generating)
5. `evaluate_script` → read `window.__smokeBlobs[0]`
6. Record: `{ name: "Signoff PDF", blobSize: <size>, blobType: <type>, status: size > 1024 ? "PASS" : "FAIL" }`

If `/reports` has no data, mark A as `SKIPPED` with reason "no data".

#### Download B — Excel (on /reports) — **opt-in only**

> **Skip unless the user explicitly asked to test downloads.**

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

#### Walk 5 QA-visible routes

Same per-route check as admin walk (navigate → console errors → HTTP 200):
`/dashboard`, `/test-cases`, `/assignments`, `/releases`, `/reports`

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
    { "route": "/assignments",  "httpCode": 200, "consoleErrors": 0, "consoleWarns": 0, "status": "PASS" },
    { "route": "/releases",     "httpCode": 200, "consoleErrors": 0, "consoleWarns": 0, "status": "PASS" },
    { "route": "/reports",      "httpCode": 200, "consoleErrors": 0, "consoleWarns": 0, "status": "PASS" },
    { "route": "/admin",        "httpCode": 200, "consoleErrors": 0, "consoleWarns": 0, "status": "PASS" },
    { "route": "/users",        "httpCode": 200, "consoleErrors": 0, "consoleWarns": 0, "status": "PASS" },
    { "route": "/import-cases", "httpCode": 200, "consoleErrors": 0, "consoleWarns": 0, "status": "PASS" }
  ],
  "qaWalk": [
    { "route": "/dashboard",    "httpCode": 200, "consoleErrors": 0, "consoleWarns": 0, "status": "PASS" },
    { "route": "/test-cases",   "httpCode": 200, "consoleErrors": 0, "consoleWarns": 0, "status": "PASS" },
    { "route": "/assignments",  "httpCode": 200, "consoleErrors": 0, "consoleWarns": 0, "status": "PASS" },
    { "route": "/releases",     "httpCode": 200, "consoleErrors": 0, "consoleWarns": 0, "status": "PASS" },
    { "route": "/reports",      "httpCode": 200, "consoleErrors": 0, "consoleWarns": 0, "status": "PASS" }
  ],
  "redirectChecks": [
    { "route": "/admin",        "expectedRedirect": "/dashboard", "actualUrl": "<url>", "status": "PASS" },
    { "route": "/users",        "expectedRedirect": "/dashboard", "actualUrl": "<url>", "status": "PASS" },
    { "route": "/import-cases", "expectedRedirect": "/dashboard", "actualUrl": "<url>", "status": "PASS" }
  ],
  "downloadChecks": "<omit this key entirely when downloads were not requested; include array below only when explicitly run>",
  "fontCheck": {
    "selfHostedOnly": true,
    "cdnHits": [],
    "status": "PASS"
  },
  "summary": {
    "total":  <count of all checks>,
    "passed": <count where status=PASS>,
    "failed": <count where status=FAIL>,
    "skipped": <count where status=SKIPPED>,
    "verdict": "PASS"
  }
}
```

When download checks **were** explicitly run, include `downloadChecks` as an array:

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
- Result mutations (`POST /api/releases/[id]/results`, `PATCH /api/releases/[id]/results`) and assignment mutations (`POST /api/assignments`, `DELETE /api/assignments/[id]`) each append entries to the `events` collection (audit log). Entries carry `caseId`, `releaseId`, `environment`, actor, and timestamp. A smoke test that fires these mutations and then queries `events` directly should find matching entries — category `result` or `assignment`.
- The `ReleaseContextBar` (persistent bar below TopNav) must be visible on every authenticated page; it shows the active release selector and environment toggle. If it is missing on any route, the context wiring is broken.
- Archived releases must not appear in the default release selector dropdown; they must still be findable by typing in the selector's search input.
- Admin mutations on an archived release (edit, import, add result, add assignment) must return 409; verify with a direct API call if needed.
