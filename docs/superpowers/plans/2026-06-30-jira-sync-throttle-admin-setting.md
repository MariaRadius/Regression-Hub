# Jira Sync Throttle — Admin Setting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the Jira story-watch sync throttle as a per-team setting (1–24 hours) configurable from the Admin panel, replacing the hardcoded 1-hour constant.

**Architecture:** `jiraSyncThrottleHours` is stored in the `settings` MongoDB document and returned by `getTeamSettings` with a default of `1`. The sync route reads it from the already-fetched `settings` object and converts to ms inline. The Admin UI adds a number field inside the existing Jira Integration accordion. The hardcoded `JIRA_SYNC_THROTTLE_MS` constant is deleted.

**Tech Stack:** Next.js App Router, MongoDB, MUI v9, Zod, Vitest

---

### Task 1: Add `jiraSyncThrottleHours` to `getTeamSettings`

**Files:**
- Modify: `lib/db/settingsData.js`
- Test: `lib/__tests__/db/settingsData.test.js` (or nearest existing test — check with `find lib/__tests__ -name "settingsData*"`)

- [ ] **Step 1: Write the failing test**

Open `lib/__tests__/db/settingsData.test.js`. Add inside the `getTeamSettings` describe block (or top-level if no describe):

```js
it('returns jiraSyncThrottleHours from the settings doc', async () => {
  db.collection('settings').findOne.mockResolvedValue({
    teamId: 't1',
    jiraSyncThrottleHours: 4,
  });
  db.collection('users').find.mockReturnValue({
    sort: () => ({ toArray: () => Promise.resolve([]) }),
  });
  const result = await getTeamSettings(db, 't1');
  expect(result.jiraSyncThrottleHours).toBe(4);
});

it('defaults jiraSyncThrottleHours to 1 when not set', async () => {
  db.collection('settings').findOne.mockResolvedValue(null);
  db.collection('users').find.mockReturnValue({
    sort: () => ({ toArray: () => Promise.resolve([]) }),
  });
  const result = await getTeamSettings(db, 't1');
  expect(result.jiraSyncThrottleHours).toBe(1);
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
npx vitest run lib/__tests__/db/settingsData.test.js
```

Expected: FAIL — `jiraSyncThrottleHours` is `undefined`, not `4` or `1`.

- [ ] **Step 3: Add the field to `getTeamSettings`**

In `lib/db/settingsData.js`, inside the returned object of `getTeamSettings`, add after `aiApiKey`:

```js
jiraSyncThrottleHours: settingsDoc?.jiraSyncThrottleHours ?? 1,
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
npx vitest run lib/__tests__/db/settingsData.test.js
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/db/settingsData.js lib/__tests__/db/settingsData.test.js
git commit -m "RXR-11849: Add jiraSyncThrottleHours to getTeamSettings (default 1)"
```

---

### Task 2: Update the sync route to read throttle from settings

**Files:**
- Modify: `app/api/jira/sync-story-watches/route.js`
- Test: `app/api/jira/sync-story-watches/__tests__/route.test.js`

- [ ] **Step 1: Add `jiraSyncThrottleHours` to the mock in the test file**

In `app/api/jira/sync-story-watches/__tests__/route.test.js`, the `beforeEach` block has:

```js
getTeamSettings.mockResolvedValue({
  jiraBaseUrl: 'https://example.atlassian.net',
  jiraApiToken: 'tok',
});
```

Change it to:

```js
getTeamSettings.mockResolvedValue({
  jiraBaseUrl: 'https://example.atlassian.net',
  jiraApiToken: 'tok',
  jiraSyncThrottleHours: 1,
});
```

- [ ] **Step 2: Run the existing tests to confirm they still pass before touching the route**

```bash
npx vitest run app/api/jira/sync-story-watches/__tests__/route.test.js
```

Expected: all PASS (the mock change is additive; the route still uses the constant).

- [ ] **Step 3: Write a new test that proves the throttle window comes from settings**

Add at the end of the `describe` block in the test file:

```js
it('uses jiraSyncThrottleHours from settings to compute the throttle cutoff', async () => {
  // Set throttle to 2 hours via settings
  getTeamSettings.mockResolvedValue({
    jiraBaseUrl: 'https://example.atlassian.net',
    jiraApiToken: 'tok',
    jiraSyncThrottleHours: 2,
  });
  listDistinctStoryKeys.mockResolvedValue(['SAP-1']);
  // jiraCheckedAt is 90 min ago — within 2-hour window, so should NOT refresh
  const ninetyMinAgo = new Date(Date.now() - 90 * 60 * 1000);
  listStoryWatches.mockResolvedValue([
    {
      storyKey: 'SAP-1',
      jiraCheckedAt: ninetyMinAgo,
      jiraUpdatedAt: new Date('2026-05-01T00:00:00Z'),
      acknowledgedAt: null,
    },
  ]);

  await POST(REQ, {});

  expect(getIssuesByKeys).not.toHaveBeenCalled();
});
```

- [ ] **Step 4: Run to confirm the new test fails**

```bash
npx vitest run app/api/jira/sync-story-watches/__tests__/route.test.js
```

Expected: the new test FAILS — the route still uses `JIRA_SYNC_THROTTLE_MS` (1 hour), so it tries to refresh the 90-min-old record.

- [ ] **Step 5: Update the sync route**

In `app/api/jira/sync-story-watches/route.js`:

1. Remove the `JIRA_SYNC_THROTTLE_MS` import from the top of the file. The import line currently reads:
   ```js
   import {
     JIRA_STORY_SYNC_BATCH_LIMIT,
     JIRA_SYNC_THROTTLE_MS,
   } from '@/lib/constants';
   ```
   Change it to:
   ```js
   import { JIRA_STORY_SYNC_BATCH_LIMIT } from '@/lib/constants';
   ```

2. Replace the throttle cutoff line (currently `const throttleCutoff = new Date(Date.now() - JIRA_SYNC_THROTTLE_MS);`) with:
   ```js
   const throttleCutoff = new Date(Date.now() - settings.jiraSyncThrottleHours * 3_600_000);
   ```

- [ ] **Step 6: Run the tests to confirm all pass**

```bash
npx vitest run app/api/jira/sync-story-watches/__tests__/route.test.js
```

Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add app/api/jira/sync-story-watches/route.js app/api/jira/sync-story-watches/__tests__/route.test.js
git commit -m "RXR-11849: Read sync throttle from team settings instead of constant"
```

---

### Task 3: Remove `JIRA_SYNC_THROTTLE_MS` constant

**Files:**
- Modify: `lib/constants.js`

- [ ] **Step 1: Verify no remaining callers**

```bash
grep -r "JIRA_SYNC_THROTTLE_MS" /Users/Maria/Downloads/regression-hub --include="*.js" --include="*.ts" --include="*.tsx"
```

Expected: no output. If any file still imports it, fix that file first before continuing.

- [ ] **Step 2: Delete the constant**

In `lib/constants.js`, remove the line:

```js
export const JIRA_SYNC_THROTTLE_MS = 60 * 60 * 1000; // re-fetch at most once per hour
```

- [ ] **Step 3: Run the full test suite to confirm nothing broke**

```bash
npx vitest run
```

Expected: all PASS

- [ ] **Step 4: Commit**

```bash
git add lib/constants.js
git commit -m "RXR-11849: Remove unused JIRA_SYNC_THROTTLE_MS constant"
```

---

### Task 4: Accept `jiraSyncThrottleHours` in the admin settings API

**Files:**
- Modify: `app/api/admin/settings/route.js`
- Test: `app/api/admin/settings/__tests__/route.test.js`

- [ ] **Step 1: Write the failing tests**

In `app/api/admin/settings/__tests__/route.test.js`, add at the end of the `describe` block:

```js
it('saves a valid jiraSyncThrottleHours', async () => {
  updateTeamSettings.mockResolvedValue(undefined);
  const res = await PATCH(makeRequest({ jiraSyncThrottleHours: 2 }));
  expect(res.status).toBe(200);
  expect(updateTeamSettings).toHaveBeenCalledWith(db, 't1', {
    jiraSyncThrottleHours: 2,
  });
});

it('rejects jiraSyncThrottleHours below 1', async () => {
  const res = await PATCH(makeRequest({ jiraSyncThrottleHours: 0 }));
  expect(res.status).toBe(400);
});

it('rejects jiraSyncThrottleHours above 24', async () => {
  const res = await PATCH(makeRequest({ jiraSyncThrottleHours: 25 }));
  expect(res.status).toBe(400);
});
```

- [ ] **Step 2: Run to confirm the new tests fail**

```bash
npx vitest run app/api/admin/settings/__tests__/route.test.js
```

Expected: the three new tests FAIL — the field is not in the Zod schema so it gets stripped and `updateTeamSettings` isn't called with it (valid case returns 400 from "No settings provided"; invalid cases may also 400 but for the wrong reason).

- [ ] **Step 3: Add the field to the route**

In `app/api/admin/settings/route.js`:

1. Add to `patchBodySchema`:
   ```js
   jiraSyncThrottleHours: z.number().int().min(1).max(24).optional(),
   ```

2. Add to `SETTING_LABELS`:
   ```js
   jiraSyncThrottleHours: 'Jira sync throttle',
   ```

- [ ] **Step 4: Run to confirm all tests pass**

```bash
npx vitest run app/api/admin/settings/__tests__/route.test.js
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/settings/route.js app/api/admin/settings/__tests__/route.test.js
git commit -m "RXR-11849: Accept jiraSyncThrottleHours in admin settings PATCH"
```

---

### Task 5: Add the throttle field to the Admin UI

**Files:**
- Modify: `app/(app)/admin/AdminClient.jsx`

This task has no unit tests (it's a client component); manual smoke-testing is specified at the end.

- [ ] **Step 1: Add `jiraSyncThrottleHours` to `dashboardSettings` initial state**

Find this block (around line 264):

```js
const [dashboardSettings, setDashboardSettings] = useState({
  failureThreshold: settings?.failureThreshold ?? 5,
  topModulesLimit: settings?.topModulesLimit ?? 5,
  jiraIssueMode: settings?.jiraIssueMode ?? JIRA_ISSUE_MODE_DEFAULT,
  jiraBaseUrl: settings?.jiraBaseUrl ?? '',
  jiraEmail: settings?.jiraEmail ?? '',
  jiraApiToken: settings?.jiraApiToken ?? '',
  aiProvider: settings?.aiProvider ?? null,
  aiApiKey: settings?.aiApiKey ?? '',
});
```

Add `jiraSyncThrottleHours` after `jiraApiToken`:

```js
const [dashboardSettings, setDashboardSettings] = useState({
  failureThreshold: settings?.failureThreshold ?? 5,
  topModulesLimit: settings?.topModulesLimit ?? 5,
  jiraIssueMode: settings?.jiraIssueMode ?? JIRA_ISSUE_MODE_DEFAULT,
  jiraBaseUrl: settings?.jiraBaseUrl ?? '',
  jiraEmail: settings?.jiraEmail ?? '',
  jiraApiToken: settings?.jiraApiToken ?? '',
  jiraSyncThrottleHours: settings?.jiraSyncThrottleHours ?? 1,
  aiProvider: settings?.aiProvider ?? null,
  aiApiKey: settings?.aiApiKey ?? '',
});
```

- [ ] **Step 2: Add `jiraSyncThrottleHours` to `savedSettings` initial state**

Find the `savedSettings` useState (around line 275). Apply the same addition:

```js
const [savedSettings, setSavedSettings] = useState(() => ({
  failureThreshold: settings?.failureThreshold ?? 5,
  topModulesLimit: settings?.topModulesLimit ?? 5,
  jiraIssueMode: settings?.jiraIssueMode ?? JIRA_ISSUE_MODE_DEFAULT,
  jiraBaseUrl: settings?.jiraBaseUrl ?? '',
  jiraEmail: settings?.jiraEmail ?? '',
  jiraApiToken: settings?.jiraApiToken ?? '',
  jiraSyncThrottleHours: settings?.jiraSyncThrottleHours ?? 1,
  aiProvider: settings?.aiProvider ?? null,
  aiApiKey: settings?.aiApiKey ?? '',
}));
```

- [ ] **Step 3: Add to `isSettingsDirty`**

Find the `isSettingsDirty` block. Add after the `jiraApiToken` comparison:

```js
Number(dashboardSettings.jiraSyncThrottleHours) !==
  Number(savedSettings.jiraSyncThrottleHours) ||
```

The full block should include:

```js
const isSettingsDirty =
  Number(dashboardSettings.failureThreshold) !==
    Number(savedSettings.failureThreshold) ||
  Number(dashboardSettings.topModulesLimit) !==
    Number(savedSettings.topModulesLimit) ||
  dashboardSettings.jiraIssueMode !== savedSettings.jiraIssueMode ||
  (dashboardSettings.jiraBaseUrl || '') !==
    (savedSettings.jiraBaseUrl || '') ||
  (dashboardSettings.jiraEmail || '') !== (savedSettings.jiraEmail || '') ||
  (dashboardSettings.jiraApiToken || '') !==
    (savedSettings.jiraApiToken || '') ||
  Number(dashboardSettings.jiraSyncThrottleHours) !==
    Number(savedSettings.jiraSyncThrottleHours) ||
  (dashboardSettings.aiProvider ?? null) !==
    (savedSettings.aiProvider ?? null) ||
  (dashboardSettings.aiApiKey || '') !== (savedSettings.aiApiKey || '');
```

- [ ] **Step 4: Add `jiraSyncThrottleHours` to the `saveSettings` payload and `setSavedSettings` call**

Find the `saveSettings` function. The `updateAdminSettings` call currently includes `jiraApiToken`. Add the new field after it:

```js
await updateAdminSettings({
  failureThreshold: Number(dashboardSettings.failureThreshold),
  topModulesLimit: Number(dashboardSettings.topModulesLimit),
  jiraIssueMode: dashboardSettings.jiraIssueMode,
  jiraBaseUrl: dashboardSettings.jiraBaseUrl || undefined,
  jiraEmail: dashboardSettings.jiraEmail || undefined,
  jiraApiToken: dashboardSettings.jiraApiToken || undefined,
  jiraSyncThrottleHours: Number(dashboardSettings.jiraSyncThrottleHours),
  aiProvider: dashboardSettings.aiProvider,
  aiApiKey: dashboardSettings.aiApiKey || undefined,
});
```

Also add to `setSavedSettings` inside `saveSettings`:

```js
setSavedSettings({
  failureThreshold: dashboardSettings.failureThreshold,
  topModulesLimit: dashboardSettings.topModulesLimit,
  jiraIssueMode: dashboardSettings.jiraIssueMode,
  jiraBaseUrl: dashboardSettings.jiraBaseUrl,
  jiraEmail: dashboardSettings.jiraEmail,
  jiraApiToken: dashboardSettings.jiraApiToken,
  jiraSyncThrottleHours: dashboardSettings.jiraSyncThrottleHours,
  aiProvider: dashboardSettings.aiProvider,
  aiApiKey: dashboardSettings.aiApiKey,
});
```

- [ ] **Step 5: Add the TextField to the Jira Integration accordion**

Inside the Jira Integration `AccordionDetails`, the `<Grid container spacing={2}>` currently has fields for Issue creation, Jira domain, Jira email, and API token. Add a new `Grid` item after the **Jira email** field (before API token):

```jsx
<Grid size={{ xs: 12, sm: 6 }}>
  <TextField
    fullWidth
    size='small'
    type='number'
    label='Sync throttle (hours)'
    value={dashboardSettings.jiraSyncThrottleHours}
    onChange={(e) =>
      setDashboardSettings((prev) => ({
        ...prev,
        jiraSyncThrottleHours: e.target.value,
      }))
    }
    slotProps={{ htmlInput: { min: 1, max: 24 } }}
    helperText='How often Jira story data is re-fetched (1–24 hours)'
  />
</Grid>
```

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/admin/AdminClient.jsx"
git commit -m "RXR-11849: Add Jira sync throttle field to Admin settings UI"
```

---

### Task 6: Smoke-test the full flow

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Open Admin settings and verify the field renders**

Navigate to `/admin`. Expand **Jira Integration**. Confirm a "Sync throttle (hours)" field is visible with value `1` (or whatever is in DB).

- [ ] **Step 3: Change the value and save**

Set the field to `2`. Click **Save Settings**. Confirm the success toast appears and the Save button becomes disabled (dirty check reset).

- [ ] **Step 4: Reload and confirm persistence**

Hard-reload the page. Confirm the field still shows `2`.

- [ ] **Step 5: Verify the throttle is applied in the sync**

Check that `POST /api/jira/sync-story-watches` no longer imports or uses `JIRA_SYNC_THROTTLE_MS` by inspecting the route file — the only throttle source should be `settings.jiraSyncThrottleHours * 3_600_000`.

---

### Task 7: Run the full test suite

- [ ] **Step 1: Run all tests**

```bash
npx vitest run
```

Expected: all PASS, no references to `JIRA_SYNC_THROTTLE_MS` in any test.
