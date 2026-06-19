'use client';

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloseIcon from '@mui/icons-material/Close';
import DoDisturbIcon from '@mui/icons-material/DoDisturb';
import {
  Alert,
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
import { useCallback, useEffect, useState } from 'react';
import { createTestCaseForRelease } from '@/lib/api/releases';

const PRIORITIES = ['High', 'Medium', 'Low'];
const TYPES = [
  'Functional Test',
  'Edge Case',
  'Negative Test',
  'Security Test',
];

function SetupPhase({
  jiraStory,
  setJiraStory,
  applicationId,
  setApplicationId,
  moduleId,
  setModuleId,
  applications,
  modules,
  generating,
  error,
  onGenerate,
  onClose,
}) {
  return (
    <>
      <DialogContent>
        <Stack spacing={3}>
          {error && <Alert severity='error'>{error}</Alert>}
          <Alert severity='info' icon={<AutoAwesomeIcon />}>
            Enter a Jira story key. The AI will read the story and generate test
            cases for your review.
          </Alert>
          <TextField
            label='Jira Story Key'
            value={jiraStory}
            onChange={(e) => {
              const raw = e.target.value;
              const fromUrl = raw.match(/\/browse\/([A-Z]+-\d+)/i);
              setJiraStory(
                fromUrl ? fromUrl[1].toUpperCase() : raw.toUpperCase(),
              );
            }}
            placeholder='e.g. RXR-123'
            size='small'
            fullWidth
            disabled={generating}
            autoFocus
          />
          <TextField
            select
            label='Application'
            value={applicationId}
            onChange={(e) => setApplicationId(e.target.value)}
            size='small'
            fullWidth
            required
            disabled={generating}
            slotProps={{
              select: { displayEmpty: true },
              inputLabel: { shrink: true },
            }}
          >
            <MenuItem value=''>Select application</MenuItem>
            {applications.map((a) => (
              <MenuItem key={a._id} value={a._id}>
                {a.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label='Module'
            value={moduleId}
            onChange={(e) => setModuleId(e.target.value)}
            size='small'
            fullWidth
            required
            disabled={generating || !applicationId}
            slotProps={{
              select: { displayEmpty: true },
              inputLabel: { shrink: true },
            }}
          >
            <MenuItem value=''>Select module</MenuItem>
            {modules
              .filter(
                (m) => !applicationId || m.applicationId === applicationId,
              )
              .map((m) => (
                <MenuItem key={m._id} value={m._id}>
                  {m.name}
                </MenuItem>
              ))}
          </TextField>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant='outlined' onClick={onClose} disabled={generating}>
          Cancel
        </Button>
        <Button
          variant='contained'
          startIcon={
            generating ? (
              <CircularProgress size={16} color='inherit' />
            ) : (
              <AutoAwesomeIcon />
            )
          }
          onClick={onGenerate}
          disabled={
            generating || !jiraStory.trim() || !applicationId || !moduleId
          }
        >
          {generating ? 'Generating…' : 'Generate test cases'}
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
  creating,
  createError,
  onCreateApproved,
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
            <Stack direction='row' sx={{ justifyContent: 'space-between' }}>
              <Typography variant='caption' sx={{ color: 'text.secondary' }}>
                {storyKey} — Test case {currentIndex + 1} of {total}
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
}) {
  const [phase, setPhase] = useState('setup');
  const [jiraStory, setJiraStory] = useState('');
  const [applicationId, setApplicationId] = useState('');
  const [moduleId, setModuleId] = useState('');
  const [error, setError] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [slides, setSlides] = useState([]);
  const [storyKey, setStoryKey] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [decisions, setDecisions] = useState({});
  const [edits, setEdits] = useState({});
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setPhase('setup');
    setJiraStory('');
    setApplicationId('');
    setModuleId('');
    setError(null);
    setCreateError(null);
    setSlides([]);
    setDecisions({});
    setEdits({});
    setCurrentIndex(0);
  }, [open]);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/releases/${releaseId}/ai-generate-cases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jiraStory: jiraStory.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Generation failed');
      setSlides(data.testCases);
      setStoryKey(data.story.key);
      setPhase('slides');
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }, [releaseId, jiraStory]);

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

      for (const draft of approved) {
        await createTestCaseForRelease(releaseId, {
          applicationId,
          moduleId,
          testCase: draft.testCase,
          preconditions: draft.preconditions,
          steps: draft.steps,
          expectedResult: draft.expectedResult,
          priority: draft.priority,
          type: draft.type,
          jiraStory: jiraStory.trim(),
        });
      }
      onSuccess(approved.length);
    } catch (err) {
      setCreateError(err.message);
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
    jiraStory,
    onSuccess,
  ]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth='md' fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        <Stack
          direction='row'
          sx={{ justifyContent: 'space-between', alignItems: 'center' }}
        >
          <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
            <AutoAwesomeIcon fontSize='small' color='primary' />
            <Typography variant='panelTitle'>
              {phase === 'setup'
                ? 'Generate from Jira Story'
                : 'Review Generated Test Cases'}
            </Typography>
          </Stack>
          <IconButton size='small' onClick={onClose} aria-label='Close'>
            <CloseIcon fontSize='small' />
          </IconButton>
        </Stack>
      </DialogTitle>

      {phase === 'setup' && (
        <SetupPhase
          jiraStory={jiraStory}
          setJiraStory={setJiraStory}
          applicationId={applicationId}
          setApplicationId={setApplicationId}
          moduleId={moduleId}
          setModuleId={setModuleId}
          applications={applications}
          modules={modules}
          generating={generating}
          error={error}
          onGenerate={handleGenerate}
          onClose={onClose}
        />
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
          creating={creating}
          createError={createError}
          onCreateApproved={handleCreateApproved}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}
