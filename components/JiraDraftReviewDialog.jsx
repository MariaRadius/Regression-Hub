'use client';

import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { JIRA_KEY_RE } from '@/lib/schemas/testCases';

/**
 * Steps through editable Jira issue drafts after a Fail (ask mode).
 * For each draft the QA can edit the summary/description, then Create (calls
 * `onCreate({ tcId, summary, description, skipLink?, storyOverride? })`,
 * awaiting it; a rejection keeps the current draft and shows the error) or Skip.
 * After the last draft — or via "Cancel remaining" — `onClose` is called.
 *
 * When `onValidateStory` is provided, clicking "Create issue" first validates
 * the draft's linked Jira story. If the story is not found, an inline warning
 * is shown with two options:
 *   - Edit the story key (inline) and retry — also updates the test case via `onUpdateStory`
 *   - Create the issue without linking it to any story
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {Array<{ tcId: string, summary: string, description: string, jiraStory?: string|null }>} props.drafts
 * @param {(issue: { tcId: string, summary: string, description: string, skipLink?: boolean, storyOverride?: string }) => Promise<unknown>} props.onCreate
 * @param {() => void} props.onClose
 * @param {((draft: { summary: string, description: string }) => Promise<{ summary: string, description: string }>)=} props.onImprove
 * @param {((storyKey: string) => Promise<{ valid: boolean }>)=} props.onValidateStory
 * @param {((tcId: string, storyKey: string) => Promise<unknown>)=} props.onUpdateStory
 *   Called after a successful "Create with this key" to persist the corrected story key on the test case.
 * @see {@link components/__tests__/JiraDraftReviewDialog.test.jsx}
 */
export default function JiraDraftReviewDialog({
  open,
  drafts,
  onCreate,
  onClose,
  onImprove,
  onValidateStory,
  onUpdateStory,
}) {
  const [index, setIndex] = useState(0);
  const [summary, setSummary] = useState(drafts[0]?.summary ?? '');
  const [description, setDescription] = useState(drafts[0]?.description ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [validating, setValidating] = useState(false);
  const [improving, setImproving] = useState(false);
  const [error, setError] = useState('');
  // storyWarning: null when no warning; { key: original bad key, editKey: current user input }
  const [storyWarning, setStoryWarning] = useState(null);

  const draft = drafts[index];
  const total = drafts.length;
  const busy = submitting || improving || validating;

  useEffect(() => {
    setSummary(draft?.summary ?? '');
    setDescription(draft?.description ?? '');
    setError('');
    setStoryWarning(null);
  }, [draft]);

  function advance() {
    if (index + 1 >= total) onClose();
    else setIndex(index + 1);
  }

  async function handleCreate() {
    if (storyWarning) return;

    if (draft.jiraStory && onValidateStory) {
      setValidating(true);
      setError('');
      try {
        const result = await onValidateStory(draft.jiraStory);
        if (!result?.valid) {
          setStoryWarning({ key: draft.jiraStory, editKey: draft.jiraStory });
          return;
        }
      } catch {
        // Network error — don't block creation
      } finally {
        setValidating(false);
      }
    }

    await doCreate({});
  }

  async function handleCreateWithoutLink() {
    await doCreate({ skipLink: true });
  }

  async function handleCreateWithOverride() {
    const newKey = storyWarning?.editKey?.trim().toUpperCase();
    if (!newKey || !JIRA_KEY_RE.test(newKey)) {
      setError('Enter a valid story key (e.g. AIOP-123)');
      return;
    }

    if (onValidateStory) {
      setValidating(true);
      setError('');
      try {
        const result = await onValidateStory(newKey);
        if (!result?.valid) {
          setError(`Story ${newKey} was not found in Jira`);
          return;
        }
      } catch {
        // proceed on network error
      } finally {
        setValidating(false);
      }
    }

    await doCreate({ storyOverride: newKey });
  }

  async function doCreate(extra) {
    setSubmitting(true);
    setError('');
    try {
      await onCreate({ tcId: draft.tcId, summary, description, ...extra });
      // If the user corrected the story key, persist it on the test case in real time
      if (extra.storyOverride && onUpdateStory) {
        try {
          await onUpdateStory(draft.tcId, extra.storyOverride);
        } catch {
          // Non-fatal — issue was already created; silently skip the TC update
        }
      }
      advance();
    } catch (e) {
      setError(e.message || 'Jira issue creation failed');
    } finally {
      setSubmitting(false);
      setStoryWarning(null);
    }
  }

  async function handleImprove() {
    if (!onImprove) return;
    setImproving(true);
    setError('');
    try {
      const improved = await onImprove({ summary, description });
      setSummary(improved.summary);
      setDescription(improved.description);
    } catch (e) {
      setError(e.message || 'AI improvement failed');
    } finally {
      setImproving(false);
    }
  }

  if (!draft) return null;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth='sm'>
      <DialogTitle sx={{ pb: 1 }}>
        <Stack spacing={0.25}>
          <Typography variant='h6' fontWeight={600}>
            Review Jira issue
          </Typography>
          {total > 1 && (
            <Typography variant='caption' color='text.secondary'>
              {index + 1} of {total}
            </Typography>
          )}
        </Stack>
      </DialogTitle>

      <DialogContent sx={{ pt: 0 }}>
        <Stack spacing={2}>
          {!storyWarning && (
            <Typography variant='body2' color='text.secondary'>
              Review and edit before creating in Jira. Project, issue type, and
              story link are derived from the test case.
            </Typography>
          )}

          {error && <Alert severity='error'>{error}</Alert>}

          {storyWarning && (
            <Box
              sx={{
                border: '1px solid',
                borderColor: 'warning.light',
                borderRadius: 2,
                bgcolor: 'warning.50',
                p: 2,
              }}
            >
              <Stack spacing={1.5}>
                <Stack
                  direction='row'
                  spacing={1}
                  sx={{ alignItems: 'center' }}
                >
                  <WarningAmberIcon
                    fontSize='small'
                    sx={{ color: 'warning.main', flexShrink: 0 }}
                  />
                  <Typography
                    variant='body2'
                    fontWeight={600}
                    color='warning.dark'
                  >
                    Story not found in Jira
                  </Typography>
                </Stack>
                <Typography variant='body2' color='text.secondary'>
                  <strong>{storyWarning.key}</strong> could not be found. Edit
                  the story key below and click <em>Create with this key</em> —
                  the test case will be updated automatically. Or create the
                  issue without any story link.
                </Typography>
                <TextField
                  size='small'
                  label='Story key'
                  value={storyWarning.editKey}
                  onChange={(e) =>
                    setStoryWarning((w) => ({
                      ...w,
                      editKey: e.target.value.toUpperCase(),
                    }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateWithOverride();
                  }}
                  disabled={busy}
                  placeholder='e.g. AIOP-123'
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position='start'>
                          <Typography variant='caption' color='text.disabled'>
                            #
                          </Typography>
                        </InputAdornment>
                      ),
                    },
                  }}
                  error={
                    !!storyWarning.editKey &&
                    !JIRA_KEY_RE.test(storyWarning.editKey)
                  }
                  helperText={
                    storyWarning.editKey &&
                    !JIRA_KEY_RE.test(storyWarning.editKey)
                      ? 'Use PROJECT-123 format'
                      : ' '
                  }
                  sx={{ maxWidth: 220 }}
                  autoFocus
                />
              </Stack>
            </Box>
          )}

          <Divider />

          <TextField
            fullWidth
            size='small'
            label='Summary'
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            disabled={busy}
            slotProps={{ htmlInput: { maxLength: 255 } }}
          />
          <TextField
            fullWidth
            label='Description'
            multiline
            minRows={7}
            maxRows={14}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={busy}
          />
        </Stack>
      </DialogContent>

      <DialogActions
        sx={{
          px: 3,
          py: 2,
          borderTop: '1px solid',
          borderColor: 'divider',
          gap: 1,
          justifyContent: 'space-between',
        }}
      >
        {/* Left: AI improve */}
        <Box>
          {onImprove && !storyWarning && (
            <Button
              variant='outlined'
              size='small'
              onClick={handleImprove}
              disabled={busy || !summary.trim() || !description.trim()}
              startIcon={
                improving ? (
                  <CircularProgress size={13} color='inherit' />
                ) : (
                  <AutoAwesomeOutlinedIcon fontSize='small' />
                )
              }
              sx={{ textTransform: 'none' }}
            >
              {improving ? 'Improving…' : 'Improve with AI'}
            </Button>
          )}
        </Box>

        {/* Right: primary actions */}
        <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
          <Button
            onClick={onClose}
            disabled={busy}
            size='small'
            sx={{ color: 'text.secondary', textTransform: 'none' }}
          >
            Cancel
          </Button>
          <Button
            onClick={advance}
            disabled={busy}
            size='small'
            variant='outlined'
            sx={{ textTransform: 'none' }}
          >
            Skip
          </Button>

          {storyWarning ? (
            <>
              <Button
                variant='outlined'
                color='warning'
                size='small'
                onClick={handleCreateWithoutLink}
                disabled={busy}
                startIcon={
                  submitting && !storyWarning.editKey ? (
                    <CircularProgress size={13} color='inherit' />
                  ) : (
                    <LinkOffIcon fontSize='small' />
                  )
                }
                sx={{ textTransform: 'none' }}
              >
                Create without linking
              </Button>
              <Button
                variant='contained'
                size='small'
                onClick={handleCreateWithOverride}
                disabled={
                  busy ||
                  !storyWarning.editKey?.trim() ||
                  !JIRA_KEY_RE.test(storyWarning.editKey) ||
                  !summary.trim() ||
                  !description.trim()
                }
                startIcon={
                  busy ? (
                    <CircularProgress size={13} color='inherit' />
                  ) : undefined
                }
                sx={{ textTransform: 'none', minWidth: 160 }}
              >
                {validating
                  ? 'Checking…'
                  : submitting
                    ? 'Creating…'
                    : 'Create with this key'}
              </Button>
            </>
          ) : (
            <Button
              variant='contained'
              size='small'
              onClick={handleCreate}
              disabled={busy || !summary.trim() || !description.trim()}
              startIcon={
                busy ? (
                  <CircularProgress size={13} color='inherit' />
                ) : undefined
              }
              sx={{ textTransform: 'none', minWidth: 130 }}
            >
              {validating
                ? 'Checking story…'
                : submitting
                  ? 'Creating…'
                  : 'Create issue'}
            </Button>
          )}
        </Stack>
      </DialogActions>
    </Dialog>
  );
}
