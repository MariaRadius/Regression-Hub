# Jira Sync Throttle — Admin Settings

## Summary

Move the Jira story-watch sync throttle from a hardcoded constant to a per-team setting configurable from the Admin panel. Admins set the value in whole hours (1–24); the default is 1 hour, matching the previous hardcoded value.

## Approach

Store `jiraSyncThrottleHours` (integer) in the `settings` MongoDB document. `getTeamSettings` returns it with a default of `1`. The sync route reads it from `settings` (already fetched) and converts inline: `throttleHours * 3_600_000`. The hardcoded `JIRA_SYNC_THROTTLE_MS` constant is removed.

## Changes

### `lib/constants.js`
- Remove `JIRA_SYNC_THROTTLE_MS` (no remaining callers after this change).

### `lib/db/settingsData.js` — `getTeamSettings`
- Add `jiraSyncThrottleHours: settingsDoc?.jiraSyncThrottleHours ?? 1` to the returned shape.

### `app/api/admin/settings/route.js`
- Add `jiraSyncThrottleHours: z.number().int().min(1).max(24).optional()` to `patchBodySchema`.
- Add `jiraSyncThrottleHours: 'Jira sync throttle'` to `SETTING_LABELS`.

### `app/api/jira/sync-story-watches/route.js`
- Remove `JIRA_SYNC_THROTTLE_MS` import.
- Replace `Date.now() - JIRA_SYNC_THROTTLE_MS` with `Date.now() - settings.jiraSyncThrottleHours * 3_600_000`.

### `app/(app)/admin/AdminClient.jsx`
- Add `jiraSyncThrottleHours` (default `1`) to `dashboardSettings` and `savedSettings` state.
- Add to `isSettingsDirty` comparison.
- Add `jiraSyncThrottleHours: Number(dashboardSettings.jiraSyncThrottleHours)` to the `saveSettings` payload.
- Add a `TextField` (type number, min 1, max 24) inside the Jira Integration accordion with helper text `'How often Jira story data is re-fetched (1–24 hours)'`.

## Tests

### `app/api/jira/sync-story-watches/__tests__/route.test.js`
- Add `jiraSyncThrottleHours: 1` to every `getTeamSettings` mock return so the throttle cutoff calculation doesn't receive `undefined`.

### `app/api/admin/settings/__tests__/route.test.js`
- Add test: valid `jiraSyncThrottleHours` (e.g. `2`) → accepted (200).
- Add test: out-of-range value (e.g. `0` or `25`) → 400.

## Validation constraints
- Type: integer
- Min: 1, Max: 24
- Required: no (optional patch field; DB falls back to default `1` if never set)

## No behaviour changes
- Default is `1` hour — identical to the previous constant.
- The `force=true` query param on the sync route bypasses the throttle entirely and is unaffected.
