# Import Excel — Client-Offload Performance Redesign

- **Date:** 2026-06-01
- **Status:** Draft for review
- **Scope:** Reduce server load of the two-phase Excel import by parsing in the
  browser, sending a compact rows payload, parsing once instead of twice, and
  bulkifying the analyse phase. Delivered as independently-shippable phases.
- **Out of core scope:** result-row write amplification (tracked as a future
  Phase 5 below).

> **Implementation directive — clean-slate, no legacy.** This is a clean-slate
> redesign: no backward-compatibility shims, no dual-format paths. Clean as you
> go — when a change renders existing code redundant, remove it (unused imports,
> dead parameters, orphaned references, stale schemas) in the same commit. New
> code must be clean, idiomatic code written for the target design — not patchy
> additions layered onto the old shape.

---

## Problem

The two-phase import route (`POST /api/releases/[id]/import`, analyse →
confirm) is expensive on every server resource. Measured against the current
code:

| # | Cost | Where | Why it hurts |
|---|------|-------|--------------|
| 1 | Same file uploaded + SheetJS-parsed **twice** | `ImportCasesClient.jsx:99-101` then `:115-120`; re-parsed in `analyseImport` (`importExcelData.js:326`) **and** `commitImport` (`:524`) | 2× network transfer + 2× full parse for one logical import |
| 2 | Analyse = **O(N) sequential DB round-trips** | `analyseImport` awaits `resolveRowIdentity` per row (`:414`); each does up to 3 serial finds (`:158-194`) | A 2,000-row file ≈ up to ~6,000 serial queries. `commitImport` already uses `$in` bulk reads (`:614-674`); analyse never got the same treatment |
| 3 | **SheetJS on the Node runtime** | `XLSX.read` (`utils/excelImport.js:45`) | Synchronous → blocks the event loop for the whole parse; holds the entire workbook in heap (a 50 MB xlsx → 300–400 MB heap per SheetJS docs). Stalls other requests on the instance |
| 4 | Whole file **buffered in memory** | `Buffer.from(await file.arrayBuffer())` (`route.js:87`) | App Router route handlers cannot cap body size — large upload = memory spike + 413 risk |
| 5 | Dense-result **write amplification** | `generateDenseResults` writes one doc per (new case × environment) (`testResultsData.js:92-106`) | 1,000 new cases × 4 envs = 4,000 inserts on top of 1,000 case inserts. *(Phase 5 / future.)* |

**Confirmed constraints (from validation against current code):**

- Scale is medium: typical imports are 500–5,000 rows. A single request per
  phase is sufficient; streaming/chunked commit is **not** justified.
- All four resources (CPU, memory, DB, latency) are pain points, so the
  redesign must attack the parse, the payload, and the query count together.

## Goals / Non-goals

**Goals**

- Stop running SheetJS on the server.
- Transmit and parse the workbook exactly once per logical import.
- Make analyse cost independent of row count (bulk reads).
- Shrink the wire payload well below the raw `.xlsx`.
- Give instant, pre-upload, fail-loud validation via one shared pure-fn module.
- Keep a server process-safety floor (zod-shape + caps + the guards needed so a
  degenerate value can never 5xx) at all times. *(Full server-side data-quality
  re-validation is intentionally **not** done — decision B; this is a
  company-internal tool, so the client/API is authoritative for data quality.
  The floor exists only to guarantee the server never 5xxes on a malformed or
  degenerate body.)*

**Non-goals**

- Backward compatibility / dual-format shims (per the clean-slate directive above).
- Changing the import *semantics* (which rows create vs update) — except the one
  intentional correctness fix in Phase 2 (see Trust Boundary).
- Result-row write amplification (Phase 5, future track).

## Target architecture

The `.xlsx` never reaches the server: the browser parses it once, runs the
client validation machine (§Trust boundary), and sends the already-normalized
`rows` to a server that does only the process-safety floor, identity resolution,
and writes. Both server phases — analyse (preview) and commit — receive the same
`rows` payload.

## Trust boundary & validation contract

> **Context:** this is a company-internal admin tool — we trust the frontend data / API; the trust relaxation below is acceptable on that basis.

**Decision B — the client/API is authoritative for data quality.** This is a
company-internal admin tool, so the route's original rule (*"the BE must not
trust the client"*) is **deliberately relaxed for the data-quality gates**; the
server retains only a process-safety floor whose sole job is to guarantee it
never 5xxes. See §Security and §Risks.

- **Client owns parsing + all data-quality validation:** SheetJS parse, column
  canonicalization (`canonicalColumn`), required-column detection, text
  normalization, MIME/extension check, **and** the full fail-loud validation
  machine (shape, caps, override checks, gates a/c/d/e, status whitelist,
  in-file duplicate, and `testedBy` against a mount-fetched roster). For in-file
  dedup and app/module grouping the client **derives `slugify(testCase)`
  fingerprints locally** (the function is pure) **and transmits them** with the
  rows, so the server resolves identity without re-deriving them. Everything
  surfaces **before any upload** — instant feedback, zero round-trip. Packaged as
  one shared pure-fn module.
- **Server keeps only the unavoidable + the floor:** identity resolution and all
  writes (inherently server-side) — the server **trusts the client-sent
  `slugify(testCase)` fingerprint** for resolution rather than re-deriving it;
  plus a **process-safety floor** — zod body-shape + size caps
  (starting values: ≤ 10,000 rows — 2× the expected 5k ceiling — and ≤ 20,000
  chars per field, both tunable) **plus the minimal guards needed so a degenerate
  value can never 5xx** (see §Error handling). The data-quality gates are **not**
  re-applied server-side. The client sends the fingerprint but never a resolved
  identity.

Rationale: the heavy cost is the SheetJS parse (CPU + heap), now client-side.
Co-locating the cheap data-quality gates with the parse gives instant
pre-upload feedback and a single validation module; because this is an internal
tool we trust that result, and the server floor's only remaining job is to
guarantee no 5xx on a malformed or degenerate body.

### Wire row shape (13 fields — preserved exactly from `parseWorkbookBuffer`)

`applicationName`, `moduleName`, `type`, `traceability`, `testKey`, `testCase`,
`preconditions`, `steps`, `expectedResult`, `notes`, `status`, `testedBy`,
`testedOn`. (`softwareVersionTested` is intentionally **not** emitted, matching
current parser behavior, even though `canonicalColumn` maps it.)

Each transmitted row additionally carries the client-derived **`fingerprint`**
(`slugify(testCase)`) so the server resolves identity without re-deriving it
(decision B — trusted client/API).

## Phased plan

Every phase leaves import fully functional end-to-end and contains no
back-compat shims.

| Phase | Goal | Costs fixed | Ships alone? | Depends on |
|-------|------|-------------|:---:|:---:|
| 1 — Bulkify Analyse | `$in` batch resolution + characterization tests | #2 | ✅ | — |
| 2 — Client Parse + JSON Contract | Browser parses once; server stops running SheetJS | #1, #3, #4 | ✅ | reuses P1 logic |
| 3 — gzip the JSON body | native `CompressionStream` both ends, no format conversion | latency, residual #4 | ✅ | P2 |
| 4 — Web Worker *(optional)* | Parse off the main thread | client UX | ✅ | P2 |
| 5 — Lazy Dense Results *(future)* | Stop materializing case×env Pending rows | #5 | ✅ | — |

### Phase 1 — Bulkify Analyse

- **Step 1 (test-first, approved):** add characterization tests for
  `analyseImport` pinning current behavior, mirroring
  `lib/__tests__/db/importExcelData.test.js`. The semantics to lock:
  1. testKey found, same team, app+module names match → `update`.
  2. testKey found, different team → `reject` ("belongs to a different team").
  3. testKey found, app/module name mismatch → `reject` ("belongs to a
     different application or module").
  4. testKey provided but not in DB → fingerprint fallback **+ warning**
     ("Test Key X was not found — treated as new (fingerprint fallback)").
  5. no testKey, fingerprint matches (team-wide, newest-wins) → `update`.
  6. no testKey, no fingerprint match → `create`.
  7. in-file duplicate (same testKey, or same `appName::modName::fingerprint`)
     → both rows `reject`.
  8. preview mapping: reject rows excluded from `rows[]` but surfaced in
     `errors[]`; `valid = errors.length === 0`; `createCount`/`updateCount`;
     `proposedInitials` for new apps; `warnings[]`.
- **Step 2 (refactor):** replace the per-row `resolveRowIdentity` loop with the
  same `$in` batch reads + in-memory resolution `commitImport` already uses
  (`importExcelData.js:614-674`), preserving every semantic above. Route,
  client, and wire format unchanged — still uploads `.xlsx`, still parses
  server-side.
- **Files:** `lib/db/importExcelData.js` (analyse only); new
  `lib/__tests__/db/analyseImport` characterization tests.
- **Independently functional / done-when:** import behaves identically; analyse
  issues a bounded ~5 queries regardless of row count; all characterization
  tests green.
- **Carry-forward:** the bulk-resolution code is reused verbatim by Phase 2.

### Phase 2 — Client Parse + JSON Contract *(the offload)*

- **Scope:**
  - Move the parse stack to a client module: `parseWorkbookBuffer`,
    `canonicalColumn`, `normalizeText`, `mergeImportNotes`, required-column
    detection. Use the established `await import('xlsx')` dynamic-import pattern
    (precedent: `app/(app)/reports/ReportsClient.jsx:192`) so SheetJS stays
    code-split.
  - `ImportCasesClient.jsx`: parse once on file selection, hold normalized rows,
    send them as JSON for both analyse and commit (instead of the file).
  - Route: accept `application/json` with a `rows` array (not multipart). Drop
    MIME / `arrayBuffer` / `Buffer` handling. Wire a real zod request schema
    (see cleanup F3) — `releaseId` continues to come from the path param.
  - `analyseImport` and `commitImport`: take `rows` instead of `buffer`; remove
    the `parseWorkbookBuffer` calls and the server `xlsx` import.
  - **Shared resolver:** extract one identity-resolution function used by both
    analyse and commit. This eliminates the latent divergence found in
    validation — analyse currently resolves fingerprints **team-wide**
    (`:241`), commit resolves them **app+module-scoped** (`:644`), so the
    preview can disagree with the commit. The unified resolver adopts commit's
    app+module-scoped behavior (authoritative, since commit writes). **This is an
    intentional behavior change:** the preview becomes more accurate. The Phase 1
    characterization test for case (5) is updated here to reflect it.
    - **Test-Key scope reject (13/14) lives here.** The unified resolver carries
      the Test-Key team/app/module mismatch reject so it is enforced
      **server-side at resolution** in *both* analyse and commit. Today that
      reject exists only in analyse's per-row `resolveRowIdentity`; the commit
      bulk path silently forks/retargets. Moving it into the shared resolver is
      what makes the inventory's "13/14 → Exec → reject" actually true (this is
      the one integrity gate the server still actively enforces under decision B).
- **Validation model — client-authoritative (decision B).** All
  data-quality gates run **pre-upload in the browser** as a single reusable
  pure-function module, structured as **two client stages on the SheetJS parse
  boundary** (A = pre-parse, B = post-parse); the server keeps only a
  **process-safety floor**. The data-quality gates below are **not** re-checked
  server-side — this is an internal tool and we trust the client/API result.
  **Precondition (on mount,
  before A):** fetched once at screen load (not a gate; a failed fetch disables
  import with a load error) —
  - **team roster** via `GET /api/users` (`getUsers` returns **all** team
    members — every role, **including inactive** — which is exactly what gate (b)
    needs: it must recognize an inactive member's name, not reject it);
  - **known-apps map** via `GET /api/applications` (`listApplications` returns
    each app with its `initial`, already `Cache-Control: LONG`) — powers the
    apps preview.
  - **Stage A — pre-parse (fail-fast, first failure stops; never parse on
    failure):**
    - file guard: MIME/extension + **byte-size cap** (bounds what SheetJS will parse);
    - `teamId`/`releaseId`/`environment` present — release and environment are
      the active selection from the top **`ReleaseContextBar`** (there is no
      separate import-screen env picker); import writes result columns to that
      environment;
    - **release `archived`** and **environment declared** — both read from the
      `ReleaseContextBar` working-context (zero fetch). *Per decision B + KISS the
      server does not separately re-validate these — the client's check is
      trusted.*
    - override map is `^[A-Z0-9]{3}$` and has **no duplicate values**.
  - **— SheetJS parse —** the boundary. A parse error (9) fails fast; B never runs.
  - **Stage B — post-parse (single aggregating pass; efficient):** a structural
    **guard** runs first and fails fast — required columns present (11),
    **row-count + field-length caps**; then **one O(N) walk** collects
    app-names/fingerprints/test-keys **and** runs every row gate, accumulating
    **all** errors before rejecting once (`valid:false`):
    - override **keys ∈ apps** present in the rows;
    - (a) every unique `applicationName` has ≥ 1 alphanumeric character (else no
      initial can be derived). E.g. `Application "—" has no alphanumeric characters`.
    - (b) every non-empty `testedBy` must be a **member of the team** (any role,
      active **or** inactive). Fail-loud only when the name is not a team member
      at all (`Tested By "jdoe" is not a team member`); an **inactive** member is
      allowed and their name is **recorded as-is** (they tested while active —
      history is preserved). Validated against the mount-fetched roster.
    - (c) every non-empty `testedOn` parses to a real date that is **not in the
      future** (future evaluated in the viewer's local timezone per §10, stored
      UTC). E.g. `Row 14: Tested On "2026-13-40" is not a valid date` /
      `Row 14: Tested On cannot be in the future`.
    - (d) `testCase` and `expectedResult` non-blank after trim. E.g.
      `Row 14: Test Case is required`.
    - (e) every `applicationName`/`moduleName` ≤ 100 chars (tunable) and
      `moduleName` has ≥ 1 alphanumeric character. E.g.
      `Module "—" has no alphanumeric characters` / `Module name exceeds 100 characters`.
    - status whitelist: every non-empty `status` ∈ `COMPLETED_STATUSES` (now a
      hard reject, no longer coerced to blank).
    - in-file duplicate (12): two rows with the same Test Key, or the same
      `app::mod::fingerprint`, reject the import.
    - **Apps preview** (same walk): flag each app new-vs-existing and show the
      **proposed 3-char initial** for new ones (server remains authoritative on
      the final, DB-unique initial — collisions may differ).
- **Server process-safety floor (its only job: never 5xx):** the route
  **zod-validates the body shape** (right keys, right types, array present),
  enforces **byte/row/field caps** before iterating, and **guards every value
  that could otherwise throw** — notably the `deriveInitial` case: a
  new-application name with no alphanumeric characters is rejected with a
  clean **400** instead of throwing a 500. Identity resolution, upserts, dense
  results, and audit remain server-side (unavoidable). The floor does **not**
  re-run the data-quality gates — it only guarantees a malformed or degenerate
  body yields a 4xx, never a 5xx.
- **Server roles & the two previews (plain words):** the client validation
  machine runs *first*, entirely in the browser; if it fails, nothing is sent.
  Once it passes, the browser makes the **two existing server calls** with the
  same `rows` both times:
  1. **analyse** (`confirmed=false`) — the server does **not** re-check data
     quality (decision B). It runs only the floor + **identity resolution** to
     answer "which rows are brand-new test cases vs updates to existing ones,"
     and returns `createCount`/`updateCount`, any Test-Key (13/14) rejects, and
     warnings. The client *cannot* compute this itself because it has no
     `testCases` data — only the server knows what already exists.
  2. **commit** (`confirmed=true`) — the same resolution again, inside a
     transaction, then the writes.

  So there are **two different previews**, about two different things: the
  **client apps-preview** (new-vs-existing *applications* + proposed initials,
  from the known-apps map) appears instantly before upload; the **server analyse
  preview** (new-vs-existing *test cases* = create/update counts) comes back
  after the analyse round-trip. The user sees app-level hints immediately, then
  the exact case-level numbers once analyse returns.
- **Unhappy paths:** every data-quality failure is surfaced **in-browser
  pre-upload** (column/file errors, shape, caps, overrides, gates a–e, status,
  testedBy, in-file dup) — no round-trip; server floor rejects an oversized or
  schema-malformed body → 400; release/env state is reflected from client
  working-context (archived/undeclared blocked before upload).
- **Note:** `xlsx` stays in `package.json` (Reports needs it). "Remove server
  xlsx" means removing it from the server execution path only.
- **Independently functional / done-when:** import works end-to-end; server
  never runs SheetJS; `.xlsx` never transmitted; single parse in the browser.
- **Files:** `ImportCasesClient.jsx` (parse → run the pre-upload validation
  machine → preview → send), a new **shared pure-fn validation module** (e.g.
  `utils/importValidation.js` — framework-agnostic, no DB/fetch: shape gates,
  caps, override checks, Excel-only row gates a/c/d/e, status whitelist, in-file
  dup, testedBy-against-a-passed-roster), `app/api/releases/[id]/import/route.js`
  (server process-safety floor: zod-shape + caps + `deriveInitial` throw-guard),
  `lib/db/importExcelData.js` (take `rows`; drop the server parser; resolution +
  writes unchanged; the shared resolver carries the 13/14 reject),
  `utils/excelImport.js` (client parse only), the import screen's loader (fetch
  roster via `GET /api/users` + known-apps via `GET /api/applications` on mount;
  **no new endpoints needed**),
  `lib/schemas/import.js` (+ request schema), `lib/api/releases.js`; tests updated
  (commit tests pass `rows` in opts instead of mocking the parser; client tests
  cover the validation machine; route tests cover the server floor).

### Phase 3 — gzip the JSON body

- **Decision (locked):** keep the Phase 2 **JSON** payload exactly as-is and
  simply **compress it in transit** — no format conversion. The body stays
  `rows` (the 13 data fields + client-derived `fingerprint`), JSON-encoded, then
  gzipped. The free text dominates the payload and compresses well, so gzip alone
  brings it below the raw `.xlsx` (which is itself zip-compressed). No CSV codec,
  no positional/columnar format, no extra dependency — the round-trip is
  `JSON.stringify → gzip → gunzip → JSON.parse`.
- **Client:** `JSON.stringify(rows)` → `CompressionStream('gzip')` (browser-native,
  no dependency).
- **Server:** `await request.arrayBuffer()` → gunzip (Node `zlib`) →
  `JSON.parse` → `rows` → the **same Phase 2 server floor** (zod body-shape + caps
  + `deriveInitial` throw-guard; no data-quality re-check, per decision B). The
  only change from Phase 2 is the gunzip step before parse; the JSON contract,
  request schema, and query/header layout are otherwise identical.
- **Header:** `Content-Type: application/gzip` (unambiguous — avoids any proxy
  auto-decompressing a `Content-Encoding`-signalled request body).
- **Unhappy paths:** malformed/oversized gzip or non-JSON payload → 400.
- **Independently functional / done-when:** import works end-to-end; payload
  measurably smaller than Phase 2; round-trip + malformed-payload tests green.
- **Files:** `lib/api/releases.js` (gzip the JSON request);
  `app/api/releases/[id]/import/route.js` (gunzip → `JSON.parse` → rows). No new
  dependency.

### Phase 4 — Web Worker *(optional)*

- **Scope:** run Phase 2's parse in a worker (`new Worker(new URL(...))` +
  Turbopack worker support); propagate parse errors back as UI errors. This is
  the **only** phase needing new bundler config — Phase 2's main-thread parse is
  already proven by the `ReportsClient` precedent.
- **Unhappy paths:** worker load/parse failure → clear UI error (and/or
  main-thread fallback).
- **Independently functional / done-when:** import works; parsing a 5k-row file
  keeps the UI responsive.

### Phase 5 — Lazy Dense Results *(future track, out of core)*

- **Scope:** stop materializing one Pending `testResults` doc per (new case ×
  environment); materialize on first view/edit, or treat absence as Pending.
- **Why deferred:** changes the *read* model across dashboard, reports, and
  test-cases — a separate workstream with wide blast radius. Listed so it is not
  silently dropped; scoped and planned on its own.

## Cross-cutting

### Cleanup (clean-as-you-go, from validation)

- **Delete `lib/schemas/importExcel.js`** — orphaned `importExcelResponseSchema`
  (predates the releases refactor, lacks `releaseId`, zero importers).
- **Retire the unused `importBodySchema`** by replacing it with the real request
  schema wired into the route in Phase 2 (today the route hand-rolls FormData
  validation).

### Error handling

**Throw / aggregation contract** — aggregate *within* the aggregating stage,
fail-fast *between* stages:

- **On mount:** roster + known-apps fetch (precondition; a failure disables
  import with a load error, before A).
- **Stage A (pre-parse):** **fail-fast** — return the first failure and stop;
  the file is never parsed on an A failure.
- **SheetJS parse:** a parse error (9) fails fast; B never runs.
- **Stage B (post-parse):** a structural **guard** (required columns, row/field
  caps) fails fast; then the single row walk **aggregates every row×gate error**
  and rejects **once** with the full `errors[]` (`valid:false`). Never one throw
  per row, never one per gate.

The import button stays disabled while `valid === false`. The server adds only
the process-safety floor (zod-shape + caps + throw-guards), fail-fast with the
existing `{ error }` shape on a malformed/oversized/degenerate body. The
`deriveInitial` case (a new-app name with no alphanumeric characters) is guarded
here so it returns a clean **400**, never a 500 — that is the floor's purpose:
the server must never 5xx, even though it trusts the client for data quality.

#### Gate inventory (post-Phase-2)

`Side` = where it runs in the Phase-2 architecture; `Touches` = the data it reads
(Excel = payload/row content only, no DB). **Client gates are authoritative
(decision B); the server runs only the floor rows below — their sole job is to
prevent a 5xx, not to re-check data quality.**

| Gate | Stage | Side | Touches | Response |
|---|---|---|---|:---:|
| File guard (MIME/extension, byte-size) | A | Client | Excel file metadata | block (fail-fast) |
| teamId/releaseId/environment present (1,2,3) | A | Client | client working-context | block (fail-fast) |
| Release archived / env declared (6,7) | A | Client | client working-context (no fetch) | block (fail-fast) |
| Override regex / duplicate values (8,new) | A | Client | override map | block (fail-fast) |
| Workbook parse error (9) | parse | Client | Excel file only | block (fail-fast) |
| Required columns present (11) | B-guard | Client | parsed rows (headers) | block (fail-fast) |
| Row-count / field-length caps | B-guard | Client | parsed rows | block (fail-fast) |
| Override keys ∈ apps (new) | B-walk | Client | override map × row app-names | aggregate |
| App name alphanumeric (a) | B-walk | Client | Excel only | aggregate |
| Name length + module alnum (e) | B-walk | Client | Excel only | aggregate |
| testedOn valid + not-future (c) | B-walk | Client | Excel only | aggregate |
| Required-fields non-blank (d) | B-walk | Client | Excel only | aggregate |
| Status whitelist *(now hard)* | B-walk | Client | Excel only (vs constant) | aggregate |
| In-file duplicate (12) | B-walk | Client | Excel only (cross-row, in-memory) | aggregate |
| testedBy ∈ team member (b) | B-walk | Client | Excel × roster (mount fetch) | aggregate* |
| Payload byte / row / field caps | Floor | **Server** | raw body / `rows` | 400 (fail-fast) |
| zod body-shape | Floor | **Server** | `rows` (keys/types) | 400 (fail-fast) |
| App name alphanumeric (`deriveInitial` throw-guard) | Floor | **Server** | `rows` app-names | 400 (fail-fast) |
| Test-Key team/app/module scope (13,14) | Exec | Server | `testCases` (`$in`, batched) | reject |
| Identity resolution + upserts + dense results | Exec | Server | `testCases`/`testResults`/`sequences` | — |

\* gate (b) blocks only when `testedBy` is **not a team member at all**; an
inactive member passes and is recorded as-is.

### Security

Removing the file upload drops the file-type-spoofing surface but adds an
arbitrary-JSON surface. Because this is a company-internal admin tool behind
`withAdmin` + team scoping, we trust the client/API for data quality (decision
B) and do not re-validate the data-quality gates server-side. The **server
process-safety floor** (zod body-shape + byte/row/field caps + throw-guards
including `deriveInitial`) is retained for one reason: to guarantee the server
never 5xxes on a malformed or degenerate body.

## Testing strategy

- **Phase 1:** new `analyseImport` characterization tests (approved) lock the 8
  semantics; refactor keeps them green. Parser tests
  (`utils/__tests__/excelImport.test.js`) remain valid — pure function, now
  executed client-side.
- **Phase 2:** `commitImport`/`analyseImport` tests switch from mocking
  `parseWorkbookBuffer` to passing `rows` in opts; the case-(5) characterization
  test updated for the intentional app+module-scoped fix. **Validation machine
  tests (client, pure-fn module)** — one per gate: (a) degenerate app name; (b)
  non-member `testedBy` blocks, inactive member passes and is recorded as-is
  (pass a stub roster); (c) unparseable + future `testedOn`; (d) blank
  `testCase`/`expectedResult`; (e) over-long / degenerate module name; status
  off-whitelist; in-file duplicate; shape/caps/override checks. **Server floor
  tests (route)** — oversized body, schema-malformed body, and a degenerate
  app name (`deriveInitial` guard) → 400. Per decision B the server does **not**
  re-run the data-quality gates, so there are no server-side gate tests for a–e.
- **Phase 3:** `JSON.stringify → gzip → gunzip → JSON.parse` round-trip test over
  rows with multi-line free text (newlines, quotes, unicode) proving lossless,
  plus malformed/oversized-gzip → 400 tests. (JSON encoding handles the free-text
  edge cases natively — no quoting codec to stress.)
- **Phase 4:** parse error propagation (the parse fn itself is already covered;
  worker wiring verified manually — framework wiring is out of unit-test scope
  per project rules).
- Per project rule, new test additions in Phases 2–4 are confirmed at
  implementation time. Phase 1's characterization tests are pre-approved.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Phase 1 silently changes untested resolution behavior | Characterization tests first (approved) |
| Oversized/malformed/degenerate client payload → 5xx | Server process-safety floor: zod-shape + byte/row/field caps + throw-guards (incl. `deriveInitial`) → always a clean 4xx, never a 5xx |
| Forged payload bypasses client gates | Accepted by design — internal tool, trusted client/API (decision B). Bad *data* may be written, but the floor still guarantees no 5xx |
| Preview disagrees with commit (fingerprint scope) | Unified resolver in Phase 2 (also fixes the latent bug) |
| gzip / `CompressionStream` unsupported in an old browser | Baseline in all current evergreen browsers (internal admin tool); detect and error clearly if absent |
| Phase 4 worker bundling under Turbopack | Isolated to its own phase; main-thread parse (proven via Reports) is the fallback |
| Client bundle size from SheetJS | Already paid — `xlsx` is an existing client dep (Reports) |
| `/import-cases` render crash in smoke test | Appears stale: `app/(app)/layout.js:27` already wraps `ReleaseEnvProvider`; reconcile before Phase 2 manual testing |

## Open decisions

1. **Resolved:** wire format (Phase 3) is **gzipped JSON** — keep the Phase 2
   JSON payload, compress in transit, no CSV/format conversion. See Phase 3.
2. **Resolved:** both hardening items are **in scope**, fail-loud/fail-early — a
   degenerate app name (no alphanumerics) blocks the import, and a `testedBy` is
   gated by team membership: it blocks only when the name is **not a team member
   at all** (any role); an **inactive** member is allowed and recorded as-is.
   Folded into the Phase 2 validation machine (gates a, b).
3. **Resolved:** three further hardening gates are **in scope**, same fail-loud
   contract: (c) `testedOn` must be a valid, non-future date — closes the silent
   `Invalid Date` write and enforces the spec's "cannot be in the future" rule;
   (d) `testCase` and `expectedResult` must be non-blank — **promoted from the
   prior "drops to skip"** because the client now does the parsing; (e)
   `applicationName`/`moduleName` length ≤ 100 chars and `moduleName` carries ≥ 1
   alphanumeric, matching gate (a). Plus status whitelist becomes a hard reject,
   and 13/14 stay server-side at resolution. Folded into the Phase 2 validation
   machine.
4. **Resolved (decision B):** the validation machine is **client-authoritative**
   — all data-quality gates run pre-upload as one shared pure-fn module; the
   server keeps only a process-safety floor (zod-shape + caps + throw-guards to
   prevent a 5xx). This is a company-internal tool, so the trusted-client posture
   is the permanent design, not a deferred tradeoff. Notes in §Security and
   §Risks.

## Validation notes (against current code, 2026-06-01)

- `xlsx` already client-side via `ReportsClient.jsx:192` (`await import('xlsx')`).
- Only `analyseImport` + `commitImport` call `parseWorkbookBuffer`; blast radius
  contained.
- `lib/schemas/importExcel.js` orphaned; `importBodySchema` unused.
- Parser well-tested; analyse resolution untested → Phase 1 tests first.
- `ReleaseEnvProvider` is wired in `app/(app)/layout.js:27`; smoke-test crash
  predates the working tree.
