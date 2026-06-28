'use client';

import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import DoDisturbIcon from '@mui/icons-material/DoDisturb';
import {
  Alert,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
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

const PRIORITIES = ['High', 'Medium', 'Low'];
const TYPES = [
  'Functional Test',
  'Edge Case',
  'Negative Test',
  'Security Test',
];
const JIRA_KEY_RE = /^[A-Z]+-\d+$/;

function StoryRow({
  index,
  total,
  entry,
  firstEntry,
  applications,
  modules,
  onChange,
  onRemove,
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
      onChange({ applicationId: app._id, moduleId: '' });
      setNewAppName(null);
      setNewAppInitial('');
    } catch (err) {
      setAppError(err.message || 'Failed to create application');
    } finally {
      setCreatingApp(false);
    }
  }

  async function handleCreateModule() {
    if (!newModuleName?.trim() || !entry.applicationId) return;
    setCreatingModule(true);
    setModuleError(null);
    try {
      const mod = await createModule({
        name: newModuleName.trim(),
        applicationId: entry.applicationId,
      });
      onModuleCreated(mod);
      onChange({ moduleId: mod._id });
      setNewModuleName(null);
    } catch (err) {
      setModuleError(err.message || 'Failed to create module');
    } finally {
      setCreatingModule(false);
    }
  }

  const jiraStoryError = Boolean(
    entry.jiraStory && !JIRA_KEY_RE.test(entry.jiraStory.trim()),
  );

  const canCopyFirst =
    index > 0 && firstEntry.applicationId && firstEntry.moduleId;

  const firstAppName = applications.find(
    (a) => a._id === firstEntry.applicationId,
  )?.name;
  const firstModName = modules.find((m) => m._id === firstEntry.moduleId)?.name;

  return (
    <Stack
      spacing={0}
      sx={{
        border: 1,
        borderColor: 'divider',
        borderRadius: 1.5,
        overflow: 'hidden',
      }}
    >
      {/* Row header */}
      <Stack
        direction='row'
        sx={{
          px: 2,
          py: 0.75,
          bgcolor: 'grey.50',
          borderBottom: 1,
          borderColor: 'divider',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
          <Stack
            sx={{
              width: 22,
              height: 22,
              borderRadius: '50%',
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Typography sx={{ fontSize: 11, fontWeight: 700, lineHeight: 1 }}>
              {index + 1}
            </Typography>
          </Stack>
          <Typography
            variant='caption'
            sx={{ fontWeight: 600, color: 'text.secondary' }}
          >
            Story {index + 1}
          </Typography>
        </Stack>
        {total > 1 && (
          <IconButton
            size='small'
            aria-label={`Remove story ${index + 1}`}
            onClick={onRemove}
            sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }}
          >
            <CloseIcon sx={{ fontSize: 16 }} />
          </IconButton>
        )}
      </Stack>

      {/* Row body */}
      <Stack spacing={1.5} sx={{ p: 2 }}>
        <TextField
          label='Jira Story Key'
          value={entry.jiraStory}
          onChange={(e) => {
            const raw = e.target.value;
            const fromUrl = raw.match(/\/browse\/([A-Z]+-\d+)/i);
            onChange({
              jiraStory: fromUrl ? fromUrl[1].toUpperCase() : raw.toUpperCase(),
            });
          }}
          placeholder='e.g. SCRUM-8'
          size='small'
          fullWidth
          autoFocus={index === 0}
          error={jiraStoryError}
          helperText={jiraStoryError ? 'Use format PROJECT-123' : ' '}
        />

        {/* Same-as-Story-1 shortcut for rows 2+ */}
        {index > 0 && (
          <FormControlLabel
            sx={{ mx: 0, mt: -0.5 }}
            control={
              <Checkbox
                size='small'
                checked={entry.sameAsFirst}
                onChange={(e) => onChange({ sameAsFirst: e.target.checked })}
                disabled={!canCopyFirst}
              />
            }
            label={
              <Stack
                direction='row'
                spacing={0.5}
                sx={{ alignItems: 'center' }}
              >
                <ContentCopyOutlinedIcon
                  sx={{ fontSize: 13, color: 'text.secondary' }}
                />
                <Typography variant='caption' color='text.secondary'>
                  {canCopyFirst
                    ? `Same as Story 1 — ${firstAppName} / ${firstModName}`
                    : 'Same as Story 1 (fill Story 1 first)'}
                </Typography>
              </Stack>
            }
          />
        )}

        {/* App & Module — hidden when sameAsFirst is checked */}
        {!entry.sameAsFirst && (
          <>
            <Stack spacing={0.75}>
              <TextField
                select
                label='Application'
                value={entry.applicationId}
                onChange={(e) => {
                  if (e.target.value === '__new__') {
                    onChange({ applicationId: '', moduleId: '' });
                    setNewAppName('');
                    setNewAppInitial('');
                    setNewModuleName(null);
                    setTimeout(() => newAppInputRef.current?.focus(), 50);
                  } else {
                    onChange({ applicationId: e.target.value, moduleId: '' });
                    setNewModuleName(null);
                    setNewAppName(null);
                  }
                }}
                size='small'
                fullWidth
                required
                slotProps={{
                  select: { displayEmpty: true },
                  inputLabel: { shrink: true },
                }}
              >
                <MenuItem value=''>Select application</MenuItem>
                <MenuItem value='__new__'>+ Add new application…</MenuItem>
                {applications.map((a) => (
                  <MenuItem key={a._id} value={a._id}>
                    {a.name}
                  </MenuItem>
                ))}
              </TextField>
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
                value={entry.moduleId}
                onChange={(e) => {
                  if (e.target.value === '__new__') {
                    onChange({ moduleId: '' });
                    setNewModuleName('');
                    setTimeout(() => newModuleInputRef.current?.focus(), 50);
                  } else {
                    onChange({ moduleId: e.target.value });
                    setNewModuleName(null);
                  }
                }}
                size='small'
                fullWidth
                required
                disabled={!entry.applicationId}
                slotProps={{
                  select: { displayEmpty: true },
                  inputLabel: { shrink: true },
                }}
              >
                <MenuItem value=''>Select module</MenuItem>
                <MenuItem value='__new__'>+ Add new module…</MenuItem>
                {modules
                  .filter(
                    (m) =>
                      !entry.applicationId ||
                      m.applicationId === entry.applicationId,
                  )
                  .map((m) => (
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
          </>
        )}
      </Stack>
    </Stack>
  );
}

function SetupPhase({
  stories,
  onUpdateStory,
  onAddStory,
  onRemoveStory,
  applications,
  modules,
  error,
  onGenerate,
  onClose,
  onApplicationCreated,
  onModuleCreated,
}) {
  const firstEntry = stories[0];

  const allValid = stories.every((s) => {
    const appId = s.sameAsFirst ? firstEntry.applicationId : s.applicationId;
    const modId = s.sameAsFirst ? firstEntry.moduleId : s.moduleId;
    return JIRA_KEY_RE.test(s.jiraStory.trim()) && appId && modId;
  });

  return (
    <>
      <DialogContent>
        <Stack spacing={2}>
          {error && <Alert severity='error'>{error}</Alert>}
          <Alert severity='info' icon={<AutoAwesomeIcon />}>
            Enter one or more Jira story keys. The AI will read each story and
            generate test cases for your review, one story at a time.
          </Alert>
          {stories.map((entry, i) => (
            <StoryRow
              key={entry._id}
              index={i}
              total={stories.length}
              entry={entry}
              firstEntry={firstEntry}
              applications={applications}
              modules={modules}
              onChange={(patch) => onUpdateStory(i, patch)}
              onRemove={() => onRemoveStory(i)}
              onApplicationCreated={onApplicationCreated}
              onModuleCreated={onModuleCreated}
            />
          ))}
          <Button
            variant='outlined'
            size='small'
            startIcon={<AddIcon />}
            onClick={onAddStory}
            sx={{ alignSelf: 'flex-start' }}
          >
            Add another story
          </Button>
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
          {stories.length === 1
            ? 'Generate test cases'
            : `Generate from ${stories.length} stories`}
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
  currentStoryIndex,
  totalStories,
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
  const storyIdRef = useRef(0);
  const nextId = () => {
    storyIdRef.current += 1;
    return storyIdRef.current;
  };
  const [stories, setStories] = useState(() => [
    {
      _id: 1,
      jiraStory: '',
      applicationId: '',
      moduleId: '',
      sameAsFirst: false,
    },
  ]);
  const [currentStoryIndex, setCurrentStoryIndex] = useState(0);
  const [totalCreated, setTotalCreated] = useState(0);
  const [error, setError] = useState(null);
  // slides-phase state
  const [slides, setSlides] = useState([]);
  const [storyKey, setStoryKey] = useState('');
  const [applicationId, setApplicationId] = useState('');
  const [moduleId, setModuleId] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [decisions, setDecisions] = useState({});
  const [edits, setEdits] = useState({});
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  useEffect(() => {
    if (!open) return;
    storyIdRef.current = 1;
    setPhase('setup');
    setStories([
      {
        _id: 1,
        jiraStory: '',
        applicationId: '',
        moduleId: '',
        sameAsFirst: false,
      },
    ]);
    setCurrentStoryIndex(0);
    setTotalCreated(0);
    setError(null);
    setCreateError(null);
    setSlides([]);
    setDecisions({});
    setEdits({});
    setCurrentIndex(0);
  }, [open]);

  function updateStoryEntry(i, patch) {
    setStories((prev) =>
      prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)),
    );
  }
  function addStoryEntry() {
    const id = nextId();
    setStories((prev) => [
      ...prev,
      {
        _id: id,
        jiraStory: '',
        applicationId: '',
        moduleId: '',
        sameAsFirst: false,
      },
    ]);
  }
  function removeStoryEntry(i) {
    setStories((prev) => prev.filter((_, idx) => idx !== i));
  }

  const handleGenerateNext = useCallback(
    async (index) => {
      const raw = stories[index];
      const first = stories[0];
      const entry = raw.sameAsFirst
        ? {
            ...raw,
            applicationId: first.applicationId,
            moduleId: first.moduleId,
          }
        : raw;
      setCurrentStoryIndex(index);
      setPhase('generating');
      setError(null);
      try {
        const res = await fetch(
          `/api/releases/${releaseId}/ai-generate-cases`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jiraStory: entry.jiraStory.trim() }),
          },
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Generation failed');
        setSlides(data.testCases);
        setStoryKey(data.story.key);
        setApplicationId(entry.applicationId);
        setModuleId(entry.moduleId);
        setCurrentIndex(0);
        setDecisions({});
        setEdits({});
        setPhase('slides');
      } catch (err) {
        setError(err.message);
        setPhase('setup');
      }
    },
    [stories, releaseId],
  );

  const advanceOrFinish = useCallback(
    (addedCount) => {
      const newTotal = totalCreated + addedCount;
      setTotalCreated(newTotal);
      const next = currentStoryIndex + 1;
      if (next < stories.length) {
        handleGenerateNext(next);
      } else {
        onSuccess(newTotal);
      }
    },
    [
      totalCreated,
      currentStoryIndex,
      stories.length,
      handleGenerateNext,
      onSuccess,
    ],
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
          stories={stories}
          onUpdateStory={updateStoryEntry}
          onAddStory={addStoryEntry}
          onRemoveStory={removeStoryEntry}
          applications={applications}
          modules={modules}
          error={error}
          onGenerate={() => handleGenerateNext(0)}
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
              Generating test cases for story {currentStoryIndex + 1} of{' '}
              {stories.length}…
            </Typography>
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
          currentStoryIndex={currentStoryIndex}
          totalStories={stories.length}
          creating={creating}
          createError={createError}
          onCreateApproved={handleCreateApproved}
          onSkipStory={stories.length > 1 ? handleSkipStory : null}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}
