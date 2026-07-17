# Per-Release Jira Sprint ID

**Date:** 2026-06-19
**Ticket:** RXR-11849

## Problem

`JIRA_FIX_VERSION` is a global env var that assigns all Jira issues to a single fix version regardless of which release they belong to. With multiple sprints running in parallel, this breaks down — each release needs its own sprint mapping.

## Goal

Replace the global `JIRA_FIX_VERSION` env var with a per-release `jiraSprintId` field. When a Jira issue is created for a test failure, it gets assigned to the sprint associated with that release. If no sprint ID is set, the issue is still created — just without sprint assignment.

## Data Model

Add `jiraSprintId: string | null` to the release document in MongoDB. Stored as a string (user-supplied), converted to `Number` only when building the Jira API payload.

```js
// Release document (new field only)
{
  jiraSprintId: string | null  // e.g. "42"; null if not set
}
```

Remove `JIRA_FIX_VERSION` from `.env` and all code references.

## API Changes

### `POST /api/releases`
- Accept optional `jiraSprintId` (string) in request body
- Save to release document

### `PATCH /api/releases/[id]`
- Accept optional `jiraSprintId` (string) in request body
- Allow update after creation (so users can correct a wrong ID)

### Jira issue creation (`lib/server/jiraOnFail.js`)
- Read `release.jiraSprintId` when orchestrating issue creation
- Pass it through to `draftToJiraPayload`

### `draftToJiraPayload` (`lib/jiraIssue.js`)
- Replace `fixVersions` field with `customfield_10020: Number(jiraSprintId)` when sprint ID is present
- Omit the field entirely when absent — issue is still created

## Schema Changes (`lib/schemas/releases.js`)
- Add optional `jiraSprintId` field (string, nullable, trimmed)

## Frontend

### Release creation dialog
- Add optional plain text field: **"Jira Sprint ID"**
- Helper text: "Find this in your Jira board URL or sprint settings"
- Left blank → sprint assignment skipped; no validation error

### Release edit form/dialog
- Same field, pre-populated with current value
- Allows correction after creation

No changes to `JiraDraftReviewDialog` — sprint assignment is applied server-side transparently.

## Behaviour Summary

| Scenario | Result |
|---|---|
| Release has `jiraSprintId` set | Issue created and assigned to that sprint |
| Release has no `jiraSprintId` | Issue created, no sprint field in payload |
| Sprint ID is wrong/invalid | Jira returns error; surfaced to caller as today |

## Files Affected

| File | Change |
|---|---|
| `lib/schemas/releases.js` | Add optional `jiraSprintId` field |
| `lib/db/releasesData.js` | Include `jiraSprintId` in create + update |
| `app/api/releases/route.js` | Accept `jiraSprintId` in POST body |
| `app/api/releases/[id]/route.js` | Accept `jiraSprintId` in PATCH body |
| `lib/jiraIssue.js` | Replace `fixVersionName`/`fixVersions` with `sprintId`/`customfield_10020` |
| `lib/server/jiraOnFail.js` | Pass `release.jiraSprintId` into issue creation |
| `components/` (release create/edit dialog) | Add Jira Sprint ID text field |
| `.env` | Remove `JIRA_FIX_VERSION` |
| `lib/__tests__/jiraIssue.test.js` | Update tests: fixVersions → sprint field |
| `lib/server/__tests__/jiraOnFail.test.js` | Update env var stub → release field |

## Out of Scope

- Sprint dropdown fetched from Jira API (user enters ID manually)
- Fix version support (removed entirely)
- Validation that the sprint ID exists in Jira before saving
