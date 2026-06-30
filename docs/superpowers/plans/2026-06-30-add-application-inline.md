# Add Application Inline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "+" button to the Test Case ID Prefixes accordion in Admin settings that opens a dialog to create a new application without navigating away.

**Architecture:** The `+` IconButton lives in the `AccordionSummary` and opens a controlled MUI Dialog with Name + auto-derived Prefix fields. On save it calls `createApplication` (existing API client) → prepends the result to local `applications` state. No new routes or data-layer files are needed.

**Tech Stack:** Next.js App Router, React (client component), MUI v9, Vitest

---

## File Map

| File | Change |
|---|---|
| `app/api/applications/__tests__/route.test.js` | Add POST test cases (4 new tests) |
| `app/(app)/admin/AdminClient.jsx` | Add `AddIcon` import, `createApplication` import, `PREFIX_CREATE_RE` constant, 3 state vars + 3 handlers, `+` IconButton in accordion header, `NewApplicationDialog` JSX |

---

## Task 1: POST /api/applications — route tests

**Files:**
- Modify: `app/api/applications/__tests__/route.test.js`

**Context:** The existing test file only covers `GET`. The route (`app/api/applications/route.js`) already handles `POST` — it parses `createApplicationBodySchema` (from `lib/schemas/applications.js`) and calls `createApplication` from `lib/db/applicationsData.js`. We need to add POST cases and the missing mock.

- [ ] **Step 1: Open the test file and add `createApplication` to the hoisted mock**

In `app/api/applications/__tests__/route.test.js`, replace:

```js
const { listApplications } = vi.hoisted(() => ({ listApplications: vi.fn() }));

vi.mock('@/lib/db/applicationsData', () => ({ listApplications }));
```

with:

```js
const { listApplications, createApplication } = vi.hoisted(() => ({
  listApplications: vi.fn(),
  createApplication: vi.fn(),
}));

vi.mock('@/lib/db/applicationsData', () => ({ listApplications, createApplication }));
```

- [ ] **Step 2: Add the POST import and four new test cases**

After `import { GET } from '../route';`, add:

```js
import { POST } from '../route';
```

Then add the following `describe` block after the existing `describe('GET /api/applications', ...)` block:

```js
describe('POST /api/applications', () => {
  it('creates application with name and prefix and returns 201', async () => {
    createApplication.mockResolvedValue({
      _id: 'a1',
      name: 'Foo',
      initial: 'FOO',
      teamId: 't1',
    });
    const req = new Request('http://x/api/applications', {
      method: 'POST',
      body: JSON.stringify({ name: 'Foo', initial: 'FOO' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ _id: 'a1', name: 'Foo', initial: 'FOO' });
    expect(createApplication).toHaveBeenCalledWith(db, 't1', {
      name: 'Foo',
      initial: 'FOO',
    });
  });

  it('creates application with name only (no prefix) and returns 201', async () => {
    createApplication.mockResolvedValue({
      _id: 'a2',
      name: 'Bar',
      initial: 'BAR',
      teamId: 't1',
    });
    const req = new Request('http://x/api/applications', {
      method: 'POST',
      body: JSON.stringify({ name: 'Bar' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(createApplication).toHaveBeenCalledWith(db, 't1', { name: 'Bar' });
  });

  it('returns 400 when name is empty string', async () => {
    const req = new Request('http://x/api/applications', {
      method: 'POST',
      body: JSON.stringify({ name: '' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(createApplication).not.toHaveBeenCalled();
  });

  it('returns 400 when prefix does not match [A-Z0-9]{3}', async () => {
    const req = new Request('http://x/api/applications', {
      method: 'POST',
      body: JSON.stringify({ name: 'Foo', initial: 'fo' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(createApplication).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the new tests to verify they pass**

```bash
npx vitest run app/api/applications/__tests__/route.test.js
```

Expected: all tests pass (GET test still passes, 4 new POST tests pass).

- [ ] **Step 4: Commit**

```bash
git add app/api/applications/__tests__/route.test.js
git commit -m "RXR-12511: Add POST test cases for /api/applications route"
```

---

## Task 2: AdminClient — "+" button and New Application dialog

**Files:**
- Modify: `app/(app)/admin/AdminClient.jsx`

**Context:**
- `AdminClient.jsx` is a `'use client'` component at `app/(app)/admin/AdminClient.jsx`
- It already imports `Dialog`, `DialogActions`, `DialogContent`, `DialogTitle`, `IconButton`, `Button`, `Stack`, `CircularProgress`, `TextField` from `@mui/material` — no new MUI component imports needed
- It already imports `updateApplication` from `@/lib/api/applications` — add `createApplication` to the same import
- `PREFIX_RE = /^[A-Z0-9]{2,5}$/` is defined at module level (line ~235) — add `PREFIX_CREATE_RE` next to it
- The accordion for "Test Case ID Prefixes" starts at line ~895

- [ ] **Step 1: Add `AddIcon` import**

The existing icon imports are alphabetical. Insert after `DownloadOutlinedIcon`:

```js
import AddIcon from '@mui/icons-material/Add';
```

So the top of the icon import block becomes:

```js
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import CloseIcon from '@mui/icons-material/Close';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import AddIcon from '@mui/icons-material/Add';
// ... rest unchanged
```

- [ ] **Step 2: Add `createApplication` to the existing `applications` import**

Change:

```js
import { updateApplication } from '@/lib/api/applications';
```

to:

```js
import { createApplication, updateApplication } from '@/lib/api/applications';
```

- [ ] **Step 3: Add `PREFIX_CREATE_RE` constant**

After the existing `const PREFIX_RE = /^[A-Z0-9]{2,5}$/;` line (~line 235), add:

```js
const PREFIX_CREATE_RE = /^[A-Z0-9]{3}$/;
```

- [ ] **Step 4: Add new state variables for the dialog**

After the existing `const [prefixConfirm, setPrefixConfirm] = useState(null);` line (~line 312), add:

```js
const [newAppOpen, setNewAppOpen] = useState(false);
const [newApp, setNewApp] = useState({ name: '', prefix: '', prefixTouched: false });
const [newAppSaving, setNewAppSaving] = useState(false);
```

- [ ] **Step 5: Add the three handler functions**

After `confirmPrefixSave` function (around line ~352), add:

```js
function handleNewAppNameChange(value) {
  const derived = value.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 3);
  setNewApp((prev) => ({
    name: value,
    prefix: prev.prefixTouched ? prev.prefix : derived,
    prefixTouched: prev.prefixTouched,
  }));
}

function handleNewAppPrefixChange(value) {
  setNewApp((prev) => ({
    ...prev,
    prefix: value.toUpperCase().replace(/[^A-Z0-9]/g, ''),
    prefixTouched: true,
  }));
}

function closeNewAppDialog() {
  setNewAppOpen(false);
  setNewApp({ name: '', prefix: '', prefixTouched: false });
}

async function createApp() {
  setNewAppSaving(true);
  try {
    const created = await createApplication({
      name: newApp.name.trim(),
      initial: newApp.prefix,
    });
    setApplications((prev) => [created, ...prev]);
    setPrefixDrafts((prev) => ({ ...prev, [created._id]: created.initial ?? '' }));
    closeNewAppDialog();
    showToast('Application created', 'success');
  } catch (err) {
    const msg = err?.message ?? '';
    if (msg.toLowerCase().includes('already in use')) {
      showToast('Prefix already in use', 'error');
    } else {
      showToast('Failed to create application', 'error');
    }
  } finally {
    setNewAppSaving(false);
  }
}
```

- [ ] **Step 6: Add the "+" IconButton inside the AccordionSummary**

Find the outer `Stack` inside the Test Case ID Prefixes `AccordionSummary` (~line 911). It currently ends after the title/subtitle `Stack`. Add the `IconButton` as the last child of that outer `Stack`, before the closing tag:

Current:
```jsx
<Stack
  direction='row'
  spacing={1.5}
  sx={{ alignItems: 'center', flex: 1, mr: 1 }}
>
  <Stack
    sx={{
      p: 0.75,
      borderRadius: 1.5,
      bgcolor: 'rgba(13,148,136,0.1)',
      color: 'primary.main',
      flexShrink: 0,
    }}
  >
    <LabelOutlinedIcon sx={{ fontSize: 18 }} />
  </Stack>
  <Stack spacing={0.25} sx={{ flex: 1 }}>
    {/* ... title/subtitle ... */}
  </Stack>
</Stack>
```

Add the `IconButton` after the title/subtitle `Stack`:

```jsx
<Stack
  direction='row'
  spacing={1.5}
  sx={{ alignItems: 'center', flex: 1, mr: 1 }}
>
  <Stack
    sx={{
      p: 0.75,
      borderRadius: 1.5,
      bgcolor: 'rgba(13,148,136,0.1)',
      color: 'primary.main',
      flexShrink: 0,
    }}
  >
    <LabelOutlinedIcon sx={{ fontSize: 18 }} />
  </Stack>
  <Stack spacing={0.25} sx={{ flex: 1 }}>
    {/* ... title/subtitle — unchanged ... */}
  </Stack>
  <IconButton
    size='small'
    onClick={(e) => {
      e.stopPropagation();
      setNewAppOpen(true);
    }}
    sx={{ color: 'primary.main', flexShrink: 0 }}
  >
    <AddIcon fontSize='small' />
  </IconButton>
</Stack>
```

- [ ] **Step 7: Add the New Application dialog JSX**

Add the following dialog block inside the component's return, just before the closing `</Stack>` of the main content (or alongside the existing `ConfirmDialog` — anywhere inside the return is fine since dialogs are portaled). Place it right after the closing `</Card>` of the "Test Case ID Prefixes" accordion card and before the Danger Zone section:

```jsx
<Dialog open={newAppOpen} onClose={closeNewAppDialog} maxWidth='xs' fullWidth>
  <DialogTitle>New Application</DialogTitle>
  <DialogContent>
    <Stack spacing={2} sx={{ pt: 1 }}>
      <TextField
        fullWidth
        size='small'
        label='Application Name'
        autoFocus
        value={newApp.name}
        onChange={(e) => handleNewAppNameChange(e.target.value)}
        disabled={newAppSaving}
      />
      <TextField
        fullWidth
        size='small'
        label='Prefix'
        value={newApp.prefix}
        onChange={(e) => handleNewAppPrefixChange(e.target.value)}
        disabled={newAppSaving}
        slotProps={{ htmlInput: { maxLength: 3 } }}
        error={newApp.prefix.length > 0 && !PREFIX_CREATE_RE.test(newApp.prefix)}
        helperText={
          newApp.prefix.length > 0 && !PREFIX_CREATE_RE.test(newApp.prefix)
            ? 'Exactly 3 letters or digits'
            : ' '
        }
      />
    </Stack>
  </DialogContent>
  <DialogActions>
    <Button variant='outlined' onClick={closeNewAppDialog} disabled={newAppSaving}>
      Cancel
    </Button>
    <Button
      variant='contained'
      onClick={createApp}
      disabled={
        !newApp.name.trim() || !PREFIX_CREATE_RE.test(newApp.prefix) || newAppSaving
      }
      startIcon={
        newAppSaving ? <CircularProgress size={14} color='inherit' /> : undefined
      }
    >
      {newAppSaving ? 'Creating…' : 'Create'}
    </Button>
  </DialogActions>
</Dialog>
```

- [ ] **Step 8: Run the full test suite to verify nothing is broken**

```bash
npm test
```

Expected: all tests pass (the TopNav test was already failing before this feature — confirm it still fails with the same pre-existing error and no new failures were introduced).

- [ ] **Step 9: Commit**

```bash
git add app/(app)/admin/AdminClient.jsx
git commit -m "RXR-12511: Add + button and dialog to create applications inline in Admin settings"
```
