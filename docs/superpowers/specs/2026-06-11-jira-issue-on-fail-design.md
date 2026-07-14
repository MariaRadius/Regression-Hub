# Jira Issue Creation on Test Failure — Design

**Date:** 2026-06-11
**Status:** Approved by Maria

## Goal

When a QA marks a test case as Fail, test-atlas creates a Jira issue in the
team's Jira Cloud instance (`irisvisionglobal.atlassian.net`), pre-filled with the
failure details, and links it to the test case's existing user story (`jiraStory`).

## Configuration

### Environment variables (server-only, never stored in DB or shown in UI)

| Var | Example | Notes |
|-----|---------|-------|
| `JIRA_BASE_URL` | `https://irisvisionglobal.atlassian.net` | No trailing slash |
| `JIRA_EMAIL` | `maria@radiusxr.com` | Account that owns the API token |
| `JIRA_API_TOKEN` | *(secret)* | Atlassian API token; Basic auth `base64(email:token)` |

Any missing var → integration disabled; result recording is unaffected.

### Admin setting (per team, existing `settings` collection)

- `jiraIssueMode`: `'off' | 'ask' | 'auto'`, default `'ask'`.
  - `off` — never create issues.
  - `ask` — fail dialogs show a pre-checked "Create Jira issue" checkbox; client
    sends `createJiraIssue` boolean with the result.
  - `auto` — server always creates on Fail, no checkbox shown.
- Constants exported as `JIRA_ISSUE_MODES` from `@/lib/constants`.
- Changes audit-logged like other settings changes.

## Trigger & flow

On `POST /api/releases/[id]/results` recording a **Fail**:

1. Skip unless mode permits (`auto`, or `ask` + `createJiraIssue: true`), env vars
   present, and the test case has a `jiraStory`. Missing story → response includes
   `jiraSkipped: 'no-linked-story'`.
2. **Issue type by environment:** `Production` → `Bug`; any other environment
   (QA, Sandbox, custom) → `Test Issue`. (Verified: both exist in project RXR.)
3. **Project:** derived from the story key (`RXR-9012` → project `RXR`).
4. Create issue via Jira REST API v3, then link to the user story with a
   **"Relates"** issue link.
5. Store the created key on the result record (`jiraIssueKey`); UI renders a chip
   linking to the Jira issue.

## Issue content

- **Summary:** `[<Environment>] <Test case title> — failed in <Release name>`
- **Description (ADF):** test case id/module/priority, release + environment,
  failure comments from the fail dialog, recorded-by user, link back to the test
  case in test-atlas (`NEXT_PUBLIC_APP_URL`).

## Failure handling

Jira errors never block result recording. Result saves first; on Jira failure the
API response includes `jiraError` (message string) and the UI shows a warning
toast. 401/403 → token hint; 404 on link → story-not-found hint. No retry queue
in v1.

## Code layout

- `lib/server/jiraClient.js` — server-only Jira REST wrapper (auth header,
  `createIssue`, `linkIssues`, error normalization).
- `lib/jiraIssue.js` — pure payload builder + issue-type selection (unit-tested).
- Results route calls the above; no inline fetches/queries in route files.
- `lib/schemas/settings.js`, `lib/db/settingsData.js`,
  `app/api/admin/settings/route.js`, `app/(app)/admin/AdminClient.jsx` — extended
  for `jiraIssueMode`.
- Fail dialogs (single + bulk) gain the `ask`-mode checkbox.
- README + `.claude/skills/smoke-test/SKILL.md` updated in the same change set.

## Amendment (2026-06-12): review-before-create + richer content

Approved changes:

1. **Description template** now includes the test case's Steps to Reproduce
   (TipTap HTML flattened to plain text via `utils/htmlToPlainText`), Expected
   Result, and Actual Result (the QA's failure notes), alongside the existing
   metadata lines.
2. **Ask mode = editable review.** Result recording no longer creates issues in
   ask mode. Instead: client records the Fail → `POST
   /api/releases/[id]/jira-drafts` ({environment, tcIds, notes}) returns one
   editable draft per case ({tcId, summary, description} | {tcId, reason}) →
   a stepper dialog lets QA edit summary/description and Create or Skip per
   ticket → `POST /api/releases/[id]/jira-issues` ({environment, issues}) creates
   them. Project key, issue type, story link, and the `test-atlas` label are
   re-derived server-side; the client controls only summary/description text.
3. **Automatic mode unchanged** — server-side creation during result recording
   (`jiraOnFail` now runs only in auto mode; the `createJiraIssue` request flag
   is gone).

## Amendment (2026-06-12, later): fix version, multi-ticket rows, env casing

1. **`JIRA_FIX_VERSION` env var** (set to `testRelease`): every created issue
   gets that Jira Release as its Fix Version. The version must already exist in
   the target project; unset = field omitted.
2. **Multiple tickets per (case × environment)**: result rows now store
   `jiraIssueKeys` (array, `$push` on each creation). Legacy `jiraIssueKey`
   docs are folded into the array on read. Detail panel renders one chip per key.
3. **Environment casing**: live data stores `PRODUCTION`/`SANDBOX` (uppercase),
   so the Production→Bug mapping is case-insensitive.

## Testing

- `lib/jiraIssue.js`: type-by-environment, project derivation, summary/ADF shape,
  missing-story error.
- `lib/server/jiraClient.js`: auth header, success parse, 401/404/5xx mapping
  (fetch mocked).
- Results route: fail + Jira success, fail + Jira error (result still saved),
  mode off, ask-mode opt-out.
