# Events / Activity Log

**Date:** 2026-05-31
**Status:** Authoritative — single source of truth
**Jira:** RXR-11849
**Companion to:** `2026-05-31-version-release-env-minimal-spec.md` (the Releases × Environments domain model). That spec owns releases, environments, test cases, results, and assignments; **this spec owns the events (activity) log** that records changes across the whole application.

> This document is the **sole authority** for the events / activity log. The Releases × Environments spec deliberately carries no event-logging content; where the two meet, this document defines the logging behavior. This is a **decision document**, not an implementation plan — concrete schemas, indexes, and routes are left to the build phase.

> **Implementation-state dependency (as of 2026-05-31).** The companion Releases × Environments model is **not yet implemented** — it lands only when its own spec is built. Today the codebase has just `test-runs × softwareVersionTested`: a single `softwareVersionTested` string per test case (plus `history[].version` snapshots), and a team-level `testEnvironment` *setting*. There is **no first-class `environment` entity and no per-event `environment` field**. Therefore the `(version, environment)` framing in §6/§8 is the **target** design, not today's reality: the version dimension is the existing `softwareVersionTested` field, and the environment axis is **deferred** until the companion model lands (see Decision #15 and §6). Foundation (Phase 1) and the new emissions + cascade (Phases 2–3) do not depend on it; only the per-case read surface (Phase 4) does.

---

## 1. What the events log is

**Decision — a complete user activity log, not a results audit.** An append-only events log records every meaningful user action across the application: test-case edits, result changes, assignment changes, Excel imports, release lifecycle changes, **user authentication (login / logout), user management, data/report exports, and team configuration changes**. It is never edited or deleted by the application.

_Why full scope:_ "auditable in practice" means answering "who did what, when, and what did it overwrite" for the whole product surface — not only test results. Once results are mutable and last-write-wins, and once imports, logins, exports, and user-management actions all matter for accountability, the only complete answer is a single activity log.

**Named for events, not results.** Because it spans far more than results, it is modeled as a general **events** log (an activity/audit log). A result-tied name would mislead — it implies the log only tracks test-result changes, when it now records edits, assignments, imports, releases, logins, user management, exports, and config changes. The name throughout — collection, read/write helpers, constants, and any API surface — says _events_, not _result events_.

**Clean-slate rename.** The existing `resultEvents` collection and its helpers are renamed, not duplicated:

- collection `resultEvents` → **`events`**
- `appendResultEvent` / `appendResultEvents` / `listResultEvents` → `appendEvent` / `appendEvents` / `listEvents`
- `appendAssignmentEvents` keeps its fan-out role under the new module name
- `AUDIT_CATEGORY` / `AUDIT_ACTION` constants gain the new category and action values (see §3)

No backward-compatibility shim is kept — old names and the old collection reference are removed in the same change.

---

## 2. The two independent axes

Every event is classified on **two independent axes**. They do not move together — a single category can be cascade-retained yet write-only (e.g. `RELEASE`).

- **Retention axis** — _cascade-with-release_ (the event dies when its `version` is deleted) **vs** _never-purge_ (kept for the team's lifetime, removed only with the team).
- **Read-surface axis** — _per-case History_ (the event carries a `testCaseId` and surfaces in the test-case detail panel) **vs** _write-only_ (recorded now; no read UI yet).

This separation is the core of the model: retention is about _what the event belongs to_, while the read surface is about _where (if anywhere) it is shown today_.

---

## 3. Event taxonomy

Nine categories. Today's collection carries only `RESULT` and `ASSIGNMENT`; the rest are added.

| Category      | Actions                              | Carries `testCaseId`? | Retention            | Read surface       |
| ------------- | ------------------------------------ | --------------------- | -------------------- | ------------------ |
| `RESULT`      | `pass` · `fail` · `reset`            | ✅ (fan-out on bulk)  | cascade w/ version   | per-case History   |
| `TEST_CASE`   | `create` · `edit`                    | ✅ (fan-out on bulk)  | cascade w/ version   | per-case History   |
| `ASSIGNMENT`  | `assign` · `unassign`                | ✅                    | cascade w/ version   | per-case History   |
| `IMPORT`      | `import`                             | ✅ (fan-out per case) | cascade w/ version   | per-case History   |
| `RELEASE`     | `delete` · `complete` · `restore`    | ❌ (version-wide)     | cascade w/ version   | **write-only**     |
| `AUTH`        | `login` · `logout`                   | ❌                    | **never purge**      | write-only         |
| `USER`        | `create` · `update` · `role-change`  | ❌                    | never purge          | write-only         |
| `EXPORT`      | `excel` · `pdf`                      | ❌                    | never purge          | write-only         |
| `CONFIG`      | `settings-update` · `module-create`  | ❌                    | never purge          | write-only         |

### What is deliberately out of scope (no route yet)

Per "leave out until the routes land," these are **not** part of this spec because no route emits them today:

- **Environment add / remove** — environment is a string field on imported rows, not a managed entity with CRUD; there is no `ENVIRONMENT` category.
- **Release create** — releases are created implicitly by Excel import; the `IMPORT` event already records `softwareVersionTested`, so there is no `RELEASE/create`.
- **Test-case delete** and **user delete** — no delete routes exist; their events and cascade behavior are deferred to when those routes are built.

---

## 4. What gets recorded — event sources

Every mutating code path emits an event. Read-only `GET` routes emit nothing, **except** exports (see `EXPORT`), which are read actions we deliberately audit.

| Event                       | Source                                                       | Category → action                 |
| --------------------------- | ----------------------------------------------------------- | --------------------------------- |
| Result write                | `PATCH /api/test-cases/[id]` (status field)                 | `RESULT` → `pass`/`fail`/`reset`  |
| Bulk result reset           | `POST /api/test-cases/reset-team`                           | `RESULT` → `reset` (fan-out)      |
| Test-case create            | `POST /api/test-cases`                                      | `TEST_CASE` → `create`            |
| Test-case edit              | `PATCH /api/test-cases/[id]` (non-status fields)            | `TEST_CASE` → `edit`              |
| Test-case bulk edit         | `PATCH /api/test-cases-bulk`                                | `TEST_CASE` → `edit` (fan-out)    |
| Assignment create/reassign  | `POST /api/assignments`, `PATCH /api/assignments/[id]`      | `ASSIGNMENT` → `assign`           |
| Unassign                    | `DELETE /api/assignments/[id]`                              | `ASSIGNMENT` → `unassign`         |
| Excel import                | `POST /api/import-excel`                                    | `IMPORT` → `import` (fan-out)     |
| Release delete              | `DELETE /api/versions`                                      | `RELEASE` → `delete`              |
| Release complete            | `POST /api/versions/complete`                               | `RELEASE` → `complete`            |
| Release restore / retag     | `POST /api/versions/restore`                                | `RELEASE` → `restore`             |
| Login                       | NextAuth `events.signIn` (`lib/auth.js`)                    | `AUTH` → `login`                  |
| Logout                      | NextAuth `events.signOut` (triggered by the logout action) | `AUTH` → `logout`                 |
| User create                 | `POST /api/users`                                           | `USER` → `create`                 |
| User edit / role change     | `PATCH /api/users/[id]`                                     | `USER` → `update`/`role-change`   |
| Excel data export           | `GET /api/export-data`                                      | `EXPORT` → `excel`                |
| PDF report generation       | client-side (`utils/pdf/*`) → beacon `POST /api/events`     | `EXPORT` → `pdf`                  |
| Settings change             | `PUT /api/settings`                                         | `CONFIG` → `settings-update`      |
| Module create               | `POST /api/modules`                                         | `CONFIG` → `module-create`        |

**Bulk operations fan out per case.** Reset-team, bulk edit, and import each emit **one event per affected `testCaseId`** so the per-case History is complete. The cost is write volume; the benefit is that every case's timeline reflects every action that touched it.

**Two non-route write paths.** Two events do not originate from an ordinary API handler:

1. **Login / logout** are recorded in NextAuth's `events.signIn` / `events.signOut` hooks in `lib/auth.js`, where the authenticated user's `teamId` is available — keeping auth events team-isolated like everything else.
2. **PDF generation is client-side** (`utils/pdf/*`, `useDownloadTestRunReport`) with no server round-trip. It is recorded via a dedicated **beacon `POST /api/events`** the client calls on generation. Excel export already passes through `GET /api/export-data`, so it is logged server-side in that handler.

**The log is the recovery path for last-write-wins.** Result writes and assignments resolve last-write-wins with no concurrency token; the overwritten state survives as an earlier event in the log, so "what did this overwrite" is always answerable without a stored prior-value field. This is the recovery story behind the companion spec's last-write-wins decision.

---

## 5. Retention — cascade or never-purge

There is **no time-based expiry**. An event is removed only by one of two rules, set by its category's retention axis:

- **Cascade-with-release** (`RESULT`, `TEST_CASE`, `ASSIGNMENT`, `IMPORT`, `RELEASE`): deleting a release removes that release's events along with its test cases, results, and assignments. The cascade hooks into `deleteVersion` (`lib/db/versionsData.js`) and deletes events matching the team + `version`.
- **Never-purge** (`AUTH`, `USER`, `EXPORT`, `CONFIG`): kept for the team's lifetime, removed only when the team itself is deleted. These have no `version` to die with.

Because release deletion drives the only cascade, the cascade query MUST be scoped by category (or by the presence of a `version` field) so it can never purge never-purge events such as login history.

Test-case delete and environment removal are not yet routes (§3); their cascade behavior is deferred to when those routes are built, at which point this section is extended.

---

## 6. Reading the log — per-case history

The events log is not entirely write-only: a **"History" section in the test-case detail panel** makes the per-case timeline readable exactly where the actions happen. Account/system and release-wide events are **write-only for now** — recorded for the audit trail but exposed through no read UI in this iteration (a future admin activity console is the natural home; it is explicitly out of scope here).

- **What is readable today.** Only the per-case-readable categories — `RESULT`, `TEST_CASE`, `ASSIGNMENT`, `IMPORT` — i.e. events that carry a `testCaseId`.
- **Who can read it.** **All team members — both ADMIN and QA.** History reuses ordinary test-case visibility with no extra role gate, so the person who recorded a result can see who later overwrote it. _Why:_ "auditable in practice" means the people doing the testing can see the trail, not only supervisors. (When a future read surface exposes account/system events, that surface is likewise visible to all team members — no separate role gate was chosen.)
- **What it is scoped to.** _Today (interim — no per-event `environment` exists):_ the **active version (`softwareVersionTested`) context only** — History is scoped by team + `testCaseId` + the active `softwareVersionTested`, returning every per-case-readable event that touched this case in that version, with **no environment filtering** applied. _Target (gated on the companion Releases × Environments model — Decision #15):_ once events carry an `environment`, this narrows to the active `(version, environment)`, where "active environment" means _everything that affected this environment_ — not just env-tagged rows:
  - env-tagged events where `environment === activeEnv` (result writes, environment-scoped assignments), **plus**
  - env-agnostic events that still affect it — test-case edits (which apply to all environments and may reset this one's result), release-wide assignments (which cover this environment), and imports that touched this case.
  - Events tagged to a _different_ environment (e.g. a Production result write while you are viewing QA) are excluded.
- **What each entry shows.** **Actor · timestamp · action · before→after.** Timestamps are stored UTC and rendered in the viewer's local timezone (consistent with `testedOn` in the companion spec). The before→after transition is what delivers the "what did it overwrite" recovery story; the "before" value is **derived from the preceding event** in the timeline rather than duplicated onto every write (see §8).
- **How it loads.** **Lazily, via a dedicated `GET /api/test-cases/[id]/events` route** that reads from the events log, fetched on demand when the History section is opened for the selected case — never eagerly in the page or detail payload. The interim route filters by the active `softwareVersionTested`; an `?env=…` filter is added only when the companion environment model lands (Decision #15). Authentication is enforced in `proxy.js`; the handler reads `teamId` from `session.user` and MUST NOT re-check `!session`. This keeps the dense event stream off the initial load and fetches only the case actually being inspected.

---

## 7. Decisions on record

| #   | Decision                                                                                                                                                                              | Rationale                                                                                                                                                              |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Complete user activity log** — a general events log spanning results, edits, assignments, imports, release lifecycle, auth (login/logout), user management, exports, and config     | Complete "who/what/when/overwrote" traceability across the whole product, not just test results; a result-scoped name would understate what it records                |
| 2   | **Single `events` collection**, discriminated by `category`; `resultEvents` and its helpers are renamed clean-slate                                                                   | One data layer, one index set, one isolation suite; matches the "say _events_, not _result events_" intent without duplicating infrastructure                          |
| 3   | **Two independent axes** — retention (cascade-with-release vs never-purge) and read surface (per-case History vs write-only); a category can be cascade yet write-only               | Retention is about what an event belongs to; the read surface is about where it is shown — conflating them mis-models release-wide and account events                  |
| 4   | **The events log is the recovery path** for last-write-wins; overwritten state survives as an earlier event, no stored prior-value field                                              | Lets the companion spec's last-write-wins decision drop the concurrency token while keeping overwrites recoverable                                                     |
| 5   | **Bulk operations fan out per case** (reset-team, bulk edit, import emit one event per affected `testCaseId`)                                                                         | Keeps each case's per-case History complete; accepted cost is higher write volume                                                                                     |
| 6   | **Login + logout are recorded** via NextAuth `events.signIn`/`events.signOut`; PDF generation via a client beacon `POST /api/events`; Excel export logged server-side                 | Captures auth and export activity that does not flow through ordinary mutation routes, while staying team-isolated                                                     |
| 7   | **Config mutations are in scope** (`settings-update`, `module-create`); only module creation has a route today, so application-create is excluded until its route lands                | "Who changed team config" is a meaningful accountability trail                                                                                                        |
| 8   | **Out of scope until routes land** — environment add/remove (no `ENVIRONMENT` category), release create (implicit via import), test-case delete, user delete                          | No route emits these today; documenting non-existent flows would be speculative                                                                                       |
| 9   | **Retention is cascade-or-never** — cascade categories die with their release (`deleteVersion`); never-purge categories live for the team's lifetime; no age purge                    | Keeps "who overwrote this" answerable for the life of release data while preserving long-lived auth/user/export/config history                                         |
| 10  | **Per-case History is the only read surface today**; account/system and release-wide events are write-only (future admin console out of scope)                                       | Smallest read surface that makes the entity trail "auditable in practice"; defers a console until there is demand                                                     |
| 11  | **Visible to all team members (ADMIN + QA)**, no extra role gate                                                                                                                      | The testers, not just supervisors, must see who overwrote their result; reuses ordinary case visibility                                                               |
| 12  | **Per-case History is scoped to the active version (`softwareVersionTested`) today**, narrowing to the active `(version, environment)` — including env-agnostic events that affect that env (edits, release-wide assignments, imports) — once the companion environment model lands | Matches what the user is looking at while still explaining _why_ a result changed; a different env's writes stay out of the timeline once environment exists            |
| 13  | **Events are team-isolated** — `teamId` injected through the data layer, asserted by the cross-team isolation suite                                                                   | Same data-leak protection the companion spec applies to releases, cases, results, and assignments                                                                     |
| 14  | **Backups / observability defer to existing infrastructure** — no new backups or metrics for the log beyond the platform's, plus the in-app per-case history surface                  | Lowest effort for launch; the append-only log is itself the in-app audit record                                                                                       |
| 15  | **The environment axis is a forward dependency on the unbuilt Releases × Environments model.** Today's domain is `test-runs × softwareVersionTested`: there is no `environment` entity or per-event `environment` field. The version dimension is the existing `softwareVersionTested` string; the per-event `environment` field, env-scoped reads, and the `?env=` route param are **deferred** until the companion model lands. Phases 1–3 (foundation, emissions, cascade) are unaffected; only Phase 4 (per-case read surface) consumes it, and until environment exists Phase 4 scopes by `softwareVersionTested` only. | Documents the real implementation-state gap surfaced during planning so the build does not assume a model that does not yet exist; keeps every phase shippable on today's schema |

---

## 8. Build-phase guidance (decided)

These are _how-to-build_ decisions — not domain-model rules, but settled so the implementation doesn't re-litigate them.

| Area                        | Decision                                                                                                                                                                                                                                                                                                                                                                    | Why / trade-off                                                                                                                                                                                                              |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Collection & helpers**    | Rename `resultEvents` → `events`; `appendResultEvent`/`appendResultEvents`/`listResultEvents` → `appendEvent`/`appendEvents`/`listEvents`; keep `appendAssignmentEvents` fan-out. Extend `AUDIT_CATEGORY`/`AUDIT_ACTION` in `lib/constants.js` with the nine categories and their actions. Remove old names — no shim.                                                          | One module, one collection; constants stay the single source of enum literals (no hardcoded category/action strings in routes).                                                                                            |
| **Event shape**             | Each event carries `teamId`, `category`, `action`, `by` (actor), `at` (UTC). Entity events additionally carry `testCaseId`, `softwareVersionTested` (the current version dimension), and the existing `externalId`, `status`, `notes`, `assignmentId`, `assignedTo` where relevant. A per-event `environment` field is **not** added now — it lands only with the companion Releases × Environments model (Decision #15). Account/system events carry the relevant target (e.g. `targetUserId` for `USER`, `reportType` for `EXPORT/pdf`). Unused fields are `null`. | A single flexible document shape over one collection; nullable fields keep the discriminated union in one place; the version dimension reuses the existing `softwareVersionTested` field rather than introducing a parallel `version` field. |
| **Read path**               | A dedicated **`GET /api/test-cases/[id]/events`** route, auth via `proxy.js`, `teamId` from `session.user`, calling `listEvents` scoped by `softwareVersionTested` on top of team + test-case scoping, and restricted to per-case-readable categories. Loaded lazily when the History section opens. The `?env=` query param and env filter (`environment === activeEnv` **OR** env-agnostic) are **deferred** until the companion environment model lands (Decision #15). | Keeps the dense event stream off initial load; fetches only the inspected case; account/system categories never leak into the per-case view.                                                                               |
| **Write beacon**            | A **`POST /api/events`** route accepts a client-reported `EXPORT/pdf` event (report type, optional `version`), auth via `proxy.js`, `teamId` from `session.user`. It accepts only the client-only categories it is meant for and rejects others, so the beacon cannot be used to forge result/assignment history.                                                              | Captures client-side PDF generation without trusting the client to write arbitrary event types.                                                                                                                          |
| **Auth events**             | Login/logout written in `lib/auth.js` via NextAuth `events.signIn`/`events.signOut`, reading `teamId` from the authenticated user/token. The `events.*` hooks are used (not the `callbacks.*`), so logging never alters the auth result.                                                                                                                                       | Auth audit without entangling token/session logic; logout fires from the logout action.                                                                                                                                   |
| **Before→after derivation** | The "before" value in a History entry is **reconstructed from the preceding event** for that (case, env, field), not stored as a redundant prior-value field on every write.                                                                                                                                                                                                  | Avoids widening every event write; the append-only log already holds the prior state as its own earlier row. Trade-off: the renderer walks the ordered stream to pair transitions rather than reading one self-contained row. |
| **Cascade**                 | `deleteVersion` deletes events matching team + `version` for cascade categories only (guard by category / presence of `version`). Never-purge categories are excluded so login/user/export/config history survives release deletion.                                                                                                                                          | Structural guarantee that the only cascade path cannot erase long-lived account history.                                                                                                                                  |
| **Cross-team isolation**    | Reads/writes inject `teamId` through the data layer, and the two-team isolation suite asserts team A can never read or write team B's events (across all categories, including auth/user/export/config).                                                                                                                                                                       | Structural prevention _and_ proof against the highest-impact data-leak class.                                                                                                                                            |
