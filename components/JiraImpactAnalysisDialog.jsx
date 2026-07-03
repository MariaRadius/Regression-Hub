'use client';

import AddCircleOutlinedIcon from '@mui/icons-material/AddCircleOutlined';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import ChecklistIcon from '@mui/icons-material/ChecklistRounded';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
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
  MenuItem,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useReleaseEnv } from '@/contexts/ReleaseEnvContext';
import { analyzeStoryImpact } from '@/lib/api/jira';
import {
  createTestCaseInRelease,
  deleteTestCaseById,
  updateTestCaseContent,
} from '@/lib/api/testCases';

const FIELD_LABELS = {
  testCase: 'Description',
  preconditions: 'Preconditions',
  steps: 'Steps',
  expectedResult: 'Expected Result',
  priority: 'Priority',
};

// AI may return HTML for the `steps` field; strip tags for a readable preview.
function toPreviewText(val) {
  return String(val)
    .replace(/<li>/gi, '\n• ')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

export default function JiraImpactAnalysisDialog({
  open,
  storyKey,
  jiraSummary,
  onClose,
  onApplied,
  applications = [],
  modules = [],
}) {
  const { releaseId } = useReleaseEnv();
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [impact, setImpact] = useState(null);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState(null);
  const [applyResult, setApplyResult] = useState(null);

  const [checkedAffected, setCheckedAffected] = useState(new Set());
  const [checkedObsolete, setCheckedObsolete] = useState(new Set());
  const [checkedNew, setCheckedNew] = useState(new Set());
  const [newCaseAppIds, setNewCaseAppIds] = useState({});
  const [newCaseModIds, setNewCaseModIds] = useState({});

  useEffect(() => {
    if (!open || !storyKey) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setImpact(null);
    setApplyError(null);
    setApplyResult(null);
    setCheckedAffected(new Set());
    setCheckedObsolete(new Set());
    setCheckedNew(new Set());
    setNewCaseAppIds({});
    setNewCaseModIds({});

    analyzeStoryImpact(storyKey)
      .then((data) => {
        if (cancelled) return;
        setImpact(data.impact);
        setCheckedAffected(new Set(data.impact.affectedCases.map((c) => c.id)));
        setCheckedObsolete(new Set(data.impact.obsoleteCases.map((c) => c.id)));
        setCheckedNew(new Set(data.impact.newCases.map((_, i) => i)));
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message ?? 'Analysis failed');
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, storyKey]);

  const toggle = useCallback((setter, key) => {
    setter((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  const getAppId = (i) => newCaseAppIds[i] ?? applications[0]?._id ?? '';
  const getModId = (i) => newCaseModIds[i] ?? modules[0]?._id ?? '';
  const modsFor = (appId) => modules.filter((m) => m.applicationId === appId);

  const handleApply = useCallback(async () => {
    if (!releaseId) return;
    setApplying(true);
    setApplyError(null);
    const callOpts = { suppressToastForStatus: [400, 422, 500] };

    // Build labeled tasks so we can report exactly what changed per item.
    const tasks = [
      ...(impact?.affectedCases ?? [])
        .filter((c) => checkedAffected.has(c.id))
        .map((c) => ({
          kind: 'updated',
          label: c.testKey || c.testCase || c.id,
          fields: Object.keys(c.update ?? {}),
          run: () => updateTestCaseContent(releaseId, c.id, c.update, callOpts),
        })),
      ...(impact?.obsoleteCases ?? [])
        .filter((c) => checkedObsolete.has(c.id))
        .map((c) => ({
          kind: 'deleted',
          label: c.testKey || c.testCase || c.id,
          run: () => deleteTestCaseById(releaseId, c.id, callOpts),
        })),
      ...(impact?.newCases ?? [])
        .map((tc, i) => ({ tc, i }))
        .filter(({ i }) => checkedNew.has(i))
        .map(({ tc, i }) => ({
          kind: 'added',
          label: tc.testCase,
          run: () =>
            createTestCaseInRelease(
              releaseId,
              {
                ...tc,
                applicationId: newCaseAppIds[i] ?? applications[0]?._id ?? '',
                moduleId: newCaseModIds[i] ?? modules[0]?._id ?? '',
                jiraStory: storyKey,
                source: 'ai',
              },
              callOpts,
            ),
        })),
    ];

    try {
      const results = await Promise.allSettled(tasks.map((t) => t.run()));
      const succeeded = [];
      const failed = [];
      results.forEach((r, idx) => {
        if (r.status === 'fulfilled') succeeded.push(tasks[idx]);
        else
          failed.push({
            task: tasks[idx],
            message: r.reason?.message ?? 'Unknown error',
          });
      });

      if (succeeded.length > 0) {
        const updated = succeeded.filter((t) => t.kind === 'updated');
        const deleted = succeeded.filter((t) => t.kind === 'deleted');
        const added = succeeded.filter((t) => t.kind === 'added');
        onApplied?.({
          updated: updated.length,
          deleted: deleted.length,
          added: added.length,
        });
        routerRef.current.refresh();
        setApplyResult({ updated, deleted, added, failed });
      } else if (failed.length > 0) {
        const msgs = [...new Set(failed.map((f) => f.message))];
        setApplyError(
          `${failed.length} operation(s) failed: ${msgs.join('; ')}`,
        );
      }
    } finally {
      setApplying(false);
    }
  }, [
    impact,
    checkedAffected,
    checkedObsolete,
    checkedNew,
    releaseId,
    storyKey,
    newCaseAppIds,
    newCaseModIds,
    applications,
    modules,
    onApplied,
  ]);

  const totalChecked =
    checkedAffected.size + checkedObsolete.size + checkedNew.size;

  return (
    <Dialog open={open} onClose={onClose} maxWidth='md' fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
          <AutoFixHighIcon color='primary' />
          <Stack sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant='subtitle1' fontWeight={600}>
              AI Impact Analysis
            </Typography>
            <Typography variant='caption' color='text.secondary' noWrap>
              {storyKey}
              {jiraSummary ? ` — ${jiraSummary}` : ''}
            </Typography>
          </Stack>
          <IconButton size='small' onClick={onClose}>
            <CloseIcon fontSize='small' />
          </IconButton>
        </Stack>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 0 }}>
        {applyResult && (
          <Stack spacing={2} sx={{ p: 3 }}>
            <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
              <IconButton
                size='small'
                aria-label='Back to changes'
                onClick={() => setApplyResult(null)}
              >
                <ArrowBackIcon fontSize='small' />
              </IconButton>
              <CheckCircleOutlinedIcon color='success' />
              <Typography variant='subtitle1' fontWeight={600}>
                Changes applied
              </Typography>
            </Stack>
            <Typography variant='body2' color='text.secondary'>
              {[
                applyResult.updated.length &&
                  `${applyResult.updated.length} updated`,
                applyResult.added.length && `${applyResult.added.length} added`,
                applyResult.deleted.length &&
                  `${applyResult.deleted.length} removed`,
              ]
                .filter(Boolean)
                .join(' · ')}
              {' for '}
              {storyKey}.
            </Typography>

            {applyResult.updated.length > 0 && (
              <Stack spacing={0.5}>
                <Stack
                  direction='row'
                  spacing={1}
                  sx={{ alignItems: 'center' }}
                >
                  <EditOutlinedIcon color='warning' fontSize='small' />
                  <Typography variant='body2' fontWeight={600}>
                    Updated
                  </Typography>
                </Stack>
                {applyResult.updated.map((t) => (
                  <Typography
                    key={`u-${t.label}`}
                    variant='body2'
                    color='text.secondary'
                    sx={{ pl: 3.5 }}
                  >
                    {t.label}
                    {t.fields?.length ? ` (${t.fields.join(', ')})` : ''}
                  </Typography>
                ))}
              </Stack>
            )}

            {applyResult.added.length > 0 && (
              <Stack spacing={0.5}>
                <Stack
                  direction='row'
                  spacing={1}
                  sx={{ alignItems: 'center' }}
                >
                  <AddCircleOutlinedIcon color='success' fontSize='small' />
                  <Typography variant='body2' fontWeight={600}>
                    Added
                  </Typography>
                </Stack>
                {applyResult.added.map((t) => (
                  <Typography
                    key={`a-${t.label}`}
                    variant='body2'
                    color='text.secondary'
                    sx={{ pl: 3.5 }}
                  >
                    {t.label}
                  </Typography>
                ))}
              </Stack>
            )}

            {applyResult.deleted.length > 0 && (
              <Stack spacing={0.5}>
                <Stack
                  direction='row'
                  spacing={1}
                  sx={{ alignItems: 'center' }}
                >
                  <DeleteOutlinedIcon color='error' fontSize='small' />
                  <Typography variant='body2' fontWeight={600}>
                    Removed
                  </Typography>
                </Stack>
                {applyResult.deleted.map((t) => (
                  <Typography
                    key={`d-${t.label}`}
                    variant='body2'
                    color='text.secondary'
                    sx={{ pl: 3.5 }}
                  >
                    {t.label}
                  </Typography>
                ))}
              </Stack>
            )}

            {applyResult.failed.length > 0 && (
              <Alert severity='warning'>
                {applyResult.failed.length} operation(s) failed:{' '}
                {[...new Set(applyResult.failed.map((f) => f.message))].join(
                  '; ',
                )}
              </Alert>
            )}
          </Stack>
        )}

        {!applyResult && loading && (
          <Stack spacing={2} sx={{ p: 3 }}>
            <Skeleton variant='rounded' height={56} />
            <Skeleton variant='rounded' height={56} />
            <Skeleton variant='rounded' height={56} />
          </Stack>
        )}

        {!applyResult && error && (
          <Alert severity='error' sx={{ m: 2 }}>
            {error}
          </Alert>
        )}

        {!applyResult && !loading && !error && impact && (
          <Stack>
            {/* Update affected */}
            <Accordion defaultExpanded disableGutters elevation={0}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Stack
                  direction='row'
                  spacing={1}
                  sx={{ alignItems: 'center' }}
                >
                  <EditOutlinedIcon color='warning' fontSize='small' />
                  <Typography fontWeight={600}>Update affected</Typography>
                  <Chip
                    label={impact.affectedCases.length}
                    size='small'
                    color='warning'
                    variant='outlined'
                  />
                </Stack>
              </AccordionSummary>
              <AccordionDetails sx={{ p: 0 }}>
                {impact.affectedCases.length === 0 ? (
                  <Typography
                    variant='body2'
                    color='text.secondary'
                    sx={{ px: 3, pb: 2 }}
                  >
                    No updates needed.
                  </Typography>
                ) : (
                  <Stack divider={<Divider />}>
                    {impact.affectedCases.map((c) => (
                      <Stack
                        key={c.id}
                        direction='row'
                        spacing={1.5}
                        sx={{ px: 2, py: 1.25, alignItems: 'flex-start' }}
                      >
                        <Checkbox
                          checked={checkedAffected.has(c.id)}
                          onChange={() => toggle(setCheckedAffected, c.id)}
                          size='small'
                        />
                        <Stack spacing={0.5} sx={{ flex: 1, minWidth: 0 }}>
                          <Stack
                            direction='row'
                            spacing={1}
                            sx={{ alignItems: 'center' }}
                          >
                            {c.testKey && (
                              <Chip
                                label={c.testKey}
                                size='small'
                                color='warning'
                                variant='outlined'
                                sx={{
                                  fontWeight: 600,
                                  height: 20,
                                  fontSize: '0.7rem',
                                }}
                              />
                            )}
                            <Typography variant='body2' fontWeight={500} noWrap>
                              {c.testCase || c.id}
                            </Typography>
                          </Stack>
                          <Typography variant='body2' color='text.secondary'>
                            {c.reason}
                          </Typography>
                          {c.update && Object.keys(c.update).length > 0 && (
                            <Stack spacing={0.75} sx={{ mt: 0.5 }}>
                              {Object.entries(c.update).map(([field, val]) => (
                                <Stack
                                  key={field}
                                  spacing={0.25}
                                  sx={{
                                    borderLeft: 3,
                                    borderColor: 'warning.main',
                                    bgcolor: 'action.hover',
                                    borderRadius: 1,
                                    px: 1.25,
                                    py: 0.75,
                                  }}
                                >
                                  <Typography
                                    variant='caption'
                                    fontWeight={700}
                                    color='warning.main'
                                    sx={{
                                      textTransform: 'uppercase',
                                      letterSpacing: 0.4,
                                    }}
                                  >
                                    {FIELD_LABELS[field] ?? field}
                                  </Typography>
                                  <Typography
                                    variant='body2'
                                    sx={{
                                      whiteSpace: 'pre-wrap',
                                      wordBreak: 'break-word',
                                    }}
                                  >
                                    {toPreviewText(val)}
                                  </Typography>
                                </Stack>
                              ))}
                            </Stack>
                          )}
                        </Stack>
                      </Stack>
                    ))}
                  </Stack>
                )}
              </AccordionDetails>
            </Accordion>

            <Divider />

            {/* Add new */}
            <Accordion defaultExpanded disableGutters elevation={0}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Stack
                  direction='row'
                  spacing={1}
                  sx={{ alignItems: 'center' }}
                >
                  <AddCircleOutlinedIcon color='success' fontSize='small' />
                  <Typography fontWeight={600}>Add new</Typography>
                  <Chip
                    label={impact.newCases.length}
                    size='small'
                    color='success'
                    variant='outlined'
                  />
                </Stack>
              </AccordionSummary>
              <AccordionDetails sx={{ p: 0 }}>
                {impact.newCases.length === 0 ? (
                  <Typography
                    variant='body2'
                    color='text.secondary'
                    sx={{ px: 3, pb: 2 }}
                  >
                    No new cases suggested.
                  </Typography>
                ) : (
                  <Stack divider={<Divider />}>
                    {impact.newCases.map((tc, i) => {
                      const appId = getAppId(i);
                      return (
                        <Stack
                          key={`${tc.testCase}-${tc.type}-${tc.priority}`}
                          direction='row'
                          spacing={1.5}
                          sx={{ px: 2, py: 1.5, alignItems: 'flex-start' }}
                        >
                          <Checkbox
                            checked={checkedNew.has(i)}
                            onChange={() => toggle(setCheckedNew, i)}
                            size='small'
                          />
                          <Stack spacing={1} sx={{ flex: 1, minWidth: 0 }}>
                            <Stack
                              direction='row'
                              spacing={1}
                              sx={{ alignItems: 'center' }}
                            >
                              <Typography
                                variant='body2'
                                fontWeight={500}
                                sx={{ flex: 1 }}
                              >
                                {tc.testCase}
                              </Typography>
                              <Chip
                                label={tc.type}
                                size='small'
                                variant='outlined'
                              />
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
                              />
                            </Stack>
                            <Stack direction='row' spacing={1.5}>
                              <TextField
                                select
                                size='small'
                                label='Application'
                                value={appId}
                                onChange={(e) => {
                                  setNewCaseAppIds((p) => ({
                                    ...p,
                                    [i]: e.target.value,
                                  }));
                                  setNewCaseModIds((p) => ({ ...p, [i]: '' }));
                                }}
                                slotProps={{
                                  select: { displayEmpty: true },
                                  inputLabel: { shrink: true },
                                }}
                                sx={{ flex: 1 }}
                              >
                                <MenuItem value=''>Select app…</MenuItem>
                                {applications.map((a) => (
                                  <MenuItem key={a._id} value={a._id}>
                                    {a.name}
                                  </MenuItem>
                                ))}
                              </TextField>
                              <TextField
                                select
                                size='small'
                                label='Module'
                                value={getModId(i)}
                                onChange={(e) =>
                                  setNewCaseModIds((p) => ({
                                    ...p,
                                    [i]: e.target.value,
                                  }))
                                }
                                slotProps={{
                                  select: { displayEmpty: true },
                                  inputLabel: { shrink: true },
                                }}
                                sx={{ flex: 1 }}
                              >
                                <MenuItem value=''>Select module…</MenuItem>
                                {modsFor(appId).map((m) => (
                                  <MenuItem key={m._id} value={m._id}>
                                    {m.name}
                                  </MenuItem>
                                ))}
                              </TextField>
                            </Stack>
                          </Stack>
                        </Stack>
                      );
                    })}
                  </Stack>
                )}
              </AccordionDetails>
            </Accordion>

            <Divider />

            {/* Remove obsolete */}
            <Accordion defaultExpanded disableGutters elevation={0}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Stack
                  direction='row'
                  spacing={1}
                  sx={{ alignItems: 'center' }}
                >
                  <DeleteOutlinedIcon color='error' fontSize='small' />
                  <Typography fontWeight={600}>Remove obsolete</Typography>
                  <Chip
                    label={impact.obsoleteCases.length}
                    size='small'
                    color='error'
                    variant='outlined'
                  />
                </Stack>
              </AccordionSummary>
              <AccordionDetails sx={{ p: 0 }}>
                {impact.obsoleteCases.length === 0 ? (
                  <Typography
                    variant='body2'
                    color='text.secondary'
                    sx={{ px: 3, pb: 2 }}
                  >
                    No obsolete cases found.
                  </Typography>
                ) : (
                  <Stack divider={<Divider />}>
                    {impact.obsoleteCases.map((c) => (
                      <Stack
                        key={c.id}
                        direction='row'
                        spacing={1.5}
                        sx={{ px: 2, py: 1.25, alignItems: 'flex-start' }}
                      >
                        <Checkbox
                          checked={checkedObsolete.has(c.id)}
                          onChange={() => toggle(setCheckedObsolete, c.id)}
                          size='small'
                        />
                        <Stack spacing={0.5} sx={{ flex: 1, minWidth: 0 }}>
                          <Stack
                            direction='row'
                            spacing={1}
                            sx={{ alignItems: 'center' }}
                          >
                            {c.testKey && (
                              <Chip
                                label={c.testKey}
                                size='small'
                                color='error'
                                variant='outlined'
                                sx={{
                                  fontWeight: 600,
                                  height: 20,
                                  fontSize: '0.7rem',
                                }}
                              />
                            )}
                            <Typography variant='body2' fontWeight={500} noWrap>
                              {c.testCase || c.id}
                            </Typography>
                          </Stack>
                          <Typography variant='body2' color='error.main'>
                            {c.reason}
                          </Typography>
                        </Stack>
                      </Stack>
                    ))}
                  </Stack>
                )}
              </AccordionDetails>
            </Accordion>

            <Divider />

            {/* Unaffected */}
            <Accordion disableGutters elevation={0}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Stack
                  direction='row'
                  spacing={1}
                  sx={{ alignItems: 'center' }}
                >
                  <CheckCircleOutlinedIcon color='success' fontSize='small' />
                  <Typography fontWeight={600}>Unaffected</Typography>
                  <Chip
                    label={(impact.unaffectedCases ?? []).length}
                    size='small'
                    color='success'
                    variant='outlined'
                  />
                </Stack>
              </AccordionSummary>
              <AccordionDetails sx={{ p: 0 }}>
                {(impact.unaffectedCases ?? []).length === 0 ? (
                  <Typography
                    variant='body2'
                    color='text.secondary'
                    sx={{ px: 3, pb: 2 }}
                  >
                    All cases were categorised above.
                  </Typography>
                ) : (
                  <Stack divider={<Divider />}>
                    {(impact.unaffectedCases ?? []).map((c) => (
                      <Stack
                        key={c.id}
                        direction='row'
                        spacing={1}
                        sx={{ px: 2, py: 1, alignItems: 'center' }}
                      >
                        {c.testKey && (
                          <Chip
                            label={c.testKey}
                            size='small'
                            variant='outlined'
                            sx={{
                              fontWeight: 600,
                              height: 20,
                              fontSize: '0.7rem',
                              flexShrink: 0,
                            }}
                          />
                        )}
                        <Typography
                          variant='body2'
                          color='text.secondary'
                          noWrap
                        >
                          {c.testCase || c.id}
                        </Typography>
                      </Stack>
                    ))}
                  </Stack>
                )}
              </AccordionDetails>
            </Accordion>
          </Stack>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        {applyResult ? (
          <Button variant='contained' onClick={onClose}>
            Done
          </Button>
        ) : (
          <>
            {applyError && (
              <Alert severity='error' sx={{ flex: 1 }}>
                {applyError}
              </Alert>
            )}
            {!applyError && !releaseId && (
              <Typography
                variant='caption'
                color='text.secondary'
                sx={{ flex: 1 }}
              >
                Select a release from the top bar to apply changes.
              </Typography>
            )}
            <Button onClick={onClose} disabled={applying}>
              Cancel
            </Button>
            <Button
              variant='contained'
              onClick={handleApply}
              disabled={
                applying ||
                !impact ||
                totalChecked === 0 ||
                !releaseId ||
                (checkedNew.size > 0 &&
                  [...checkedNew].some((i) => !getAppId(i)))
              }
              startIcon={
                applying ? <CircularProgress size={16} /> : <ChecklistIcon />
              }
            >
              {applying
                ? 'Applying…'
                : `Apply${totalChecked > 0 ? ` (${totalChecked})` : ''}`}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
