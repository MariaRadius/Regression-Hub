'use client';

import BlockOutlinedIcon from '@mui/icons-material/BlockOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import CloseIcon from '@mui/icons-material/Close';
import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck';
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
  Divider,
  IconButton,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { acknowledgeDiscardedStory, getStoryTestCases } from '@/lib/api/jira';

/**
 * Dialog for reviewing and archiving test cases when their linked Jira
 * story has been discarded (status: Deferred, Grooming, etc. or removed
 * from sprint).
 *
 * Non-AI flow: fetches the list of linked test cases, user selects which
 * to delete, then confirms. All selected cases are hard-deleted.
 */
export default function JiraStoryDiscardDialog({
  open,
  storyKey,
  jiraSummary,
  jiraStatus,
  onClose,
  onAcknowledged,
}) {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [testCases, setTestCases] = useState(null);
  const [checked, setChecked] = useState(new Set());
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [doneResult, setDoneResult] = useState(null);

  // Fetch test cases when dialog opens
  useEffect(() => {
    if (!open || !storyKey) return;
    setLoading(true);
    setFetchError(null);
    setTestCases(null);
    setChecked(new Set());
    setDeleteError(null);
    setDoneResult(null);

    getStoryTestCases(storyKey)
      .then((data) => {
        const cases = data?.testCases ?? [];
        setTestCases(cases);
        // Pre-select all cases — intent of the discard flow is cleanup
        setChecked(new Set(cases.map((tc) => tc._id)));
      })
      .catch((err) => {
        setFetchError(err?.message ?? 'Failed to load test cases');
      })
      .finally(() => setLoading(false));
  }, [open, storyKey]);

  const toggle = useCallback((id) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setChecked(new Set((testCases ?? []).map((tc) => tc._id)));
  }, [testCases]);

  const selectNone = useCallback(() => {
    setChecked(new Set());
  }, []);

  const handleAcknowledge = useCallback(async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      const result = await acknowledgeDiscardedStory(storyKey, {
        deleteIds: [...checked],
      });
      if (result?.ok) {
        onAcknowledged?.(storyKey, result.deleted ?? 0);
        setDoneResult(result);
        router.refresh();
      } else {
        const failMsgs = (result?.failed ?? []).map((f) => f.error);
        setDeleteError(
          `${result?.failed?.length ?? 1} deletion(s) failed: ${[...new Set(failMsgs)].join('; ')}`,
        );
      }
    } catch (err) {
      setDeleteError(err?.message ?? 'Operation failed');
    } finally {
      setDeleting(false);
    }
  }, [storyKey, checked, onAcknowledged, router]);

  const totalCases = testCases?.length ?? 0;

  return (
    <Dialog
      open={open}
      onClose={deleting ? undefined : onClose}
      maxWidth='sm'
      fullWidth
    >
      <DialogTitle sx={{ pb: 1 }}>
        <Stack direction='row' spacing={1} sx={{ alignItems: 'flex-start' }}>
          <BlockOutlinedIcon color='warning' sx={{ mt: 0.25, flexShrink: 0 }} />
          <Stack sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant='subtitle1' fontWeight={600}>
              Story Discarded
            </Typography>
            <Typography variant='caption' color='text.secondary' noWrap>
              {storyKey}
              {jiraSummary ? ` — ${jiraSummary}` : ''}
              {jiraStatus ? ` · ${jiraStatus}` : ''}
            </Typography>
          </Stack>
          <IconButton size='small' onClick={onClose} disabled={deleting}>
            <CloseIcon fontSize='small' />
          </IconButton>
        </Stack>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 0 }}>
        {/* Loading skeletons */}
        {loading && (
          <Stack spacing={1.5} sx={{ p: 2 }}>
            <Skeleton variant='rounded' height={44} />
            <Skeleton variant='rounded' height={44} />
            <Skeleton variant='rounded' height={44} />
          </Stack>
        )}

        {/* Fetch error */}
        {!loading && fetchError && (
          <Alert severity='error' sx={{ m: 2 }}>
            {fetchError}
          </Alert>
        )}

        {/* Success state */}
        {doneResult && (
          <Stack spacing={1.5} sx={{ p: 3, alignItems: 'flex-start' }}>
            <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
              <CheckCircleOutlinedIcon color='success' />
              <Typography variant='subtitle2' fontWeight={600}>
                Review complete
              </Typography>
            </Stack>
            <Typography variant='body2' color='text.secondary'>
              {doneResult.deleted > 0
                ? `${doneResult.deleted} test case${doneResult.deleted === 1 ? '' : 's'} deleted.`
                : 'No test cases were deleted.'}{' '}
              Story marked as acknowledged.
            </Typography>
          </Stack>
        )}

        {/* Test case checklist */}
        {!loading &&
          !fetchError &&
          !doneResult &&
          testCases !== null &&
          (totalCases === 0 ? (
            <Stack spacing={1} sx={{ p: 3, alignItems: 'center' }}>
              <Typography
                variant='body2'
                color='text.secondary'
                textAlign='center'
              >
                No test cases are linked to this story.
              </Typography>
              <Typography
                variant='body2'
                color='text.secondary'
                textAlign='center'
              >
                Click Acknowledge to remove it from notifications.
              </Typography>
            </Stack>
          ) : (
            <>
              <Alert severity='warning' sx={{ mx: 2, mt: 2 }}>
                This story is no longer in scope. Select the test cases to
                delete, then click Acknowledge.
              </Alert>
              <Stack divider={<Divider />} sx={{ mt: 1 }}>
                {testCases.map((tc) => (
                  <Stack
                    key={tc._id}
                    direction='row'
                    spacing={1.5}
                    sx={{ px: 2, py: 1.25, alignItems: 'flex-start' }}
                  >
                    <Checkbox
                      checked={checked.has(tc._id)}
                      onChange={() => toggle(tc._id)}
                      size='small'
                      sx={{ mt: -0.25, flexShrink: 0 }}
                    />
                    <Stack spacing={0.5} sx={{ flex: 1, minWidth: 0 }}>
                      <Stack
                        direction='row'
                        spacing={1}
                        sx={{ alignItems: 'center', flexWrap: 'wrap' }}
                      >
                        {tc.testKey && (
                          <Typography
                            component='span'
                            sx={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              px: 0.75,
                              py: 0.15,
                              borderRadius: '4px',
                              border: '1px solid',
                              borderColor: 'divider',
                              bgcolor: 'grey.50',
                              fontFamily:
                                '"JetBrains Mono","Fira Code","IBM Plex Mono",monospace',
                              fontSize: '0.675rem',
                              fontWeight: 700,
                              letterSpacing: '0.04em',
                              lineHeight: 1.5,
                              whiteSpace: 'nowrap',
                              flexShrink: 0,
                            }}
                          >
                            {tc.testKey}
                          </Typography>
                        )}
                        <Typography
                          variant='body2'
                          fontWeight={500}
                          noWrap
                          sx={{ flex: 1 }}
                        >
                          {tc.testCase}
                        </Typography>
                      </Stack>
                      {(tc.type || tc.priority) && (
                        <Stack direction='row' spacing={0.5}>
                          {tc.priority && (
                            <Chip
                              label={tc.priority}
                              size='small'
                              variant='outlined'
                              color={
                                tc.priority === 'High'
                                  ? 'error'
                                  : tc.priority === 'Medium'
                                    ? 'warning'
                                    : 'default'
                              }
                              sx={{ height: 20, fontSize: '0.7rem' }}
                            />
                          )}
                          {tc.type && (
                            <Chip
                              label={tc.type}
                              size='small'
                              variant='outlined'
                              sx={{ height: 20, fontSize: '0.7rem' }}
                            />
                          )}
                        </Stack>
                      )}
                    </Stack>
                  </Stack>
                ))}
              </Stack>
              <Stack
                direction='row'
                spacing={1}
                sx={{
                  px: 2,
                  py: 1,
                  borderTop: 1,
                  borderColor: 'divider',
                  alignItems: 'center',
                }}
              >
                <Button size='small' onClick={selectAll}>
                  Select all
                </Button>
                <Button size='small' onClick={selectNone}>
                  Select none
                </Button>
                <Typography
                  variant='caption'
                  color='text.secondary'
                  sx={{ ml: 'auto' }}
                >
                  {checked.size} of {totalCases} selected
                </Typography>
              </Stack>
            </>
          ))}

        {deleteError && (
          <Alert severity='error' sx={{ mx: 2, mb: 1 }}>
            {deleteError}
          </Alert>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        {doneResult ? (
          <Button variant='contained' onClick={onClose}>
            Done
          </Button>
        ) : (
          <>
            <Button onClick={onClose} disabled={deleting}>
              Cancel
            </Button>
            <Button
              variant='contained'
              color='warning'
              onClick={handleAcknowledge}
              disabled={loading || !!fetchError || deleting}
              startIcon={
                deleting ? (
                  <CircularProgress size={16} color='inherit' />
                ) : (
                  <PlaylistAddCheckIcon />
                )
              }
            >
              {deleting
                ? 'Processing…'
                : checked.size > 0
                  ? `Delete (${checked.size}) & Acknowledge`
                  : 'Acknowledge'}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
