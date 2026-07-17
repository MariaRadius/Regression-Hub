# Generate from Story — Flat Form Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the "Generate from Story" dialog from a per-story accordion into a single flat form with comma-separated story keys, multi-select applications, and a shared module — calling the AI once per (story × app) pair.

**Architecture:** Three sequential tasks: (1) add pure utility functions for parsing and validating comma-separated Jira keys; (2) replace `StoryRow` + `SetupPhase` with a flat form backed by those utilities; (3) refactor the main component state from a `stories[]` array to flat scalar state, build the combinations queue on Generate click, and update the slide-phase context header.

**Tech Stack:** React 18, MUI v9, Vitest, Next.js App Router

## Global Constraints

- MUI v9 patterns only — no `xs/sm/md` Grid props, no `InputLabelProps`, no `inputProps`, no `TransitionProps`, no `MenuListProps`; use `sx`, Grid `size` prop, `slotProps.<slot>`
- Use `slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}` on every labeled TextField select with an empty-value MenuItem
- No DB queries inline in page or route files; queries stay in `lib/`
- No hardcoded domain enum literals — import from `@/lib/constants`
- Jira commit prefix: `RXR-12336`
- Test runner: `npx vitest run <path>`

---

### Task 1: Jira story key utilities (TDD)

**Files:**
- Create: `utils/jiraStories.js`
- Create: `utils/__tests__/jiraStories.test.js`

**Interfaces:**
- Produces:
  - `parseStoryKeys(raw: string): string[]` — splits on comma, uppercases, extracts from Jira browse URLs, returns valid unique keys capped at 10
  - `getInvalidKeys(raw: string): string[]` — returns non-empty segments (after uppercase) that fail `JIRA_KEY_RE`

---

- [ ] **Step 1: Write the failing tests**

Create `utils/__tests__/jiraStories.test.js`:

```javascript
import { describe, expect, it } from 'vitest';
import { getInvalidKeys, parseStoryKeys } from '@/utils/jiraStories';

describe('parseStoryKeys', () => {
  it('parses valid comma-separated keys', () => {
    expect(parseStoryKeys('SSO-123, REX-456')).toEqual(['SSO-123', 'REX-456']);
  });

  it('uppercases input before validation', () => {
    expect(parseStoryKeys('sso-123')).toEqual(['SSO-123']);
  });

  it('extracts key from a Jira browse URL segment', () => {
    expect(
      parseStoryKeys('https://jira.example.com/browse/SSO-123'),
    ).toEqual(['SSO-123']);
  });

  it('filters out empty segments', () => {
    expect(parseStoryKeys('SSO-123,  , REX-456')).toEqual([
      'SSO-123',
      'REX-456',
    ]);
  });

  it('deduplicates repeated keys', () => {
    expect(parseStoryKeys('SSO-123, SSO-123, REX-456')).toEqual([
      'SSO-123',
      'REX-456',
    ]);
  });

  it('caps at 10 keys', () => {
    const raw = Array.from({ length: 12 }, (_, i) => `KEY-${i + 1}`).join(
      ', ',
    );
    expect(parseStoryKeys(raw)).toHaveLength(10);
  });

  it('returns empty array for blank input', () => {
    expect(parseStoryKeys('')).toEqual([]);
    expect(parseStoryKeys('  ')).toEqual([]);
  });
});

describe('getInvalidKeys', () => {
  it('returns segments that are not valid Jira keys', () => {
    expect(getInvalidKeys('SSO-123, oops, REX-456')).toEqual(['OOPS']);
  });

  it('returns empty array when all keys are valid', () => {
    expect(getInvalidKeys('SSO-123, REX-456')).toEqual([]);
  });

  it('ignores empty segments', () => {
    expect(getInvalidKeys('SSO-123, , ')).toEqual([]);
  });

  it('treats bare numbers or bare letters as invalid', () => {
    expect(getInvalidKeys('123, ABC')).toEqual(['123', 'ABC']);
  });
});
```

- [ ] **Step 2: Run to verify tests fail**

```bash
npx vitest run utils/__tests__/jiraStories.test.js
```

Expected: multiple FAIL — `parseStoryKeys` and `getInvalidKeys` not found.

- [ ] **Step 3: Implement the utilities**

Create `utils/jiraStories.js`:

```javascript
const JIRA_KEY_RE = /^[A-Z]+-\d+$/;
const JIRA_URL_RE = /\/browse\/([A-Z]+-\d+)/i;

export function parseStoryKeys(raw) {
  return raw
    .split(',')
    .map((s) => {
      const trimmed = s.trim().toUpperCase();
      const urlMatch = trimmed.match(JIRA_URL_RE);
      return urlMatch ? urlMatch[1] : trimmed;
    })
    .filter((k) => k && JIRA_KEY_RE.test(k))
    .filter((k, i, arr) => arr.indexOf(k) === i)
    .slice(0, 10);
}

export function getInvalidKeys(raw) {
  return raw
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((k) => k && !JIRA_KEY_RE.test(k));
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run utils/__tests__/jiraStories.test.js
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add utils/jiraStories.js utils/__tests__/jiraStories.test.js
git commit -m "RXR-12336: Add parseStoryKeys and getInvalidKeys utilities"
```

---

### Task 2: Rewrite SetupPhase as flat form (remove StoryRow)

**Files:**
- Modify: `components/AITestCaseSlidesDialog.jsx`

**Interfaces:**
- Consumes: `parseStoryKeys`, `getInvalidKeys` from `@/utils/jiraStories`
- Produces: new `SetupPhase` component with props:
  ```
  storyKeysRaw: string
  onStoryKeysChange: (raw: string) => void
  selectedApps: { _id: string, name: string }[]
  onAppsChange: (apps: { _id: string, name: string }[]) => void
  selectedModuleId: string
  onModuleChange: (id: string) => void
  applications: { _id: string, name: string }[]
  modules: { _id: string, name: string, applicationId: string }[]
  error: string | null
  onGenerate: () => void
  onClose: () => void
  onApplicationCreated: (app) => void
  onModuleCreated: (mod) => void
  ```

---

- [ ] **Step 1: Update imports at the top of the file**

In `components/AITestCaseSlidesDialog.jsx`, replace the entire import block (lines 1–34) with:

```javascript
'use client';

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloseIcon from '@mui/icons-material/Close';
import DoDisturbIcon from '@mui/icons-material/DoDisturb';
import {
  Alert,
  Autocomplete,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createApplication } from '@/lib/api/applications';
import { createModule } from '@/lib/api/modules';
import { createTestCaseForRelease } from '@/lib/api/releases';
import { deriveInitial } from '@/utils/appInitial';
import { getInvalidKeys, parseStoryKeys } from '@/utils/jiraStories';
```

Removed vs current: `AddIcon`, `ContentCopyOutlinedIcon`, `Checkbox`, `FormControlLabel` (all belonged to the old per-row pattern).
Added: `Autocomplete`.

- [ ] **Step 2: Replace lines 42–501 (JIRA_KEY_RE constant + StoryRow + SetupPhase) with the new flat form**

Delete everything from the `const JIRA_KEY_RE` line through the closing brace of `SetupPhase` (lines 42–501) and replace with:

```javascript
const JIRA_KEY_RE = /^[A-Z]+-\d+$/;

function SetupPhase({
  storyKeysRaw,
  onStoryKeysChange,
  selectedApps,
  onAppsChange,
  selectedModuleId,
  onModuleChange,
  applications,
  modules,
  error,
  onGenerate,
  onClose,
  onApplicationCreated,
  onModuleCreated,
}) {
  const [newAppName, setNewAppName] = useState(null);
  const [newAppInitial, setNewAppInitial] = useState('');
  const [creatingApp, setCreatingApp] = useState(false);
  const [appError, setAppError] = useState(null);
  const newAppInputRef = useRef(null);

  const [newModuleName, setNewModuleName] = useState(null);
  const [creatingModule, setCreatingModule] = useState(false);
  const [moduleError, setModuleError] = useState(null);
  const newModuleInputRef = useRef(null);

  const parsedKeys = parseStoryKeys(storyKeysRaw);
  const invalidKeys = getInvalidKeys(storyKeysRaw);
  const appIds = new Set(selectedApps.map((a) => a._id));
  const availableModules = modules.filter((m) => appIds.has(m.applicationId));
  const combinationCount = parsedKeys.length * selectedApps.length;
  const allValid =
    parsedKeys.length > 0 &&
    selectedApps.length > 0 &&
    !!selectedModuleId &&
    invalidKeys.length === 0;

  function handleAppsChange(_, newApps) {
    if (newApps.some((a) => a._id === '__new__')) {
      setNewAppName('');
      setTimeout(() => newAppInputRef.current?.focus(), 50);
      return;
    }
    onAppsChange(newApps);
    if (selectedModuleId) {
      const newAppIds = new Set(newApps.map((a) => a._id));
      const stillValid = modules.some(
        (m) => m._id === selectedModuleId && newAppIds.has(m.applicationId),
      );
      if (!stillValid) onModuleChange('');
    }
  }

  async function handleCreateApp() {
    if (!newAppName?.trim()) return;
    setCreatingApp(true);
    setAppError(null);
    try {
      const app = await createApplication({
        name: newAppName.trim(),
        initial: newAppInitial.trim() || undefined,
      });
      onApplicationCreated(app);
      onAppsChange([...selectedApps, app]);
      setNewAppName(null);
      setNewAppInitial('');
    } catch (err) {
      setAppError(err.message || 'Failed to create application');
    } finally {
      setCreatingApp(false);
    }
  }

  async function handleCreateModule() {
    if (!newModuleName?.trim() || selectedApps.length === 0) return;
    setCreatingModule(true);
    setModuleError(null);
    try {
      const mod = await createModule({
        name: newModuleName.trim(),
        applicationId: selectedApps[0]._id,
      });
      onModuleCreated(mod);
      onModuleChange(mod._id);
      setNewModuleName(null);
    } catch (err) {
      setModuleError(err.message || 'Failed to create module');
    } finally {
      setCreatingModule(false);
    }
  }

  return (
    <>
      <DialogContent>
        <Stack spacing={2}>
          {error && <Alert severity='error'>{error}</Alert>}
          <Alert severity='info' icon={<AutoAwesomeIcon />}>
            Enter Jira story keys and select applications. The AI generates test
            cases for each story × application pair, one at a time.
          </Alert>

          <TextField
            label='Story Keys'
            value={storyKeysRaw}
            onChange={(e) => onStoryKeysChange(e.target.value.toUpperCase())}
            placeholder='e.g. SSO-123, REX-456'
            size='small'
            fullWidth
            autoFocus
            required
            error={invalidKeys.length > 0}
            helperText={
              invalidKeys.length > 0
                ? `Invalid: ${invalidKeys.join(', ')} — use PROJECT-123 format`
                : `Comma-separated, up to 10 stories${parsedKeys.length > 0 ? ` (${parsedKeys.length} valid)` : ''}`
            }
          />

          <Stack spacing={0.75}>
            <Autocomplete
              multiple
              options={applications}
              value={selectedApps}
              onChange={handleAppsChange}
              getOptionLabel={(o) => o.name}
              isOptionEqualToValue={(o, v) => o._id === v._id}
              filterOptions={(options, { inputValue }) => {
                const lower = inputValue.toLowerCase();
                const filtered = options.filter((o) =>
                  o.name.toLowerCase().includes(lower),
                );
                if (newAppName === null) {
                  filtered.push({ _id: '__new__', name: '+ New application…' });
                }
                return filtered;
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label='Applications'
                  size='small'
                  required
                  placeholder={
                    selectedApps.length === 0
                      ? 'Select applications'
                      : undefined
                  }
                />
              )}
              disableCloseOnSelect
              size='small'
            />
            {newAppName !== null && (
              <Stack spacing={0.5}>
                {appError && (
                  <Alert severity='error' sx={{ py: 0 }}>
                    {appError}
                  </Alert>
                )}
                <Stack direction='row' spacing={0.75}>
                  <TextField
                    slotProps={{ htmlInput: { ref: newAppInputRef } }}
                    size='small'
                    value={newAppName}
                    onChange={(e) => {
                      setNewAppName(e.target.value);
                      try {
                        setNewAppInitial(deriveInitial(e.target.value));
                      } catch {
                        setNewAppInitial('');
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleCreateApp();
                      }
                    }}
                    placeholder='Application name'
                    sx={{ flex: 2 }}
                  />
                  <TextField
                    size='small'
                    value={newAppInitial}
                    onChange={(e) =>
                      setNewAppInitial(
                        e.target.value.toUpperCase().slice(0, 3),
                      )
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleCreateApp();
                      }
                    }}
                    placeholder='ABC'
                    label='Initial'
                    sx={{ flex: 1 }}
                    slotProps={{ htmlInput: { maxLength: 3 } }}
                  />
                  <Button
                    variant='contained'
                    size='small'
                    onClick={handleCreateApp}
                    disabled={creatingApp || !newAppName.trim()}
                    sx={{ whiteSpace: 'nowrap' }}
                  >
                    {creatingApp ? '…' : 'Create'}
                  </Button>
                  <IconButton
                    size='small'
                    aria-label='Cancel new application'
                    onClick={() => {
                      setNewAppName(null);
                      setNewAppInitial('');
                      setAppError(null);
                    }}
                  >
                    <CloseIcon />
                  </IconButton>
                </Stack>
              </Stack>
            )}
          </Stack>

          <Stack spacing={0.75}>
            <TextField
              select
              label='Module'
              value={selectedModuleId}
              onChange={(e) => {
                if (e.target.value === '__new__') {
                  onModuleChange('');
                  setNewModuleName('');
                  setTimeout(() => newModuleInputRef.current?.focus(), 50);
                } else {
                  onModuleChange(e.target.value);
                  setNewModuleName(null);
                }
              }}
              size='small'
              fullWidth
              required
              disabled={selectedApps.length === 0}
              slotProps={{
                select: { displayEmpty: true },
                inputLabel: { shrink: true },
              }}
              helperText={
                selectedApps.length === 0 ? 'Select an application first' : ' '
              }
            >
              <MenuItem value=''>Select module</MenuItem>
              {selectedApps.length === 1 && (
                <MenuItem value='__new__'>+ New module…</MenuItem>
              )}
              {availableModules.map((m) => (
                <MenuItem key={m._id} value={m._id}>
                  {m.name}
                </MenuItem>
              ))}
            </TextField>
            {newModuleName !== null && (
              <Stack spacing={0.5}>
                {moduleError && (
                  <Alert severity='error' sx={{ py: 0 }}>
                    {moduleError}
                  </Alert>
                )}
                <Stack direction='row' spacing={0.75}>
                  <TextField
                    slotProps={{ htmlInput: { ref: newModuleInputRef } }}
                    size='small'
                    value={newModuleName}
                    onChange={(e) => setNewModuleName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleCreateModule();
                      }
                    }}
                    placeholder='New module name'
                    sx={{ flex: 1 }}
                  />
                  <Button
                    variant='contained'
                    size='small'
                    onClick={handleCreateModule}
                    disabled={creatingModule || !newModuleName.trim()}
                    sx={{ whiteSpace: 'nowrap' }}
                  >
                    {creatingModule ? '…' : 'Create'}
                  </Button>
                  <IconButton
                    size='small'
                    aria-label='Cancel new module'
                    onClick={() => {
                      setNewModuleName(null);
                      setModuleError(null);
                    }}
                  >
                    <CloseIcon />
                  </IconButton>
                </Stack>
              </Stack>
            )}
          </Stack>

          {combinationCount > 0 && (
            <Typography variant='caption' color='text.secondary'>
              Will generate {combinationCount} combination
              {combinationCount > 1 ? 's' : ''} ({parsedKeys.length} stor
              {parsedKeys.length > 1 ? 'ies' : 'y'} × {selectedApps.length}{' '}
              app{selectedApps.length > 1 ? 's' : ''})
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant='outlined' onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant='contained'
          startIcon={<AutoAwesomeIcon />}
          onClick={onGenerate}
          disabled={!allValid}
        >
          {allValid
            ? `Generate test cases (${combinationCount})`
            : 'Generate test cases'}
        </Button>
      </DialogActions>
    </>
  );
}
```

Note on module creation with multiple apps: the "+ New module…" option only appears when exactly one app is selected (`selectedApps.length === 1`). When multiple apps are selected, the user must pre-create modules through Admin settings. `handleCreateModule` always creates the module under `selectedApps[0]._id`.

- [ ] **Step 3: Commit**

```bash
git add components/AITestCaseSlidesDialog.jsx
git commit -m "RXR-12336: Replace per-story accordion with flat form in SetupPhase"
```

---

### Task 3: Refactor main component state, generation queue, and SlidePhase context

**Files:**
- Modify: `components/AITestCaseSlidesDialog.jsx` (main component + SlidePhase)

**Interfaces:**
- Consumes: `combinationsRef.current` entries shaped as `{ key: string, app: { _id: string, name: string }, moduleId: string, moduleName: string }`
- `SlidePhase` new props: `appName: string`, `moduleName: string`, `currentCombIndex: number`, `totalCombinations: number` (replaces `currentStoryIndex`, `totalStories`)

---

- [ ] **Step 1: Update `SlidePhase` signature and context header**

In `components/AITestCaseSlidesDialog.jsx`, replace the `SlidePhase` function signature:

Old:
```javascript
function SlidePhase({
  slides,
  currentIndex,
  setCurrentIndex,
  decisions,
  setDecisions,
  edits,
  setEdits,
  storyKey,
  currentStoryIndex,
  totalStories,
  creating,
  createError,
  onCreateApproved,
  onSkipStory,
  onClose,
}) {
```

New:
```javascript
function SlidePhase({
  slides,
  currentIndex,
  setCurrentIndex,
  decisions,
  setDecisions,
  edits,
  setEdits,
  storyKey,
  appName,
  moduleName,
  currentCombIndex,
  totalCombinations,
  creating,
  createError,
  onCreateApproved,
  onSkipStory,
  onClose,
}) {
```

Then replace the context header Stack inside `SlidePhase` (the `<Stack spacing={0.5}>` block at the top of the returned JSX):

Old:
```jsx
<Stack spacing={0.5}>
  {totalStories > 1 && (
    <Typography variant='caption' color='text.secondary'>
      Story {currentStoryIndex + 1} of {totalStories}:{' '}
      <strong>{storyKey}</strong>
    </Typography>
  )}
  <Stack direction='row' sx={{ justifyContent: 'space-between' }}>
    <Typography variant='caption' sx={{ color: 'text.secondary' }}>
      {totalStories === 1 ? `${storyKey} — ` : ''}Test case{' '}
      {currentIndex + 1} of {total}
    </Typography>
    <Typography variant='caption' sx={{ color: 'text.secondary' }}>
      {approvedCount} approved
    </Typography>
  </Stack>
  <LinearProgress
    variant='determinate'
    value={((currentIndex + 1) / total) * 100}
  />
</Stack>
```

New:
```jsx
<Stack spacing={0.5}>
  {totalCombinations > 1 && (
    <Typography variant='caption' color='text.secondary'>
      Combination {currentCombIndex + 1} of {totalCombinations}:{' '}
      <strong>{storyKey}</strong> · {appName} · {moduleName}
    </Typography>
  )}
  <Stack direction='row' sx={{ justifyContent: 'space-between' }}>
    <Typography variant='caption' sx={{ color: 'text.secondary' }}>
      {totalCombinations === 1
        ? `${storyKey} · ${appName} · ${moduleName} — `
        : ''}
      Test case {currentIndex + 1} of {total}
    </Typography>
    <Typography variant='caption' sx={{ color: 'text.secondary' }}>
      {approvedCount} approved
    </Typography>
  </Stack>
  <LinearProgress
    variant='determinate'
    value={((currentIndex + 1) / total) * 100}
  />
</Stack>
```

- [ ] **Step 2: Replace main component state block**

In the `AITestCaseSlidesDialog` export, replace the entire state declaration block (from `const [phase, setPhase]` through `removeStoryEntry`) with:

```javascript
const [phase, setPhase] = useState('setup'); // 'setup' | 'generating' | 'slides'
// setup-phase state
const [storyKeysRaw, setStoryKeysRaw] = useState('');
const [selectedApps, setSelectedApps] = useState([]);
const [selectedModuleId, setSelectedModuleId] = useState('');
// generation queue — built on Generate click, never reactive
const combinationsRef = useRef([]);
const [currentCombIndex, setCurrentCombIndex] = useState(0);
const [totalCreated, setTotalCreated] = useState(0);
const [error, setError] = useState(null);
// slides-phase state
const [slides, setSlides] = useState([]);
const [storyKey, setStoryKey] = useState('');
const [applicationId, setApplicationId] = useState('');
const [moduleId, setModuleId] = useState('');
const [appName, setAppName] = useState('');
const [moduleName, setModuleName] = useState('');
const [currentIndex, setCurrentIndex] = useState(0);
const [decisions, setDecisions] = useState({});
const [edits, setEdits] = useState({});
const [creating, setCreating] = useState(false);
const [createError, setCreateError] = useState(null);
```

- [ ] **Step 3: Replace the `useEffect` reset**

Replace the `useEffect` block with:

```javascript
useEffect(() => {
  if (!open) return;
  setPhase('setup');
  setStoryKeysRaw('');
  setSelectedApps([]);
  setSelectedModuleId('');
  combinationsRef.current = [];
  setCurrentCombIndex(0);
  setTotalCreated(0);
  setError(null);
  setCreateError(null);
  setSlides([]);
  setDecisions({});
  setEdits({});
  setCurrentIndex(0);
  setStoryKey('');
  setApplicationId('');
  setModuleId('');
  setAppName('');
  setModuleName('');
}, [open]);
```

- [ ] **Step 4: Add `handleStartGeneration` and rewrite `handleGenerateNext`**

Delete the old `updateStoryEntry`, `addStoryEntry`, `removeStoryEntry` functions, then replace `handleGenerateNext` with the following two functions (add `handleStartGeneration` first):

```javascript
function handleStartGeneration() {
  const keys = parseStoryKeys(storyKeysRaw);
  const modName = modules.find((m) => m._id === selectedModuleId)?.name ?? '';
  combinationsRef.current = keys.flatMap((key) =>
    selectedApps.map((app) => ({
      key,
      app,
      moduleId: selectedModuleId,
      moduleName: modName,
    })),
  );
  setCurrentCombIndex(0);
  setTotalCreated(0);
  handleGenerateNext(0);
}

const handleGenerateNext = useCallback(
  async (index) => {
    const combo = combinationsRef.current[index];
    setCurrentCombIndex(index);
    setPhase('generating');
    setError(null);
    try {
      const res = await fetch(
        `/api/releases/${releaseId}/ai-generate-cases`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jiraStory: combo.key }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Generation failed');
      setSlides(data.testCases);
      setStoryKey(data.story.key);
      setApplicationId(combo.app._id);
      setModuleId(combo.moduleId);
      setAppName(combo.app.name);
      setModuleName(combo.moduleName);
      setCurrentIndex(0);
      setDecisions({});
      setEdits({});
      setPhase('slides');
    } catch (err) {
      setError(err.message);
      setPhase('setup');
    }
  },
  [releaseId],
);
```

Note: `handleStartGeneration` is a plain function (not a callback) so it can reference `handleGenerateNext` from closure; this is safe because it's only called after render.

- [ ] **Step 5: Rewrite `advanceOrFinish`**

Replace `advanceOrFinish`:

```javascript
const advanceOrFinish = useCallback(
  (addedCount) => {
    const newTotal = totalCreated + addedCount;
    setTotalCreated(newTotal);
    const next = currentCombIndex + 1;
    if (next < combinationsRef.current.length) {
      handleGenerateNext(next);
    } else {
      onSuccess(newTotal);
    }
  },
  [totalCreated, currentCombIndex, handleGenerateNext, onSuccess],
);
```

- [ ] **Step 6: Update the returned JSX**

Replace the three phase render blocks in the returned JSX:

**Setup phase** — replace the `<SetupPhase ... />` call:
```jsx
{phase === 'setup' && (
  <SetupPhase
    storyKeysRaw={storyKeysRaw}
    onStoryKeysChange={setStoryKeysRaw}
    selectedApps={selectedApps}
    onAppsChange={setSelectedApps}
    selectedModuleId={selectedModuleId}
    onModuleChange={setSelectedModuleId}
    applications={applications}
    modules={modules}
    error={error}
    onGenerate={handleStartGeneration}
    onClose={onClose}
    onApplicationCreated={onApplicationCreated}
    onModuleCreated={onModuleCreated}
  />
)}
```

**Generating phase** — replace the existing generating block:
```jsx
{phase === 'generating' && (
  <DialogContent>
    <Stack spacing={2} sx={{ alignItems: 'center', py: 6 }}>
      <CircularProgress />
      <Typography color='text.secondary'>
        Generating for {combinationsRef.current[currentCombIndex]?.key} ·{' '}
        {combinationsRef.current[currentCombIndex]?.app.name}…
      </Typography>
      {combinationsRef.current.length > 1 && (
        <Typography variant='caption' color='text.secondary'>
          Combination {currentCombIndex + 1} of{' '}
          {combinationsRef.current.length}
        </Typography>
      )}
    </Stack>
  </DialogContent>
)}
```

**Slides phase** — replace the `<SlidePhase ... />` call:
```jsx
{phase === 'slides' && (
  <SlidePhase
    slides={slides}
    currentIndex={currentIndex}
    setCurrentIndex={setCurrentIndex}
    decisions={decisions}
    setDecisions={setDecisions}
    edits={edits}
    setEdits={setEdits}
    storyKey={storyKey}
    appName={appName}
    moduleName={moduleName}
    currentCombIndex={currentCombIndex}
    totalCombinations={combinationsRef.current.length}
    creating={creating}
    createError={createError}
    onCreateApproved={handleCreateApproved}
    onSkipStory={
      combinationsRef.current.length > 1 ? handleSkipStory : null
    }
    onClose={onClose}
  />
)}
```

- [ ] **Step 7: Verify the full flow in the browser**

```bash
npx next dev
```

Open the Test Cases page and click "Generate from Story". Verify:

1. Flat form renders: Story Keys field, Applications multi-select, Module dropdown
2. Typing `SSO-123, REX-456` shows helper `2 valid`
3. Typing `oops` shows error `Invalid: OOPS — use PROJECT-123 format`
4. Selecting 2 apps + 1 module with 2 valid story keys shows `Will generate 4 combinations (2 stories × 2 apps)`
5. Generate button label: `Generate test cases (4)`
6. After clicking Generate, generating phase shows `Generating for SSO-123 · Superadmin…` and `Combination 1 of 4`
7. Slide review header shows `Combination 1 of 4: SSO-123 · Superadmin · Authentication`
8. After approving/skipping, it advances to the next combination

- [ ] **Step 8: Commit**

```bash
git add components/AITestCaseSlidesDialog.jsx
git commit -m "RXR-12336: Refactor dialog state to flat form with per-combination generation queue"
```
