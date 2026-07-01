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

const PRIORITIES = ['High', 'Medium', 'Low'];
const TYPES = [
  'Functional Test',
  'Edge Case',
  'Negative Test',
  'Security Test',
];
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
            Enter one or more Jira story keys and select the applications to
            test against. For related stories that span multiple apps — e.g. an
            SSO story tested across Superadmin, Practice Portal, and EYEVIA —
            the AI generates test cases for each story × app pair, one at a
            time.
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
                      setNewAppInitial(e.target.value.toUpperCase().slice(0, 3))
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
                selectedApps.length === 0
                  ? 'Select an application first'
                  : selectedApps.length > 1
                    ? 'To create a new module, select a single application'
                    : ' '
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
              {parsedKeys.length > 1 ? 'ies' : 'y'} × {selectedApps.length} app
              {selectedApps.length > 1 ? 's' : ''})
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
  const total = slides.length;
  const slide = { ...slides[currentIndex], ...(edits[currentIndex] ?? {}) };
  const decision = decisions[currentIndex];
  const approvedCount = Object.values(decisions).filter(
    (d) => d === 'approved',
  ).length;

  const updateEdit = useCallback(
    (field, value) => {
      setEdits((prev) => ({
        ...prev,
        [currentIndex]: { ...(prev[currentIndex] ?? {}), [field]: value },
      }));
    },
    [currentIndex, setEdits],
  );

  const setDecision = (val) =>
    setDecisions((prev) => ({ ...prev, [currentIndex]: val }));

  const stepsPlainText = (slide.steps ?? '')
    .replace(/<li>/g, '')
    .replace(/<\/li>/g, '\n')
    .replace(/<\/?ol>/g, '')
    .trim();

  const handleStepsChange = (e) => {
    const html =
      '<ol>' +
      e.target.value
        .split('\n')
        .filter(Boolean)
        .map((s) => `<li>${s}</li>`)
        .join('') +
      '</ol>';
    updateEdit('steps', html);
  };

  return (
    <>
      <DialogContent sx={{ pt: 1 }}>
        <Stack spacing={2}>
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

          <Stack direction='row' spacing={1}>
            <Chip
              icon={<CheckCircleIcon />}
              label='Approved'
              color={decision === 'approved' ? 'success' : 'default'}
              variant={decision === 'approved' ? 'filled' : 'outlined'}
              onClick={() => setDecision('approved')}
              clickable
              size='small'
            />
            <Chip
              icon={<DoDisturbIcon />}
              label='Skip'
              color={decision === 'skipped' ? 'warning' : 'default'}
              variant={decision === 'skipped' ? 'filled' : 'outlined'}
              onClick={() => setDecision('skipped')}
              clickable
              size='small'
            />
          </Stack>

          {createError && <Alert severity='error'>{createError}</Alert>}

          <TextField
            label='Test Case Title'
            value={slide.testCase ?? ''}
            onChange={(e) => updateEdit('testCase', e.target.value)}
            size='small'
            fullWidth
          />
          <Stack direction='row' spacing={1}>
            <TextField
              select
              label='Priority'
              value={slide.priority ?? 'Medium'}
              onChange={(e) => updateEdit('priority', e.target.value)}
              size='small'
              sx={{ flex: 1 }}
            >
              {PRIORITIES.map((p) => (
                <MenuItem key={p} value={p}>
                  {p}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label='Type'
              value={slide.type ?? 'Functional Test'}
              onChange={(e) => updateEdit('type', e.target.value)}
              size='small'
              sx={{ flex: 2 }}
            >
              {TYPES.map((t) => (
                <MenuItem key={t} value={t}>
                  {t}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <TextField
            label='Preconditions'
            value={slide.preconditions ?? ''}
            onChange={(e) => updateEdit('preconditions', e.target.value)}
            size='small'
            fullWidth
            multiline
            minRows={2}
          />
          <TextField
            label='Steps (one step per line)'
            value={stepsPlainText}
            onChange={handleStepsChange}
            size='small'
            fullWidth
            multiline
            minRows={3}
            helperText='Each line becomes a numbered step.'
          />
          <TextField
            label='Expected Result'
            value={slide.expectedResult ?? ''}
            onChange={(e) => updateEdit('expectedResult', e.target.value)}
            size='small'
            fullWidth
            multiline
            minRows={2}
          />
        </Stack>
      </DialogContent>

      <DialogActions>
        <IconButton
          onClick={() => setCurrentIndex((i) => i - 1)}
          disabled={currentIndex === 0}
        >
          <ArrowBackIcon />
        </IconButton>
        <IconButton
          onClick={() => setCurrentIndex((i) => i + 1)}
          disabled={currentIndex === total - 1}
        >
          <ArrowForwardIcon />
        </IconButton>
        {onSkipStory && (
          <Button
            variant='text'
            onClick={onSkipStory}
            disabled={creating}
            sx={{ ml: 1 }}
          >
            Skip story
          </Button>
        )}
        <Button
          variant='outlined'
          onClick={onClose}
          disabled={creating}
          sx={{ ml: 'auto' }}
        >
          Cancel
        </Button>
        <Button
          variant='contained'
          disabled={approvedCount === 0 || creating}
          onClick={onCreateApproved}
          startIcon={
            creating ? (
              <CircularProgress size={16} color='inherit' />
            ) : undefined
          }
        >
          {creating ? 'Creating…' : `Create ${approvedCount} approved`}
        </Button>
      </DialogActions>
    </>
  );
}

export default function AITestCaseSlidesDialog({
  open,
  onClose,
  onSuccess,
  releaseId,
  applications,
  modules,
  onApplicationCreated,
  onModuleCreated,
}) {
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

  const handleCreateApproved = useCallback(async () => {
    setCreating(true);
    setCreateError(null);
    try {
      const approved = slides
        .map((slide, i) => ({
          ...slide,
          ...(edits[i] ?? {}),
          _decision: decisions[i],
        }))
        .filter((s) => s._decision === 'approved');

      const outcomes = await Promise.allSettled(
        approved.map((draft) =>
          createTestCaseForRelease(
            releaseId,
            {
              applicationId,
              moduleId,
              testCase: draft.testCase,
              preconditions: draft.preconditions,
              steps: draft.steps,
              expectedResult: draft.expectedResult,
              priority: draft.priority,
              type: draft.type,
              jiraStory: storyKey,
            },
            { suppressToastForStatus: [409] },
          ),
        ),
      );

      const created = outcomes.filter((o) => o.status === 'fulfilled').length;
      const skippedDupes = outcomes.filter(
        (o) => o.status === 'rejected' && o.reason?.status === 409,
      ).length;
      const failures = outcomes.filter(
        (o) => o.status === 'rejected' && o.reason?.status !== 409,
      );

      if (failures.length > 0) {
        setCreateError(
          failures[0].reason?.message ?? 'Failed to create some test cases',
        );
        return;
      }

      if (skippedDupes > 0 && created === 0) {
        setCreateError(
          `All ${skippedDupes} approved test case${skippedDupes > 1 ? 's' : ''} already exist (duplicates). Skip this story or edit the cases before creating.`,
        );
        return;
      }

      advanceOrFinish(created);
    } finally {
      setCreating(false);
    }
  }, [
    slides,
    edits,
    decisions,
    applicationId,
    moduleId,
    releaseId,
    storyKey,
    advanceOrFinish,
  ]);

  const handleSkipStory = useCallback(() => {
    advanceOrFinish(0);
  }, [advanceOrFinish]);

  const titleText =
    phase === 'setup'
      ? 'Generate from Jira Story'
      : phase === 'generating'
        ? 'Generating…'
        : 'Review Generated Test Cases';

  return (
    <Dialog open={open} onClose={onClose} maxWidth='md' fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        <Stack
          direction='row'
          sx={{ justifyContent: 'space-between', alignItems: 'center' }}
        >
          <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
            <AutoAwesomeIcon fontSize='small' color='primary' />
            <Typography variant='panelTitle'>{titleText}</Typography>
          </Stack>
          <IconButton size='small' onClick={onClose} aria-label='Close'>
            <CloseIcon fontSize='small' />
          </IconButton>
        </Stack>
      </DialogTitle>

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
    </Dialog>
  );
}
