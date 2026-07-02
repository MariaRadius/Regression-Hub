'use client';

import AddCircleOutlinedIcon from '@mui/icons-material/AddCircleOutlined';
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

  const [checkedAffected, setCheckedAffected] = useState(new Set());
  const [checkedObsolete, setCheckedObsolete] = useState(new Set());
  const [checkedNew, setCheckedNew] = useState(new Set());
  const [newCaseAppIds, setNewCaseAppIds] = useState({});
  const [newCaseModIds, setNewCaseModIds] = useState({});

  useEffect(() => {
    if (!open || !storyKey) return;
    setLoading(true);
    setError(null);
    setImpact(null);
    setApplyError(null);
    setCheckedAffected(new Set());
    setCheckedObsolete(new Set());
    setCheckedNew(new Set());
    setNewCaseAppIds({});
    setNewCaseModIds({});

    analyzeStoryImpact(storyKey)
      .then((data) => {
        setImpact(data.impact);
        setCheckedAffected(new Set(data.impact.affectedCases.map((c) => c.id)));
        setCheckedObsolete(new Set(data.impact.obsoleteCases.map((c) => c.id)));
        setCheckedNew(new Set(data.impact.newCases.map((_, i) => i)));
      })
      .catch((err) => setError(err?.message ?? 'Analysis failed'))
      .finally(() => setLoading(false));
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
    try {
      const ops = [
        ...(impact?.affectedCases ?? [])
          .filter((c) => checkedAffected.has(c.id))
          .map((c) => updateTestCaseContent(releaseId, c.id, c.update)),
        ...(impact?.obsoleteCases ?? [])
          .filter((c) => checkedObsolete.has(c.id))
          .map((c) => deleteTestCaseById(releaseId, c.id)),
        ...(impact?.newCases ?? [])
          .filter((_, i) => checkedNew.has(i))
          .map((tc, i) =>
            createTestCaseInRelease(releaseId, {
              ...tc,
              applicationId: newCaseAppIds[i] ?? applications[0]?._id ?? '',
              moduleId: newCaseModIds[i] ?? modules[0]?._id ?? '',
              jiraStory: storyKey,
              source: 'ai',
            }),
          ),
      ];
      const results = await Promise.allSettled(ops);
      const failed = results.filter((r) => r.status === 'rejected').length;
      const succeeded = results.length - failed;

      if (failed > 0) {
        setApplyError(
          `${failed} operation(s) failed.${succeeded > 0 ? ` ${succeeded} applied successfully.` : ''}`,
        );
      }

      if (succeeded > 0) {
        const updated = (impact?.affectedCases ?? []).filter((c) =>
          checkedAffected.has(c.id),
        ).length;
        const deleted = (impact?.obsoleteCases ?? []).filter((c) =>
          checkedObsolete.has(c.id),
        ).length;
        const added = (impact?.newCases ?? []).filter((_, i) =>
          checkedNew.has(i),
        ).length;
        onApplied?.({ updated, deleted, added });
        routerRef.current.refresh();
      }

      if (failed === 0) onClose();
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
    onClose,
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
        {loading && (
          <Stack spacing={2} sx={{ p: 3 }}>
            <Skeleton variant='rounded' height={56} />
            <Skeleton variant='rounded' height={56} />
            <Skeleton variant='rounded' height={56} />
          </Stack>
        )}

        {error && (
          <Alert severity='error' sx={{ m: 2 }}>
            {error}
          </Alert>
        )}

        {!loading && !error && impact && (
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
                          {c.update &&
                            Object.entries(c.update).map(([field, val]) => (
                              <Typography
                                key={field}
                                variant='caption'
                                color='text.secondary'
                                sx={{ fontFamily: 'monospace' }}
                              >
                                {field}: {String(val).slice(0, 120)}
                              </Typography>
                            ))}
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
                          key={tc.testCase}
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
        {applyError && (
          <Alert severity='error' sx={{ flex: 1 }}>
            {applyError}
          </Alert>
        )}
        {!applyError && !releaseId && (
          <Typography variant='caption' color='text.secondary' sx={{ flex: 1 }}>
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
            (checkedNew.size > 0 && [...checkedNew].some((i) => !getAppId(i)))
          }
          startIcon={
            applying ? <CircularProgress size={16} /> : <ChecklistIcon />
          }
        >
          {applying
            ? 'Applying…'
            : `Apply${totalChecked > 0 ? ` (${totalChecked})` : ''}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
