'use client';

import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
 *   - Edit the story key (inline) and retry
 *   - Create the issue without linking it to any story
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {Array<{ tcId: string, summary: string, description: string, jiraStory?: string|null }>} props.drafts
 * @param {(issue: { tcId: string, summary: string, description: string, skipLink?: boolean, storyOverride?: string }) => Promise<unknown>} props.onCreate
 * @param {() => void} props.onClose
 * @param {((draft: { summary: string, description: string }) => Promise<{ summary: string, description: string }>)=} props.onImprove
 * @param {((storyKey: string) => Promise<{ valid: boolean }>)=} props.onValidateStory
 * @see {@link components/__tests__/JiraDraftReviewDialog.test.jsx}
 */
export default function JiraDraftReviewDialog({
  open,
  drafts,
  onCreate,
  onClose,
  onImprove,
  onValidateStory,
}) {
  const [index, setIndex] = useState(0);
  const [summary, setSummary] = useState(drafts[0]?.summary ?? '');
  const [description, setDescription] = useState(drafts[0]?.description ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [validating, setValidating] = useState(false);
  const [improving, setImproving] = useState(false);
  const [error, setError] = useState('');
  // When the story key isn't found: stores the key so the user can edit it
  const [storyWarning, setStoryWarning] = useState(null); // { key: string, editKey: string }

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
    // If a story warning is already showing, the user must pick an action
    if (storyWarning) return;

    // Validate the linked story key before creating, if a validator was provided
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
        // On network error, proceed — don't block creation over a failed check
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
      <DialogTitle>
        Review Jira issue ({index + 1} of {total})
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant='body2' color='text.secondary'>
            Review and edit the issue before it is created in Jira. Project,
            issue type, and the story link are derived from the test case.
          </Typography>
          {error && <Alert severity='error'>{error}</Alert>}

          {storyWarning && (
            <Alert severity='warning' icon={false}>
              <Stack spacing={1}>
                <Typography variant='body2' fontWeight={500}>
                  Story not found in Jira
                </Typography>
                <Typography variant='body2'>
                  <strong>{storyWarning.key}</strong> could not be found. Enter
                  a different story key to link to, or create the issue without
                  a story link.
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
                  disabled={busy}
                  placeholder='e.g. AIOP-123'
                  sx={{ maxWidth: 200 }}
                />
              </Stack>
            </Alert>
          )}

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
            minRows={8}
            maxRows={16}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={busy}
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between' }}>
        <Stack direction='row' spacing={1}>
          {onImprove && !storyWarning && (
            <Button
              variant='outlined'
              size='small'
              onClick={handleImprove}
              disabled={busy || !summary.trim() || !description.trim()}
              startIcon={
                improving ? (
                  <CircularProgress size={14} color='inherit' />
                ) : (
                  <AutoAwesomeOutlinedIcon />
                )
              }
            >
              {improving ? 'Improving…' : 'Improve with AI'}
            </Button>
          )}
        </Stack>
        <Stack direction='row' spacing={1}>
          <Button onClick={onClose} disabled={busy}>
            Cancel remaining
          </Button>
          <Button onClick={advance} disabled={busy}>
            Skip
          </Button>

          {storyWarning ? (
            <>
              <Button
                variant='outlined'
                onClick={handleCreateWithoutLink}
                disabled={busy}
                startIcon={
                  submitting ? (
                    <CircularProgress size={14} color='inherit' />
                  ) : (
                    <LinkOffIcon />
                  )
                }
              >
                Create without linking
              </Button>
              <Button
                variant='contained'
                onClick={handleCreateWithOverride}
                disabled={
                  busy ||
                  !storyWarning.editKey.trim() ||
                  !summary.trim() ||
                  !description.trim()
                }
                startIcon={
                  busy ? (
                    <CircularProgress size={14} color='inherit' />
                  ) : (
                    <EditOutlinedIcon />
                  )
                }
              >
                {validating ? 'Checking…' : 'Create with this key'}
              </Button>
            </>
          ) : (
            <Button
              variant='contained'
              onClick={handleCreate}
              disabled={busy || !summary.trim() || !description.trim()}
              startIcon={
                busy ? (
                  <CircularProgress size={14} color='inherit' />
                ) : undefined
              }
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
