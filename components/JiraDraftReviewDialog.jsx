'use client';

import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
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

/**
 * Steps through editable Jira issue drafts after a Fail (ask mode).
 * For each draft the QA can edit the summary/description, then Create (calls
 * `onCreate({ tcId, summary, description })`, awaiting it; a rejection keeps
 * the current draft and shows the error) or Skip. After the last draft —
 * or via "Cancel remaining" — `onClose` is called.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {Array<{ tcId: string, summary: string, description: string }>} props.drafts
 * @param {(issue: { tcId: string, summary: string, description: string }) => Promise<unknown>} props.onCreate
 * @param {() => void} props.onClose
 * @param {((draft: { summary: string, description: string }) => Promise<{ summary: string, description: string }>)=} props.onImprove
 * @see {@link components/__tests__/JiraDraftReviewDialog.test.jsx}
 */
export default function JiraDraftReviewDialog({
  open,
  drafts,
  onCreate,
  onClose,
  onImprove,
}) {
  const [index, setIndex] = useState(0);
  const [summary, setSummary] = useState(drafts[0]?.summary ?? '');
  const [description, setDescription] = useState(drafts[0]?.description ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [improving, setImproving] = useState(false);
  const [error, setError] = useState('');

  const draft = drafts[index];
  const total = drafts.length;
  const busy = submitting || improving;

  useEffect(() => {
    setSummary(draft?.summary ?? '');
    setDescription(draft?.description ?? '');
    setError('');
  }, [draft]);

  function advance() {
    if (index + 1 >= total) onClose();
    else setIndex(index + 1);
  }

  async function handleCreate() {
    setSubmitting(true);
    setError('');
    try {
      await onCreate({ tcId: draft.tcId, summary, description });
      advance();
    } catch (e) {
      setError(e.message || 'Jira issue creation failed');
    } finally {
      setSubmitting(false);
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
          {onImprove && (
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
          <Button
            variant='contained'
            onClick={handleCreate}
            disabled={busy || !summary.trim() || !description.trim()}
          >
            {submitting ? 'Creating…' : 'Create issue'}
          </Button>
        </Stack>
      </DialogActions>
    </Dialog>
  );
}
