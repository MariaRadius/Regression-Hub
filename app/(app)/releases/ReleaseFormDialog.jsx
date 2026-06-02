'use client';

import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import NewReleasesIcon from '@mui/icons-material/NewReleases';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormLabel,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  cloneRelease,
  createRelease,
  listReleases,
  updateRelease,
} from '@/lib/api/releases';
import { DEFAULT_ENVIRONMENTS } from '@/lib/constants';
import {
  environmentNameSchema,
  releaseNameSchema,
} from '@/lib/schemas/releases';

/** Start-type options for a new release. */
const START_TYPES = [
  {
    value: 'empty',
    label: 'Empty',
    Icon: NewReleasesIcon,
    description: 'No test cases — populate by import or manual add.',
  },
  {
    value: 'clone',
    label: 'Clone',
    Icon: ContentCopyIcon,
    description:
      'Copy test cases from an existing release (results start at Pending).',
  },
  {
    value: 'import',
    label: 'Import',
    Icon: UploadFileIcon,
    description: 'Upload an Excel file after creating the release.',
  },
];

/**
 * Controlled chip input for environment names.
 *
 * @param {{ value: string[], onChange: (envs: string[]) => void }} props
 */
function EnvChipInput({ value, onChange }) {
  const [draft, setDraft] = useState('');
  const [draftError, setDraftError] = useState(null);

  const addEnv = useCallback(() => {
    const r = environmentNameSchema.safeParse(draft);
    if (!r.success) {
      setDraftError(r.error.issues[0].message);
      return;
    }
    const normalised = r.data.toUpperCase();
    if (value.includes(normalised)) {
      setDraft('');
      setDraftError(null);
      return;
    }
    onChange([...value, normalised]);
    setDraft('');
    setDraftError(null);
  }, [draft, value, onChange]);

  const removeEnv = useCallback(
    (env) => {
      onChange(value.filter((e) => e !== env));
    },
    [value, onChange],
  );

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        addEnv();
      }
    },
    [addEnv],
  );

  return (
    <Stack spacing={1}>
      <Stack direction='row' spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
        {value.map((env) => (
          <Chip
            key={env}
            label={env}
            size='small'
            onDelete={() => removeEnv(env)}
            sx={{ fontWeight: 600, fontSize: 11, letterSpacing: '0.03em' }}
          />
        ))}
      </Stack>
      <Stack direction='row' spacing={1}>
        <TextField
          size='small'
          placeholder='Add environment… (Enter or comma)'
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setDraftError(null);
          }}
          onKeyDown={handleKeyDown}
          error={Boolean(draftError)}
          helperText={draftError ?? ''}
          sx={{ flex: 1 }}
        />
        <Button
          variant='outlined'
          size='small'
          startIcon={<AddIcon />}
          onClick={addEnv}
        >
          Add
        </Button>
      </Stack>
    </Stack>
  );
}

/**
 * Dialog for creating or editing a release.
 *
 * When `editTarget` is provided the dialog is in "edit" mode (name only —
 * environments are managed via the API separately). When null it is in
 * "create" mode with start-type selection.
 *
 * @param {{
 *   open: boolean,
 *   editTarget: object|null,
 *   onClose: () => void,
 *   onSuccess: () => void,
 * }} props
 */
export default function ReleaseFormDialog({
  open,
  editTarget,
  onClose,
  onSuccess,
}) {
  const router = useRouter();
  const isEdit = editTarget != null;

  // ── form state ────────────────────────────────────────────────────────────

  const [name, setName] = useState('');
  const [startType, setStartType] = useState('empty');
  const [environments, setEnvironments] = useState([...DEFAULT_ENVIRONMENTS]);

  // Clone-specific state
  const [sourceReleaseId, setSourceReleaseId] = useState('');
  const [carryAssignments, setCarryAssignments] = useState(false);
  const [availableReleases, setAvailableReleases] = useState([]);
  const [loadingReleases, setLoadingReleases] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // ── reset on open ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!open) return;

    if (isEdit) {
      setName(editTarget.name ?? '');
    } else {
      setName('');
      setStartType('empty');
      setEnvironments([...DEFAULT_ENVIRONMENTS]);
      setSourceReleaseId('');
      setCarryAssignments(false);
    }
    setError(null);
  }, [open, isEdit, editTarget]);

  // Load available releases when clone type is selected
  useEffect(() => {
    if (!open || startType !== 'clone') return;

    setLoadingReleases(true);
    listReleases({ includeArchived: false })
      .then((data) => setAvailableReleases(data))
      .catch(() => setAvailableReleases([]))
      .finally(() => setLoadingReleases(false));
  }, [open, startType]);

  // ── submission ────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      const r = releaseNameSchema.safeParse(name);
      if (!r.success) {
        setError(r.error.issues[0].message);
        return;
      }
      const cleanName = r.data;

      if (!isEdit && environments.length === 0) {
        setError('At least one environment is required.');
        return;
      }

      if (!isEdit && startType === 'clone' && !sourceReleaseId) {
        setError('Select a release to clone from.');
        return;
      }

      setSubmitting(true);
      setError(null);

      try {
        if (isEdit) {
          await updateRelease(editTarget._id, { name: cleanName });
        } else if (startType === 'clone') {
          await cloneRelease({
            name: cleanName,
            environments,
            cloneFromId: sourceReleaseId,
            carryAssignments,
          });
        } else {
          // empty or import — both create an empty release; import adds cases later
          await createRelease({ name: cleanName, environments });
        }

        onSuccess();

        if (!isEdit && startType === 'import') {
          router.push('/import-cases');
        }
      } catch (err) {
        setError(err?.message ?? 'An unexpected error occurred.');
      } finally {
        setSubmitting(false);
      }
    },
    [
      name,
      isEdit,
      environments,
      startType,
      sourceReleaseId,
      carryAssignments,
      editTarget,
      onSuccess,
      router,
    ],
  );

  // ── render ────────────────────────────────────────────────────────────────

  const dialogTitle = isEdit ? `Edit "${editTarget?.name}"` : 'New Release';

  return (
    <Dialog open={open} onClose={onClose} maxWidth='sm' fullWidth>
      <DialogTitle>
        <Stack
          direction='row'
          sx={{ justifyContent: 'space-between', alignItems: 'center' }}
        >
          <Typography variant='panelTitle'>{dialogTitle}</Typography>
          <IconButton size='small' onClick={onClose} aria-label='Close dialog'>
            <CloseIcon fontSize='small' />
          </IconButton>
        </Stack>
      </DialogTitle>

      <Box component='form' onSubmit={handleSubmit} noValidate>
        <DialogContent>
          <Stack spacing={3}>
            {error && (
              <Alert severity='error' onClose={() => setError(null)}>
                {error}
              </Alert>
            )}

            {/* Release name */}
            <TextField
              label='Release name'
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              fullWidth
              size='small'
              autoFocus
              disabled={submitting}
              placeholder='e.g. v2.9, Sprint 42, 2026-Q2'
            />

            {/* Create-mode: start type selector */}
            {!isEdit && (
              <>
                <Stack spacing={1}>
                  <FormLabel
                    sx={{
                      fontSize: 12,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: 'text.secondary',
                    }}
                  >
                    Start with
                  </FormLabel>
                  <ToggleButtonGroup
                    value={startType}
                    exclusive
                    onChange={(_e, val) => {
                      if (val) setStartType(val);
                    }}
                    size='small'
                    fullWidth
                    aria-label='Release start type'
                    sx={{
                      '& .MuiToggleButton-root': {
                        flex: 1,
                        py: 1,
                        flexDirection: 'column',
                        gap: 0.5,
                        textTransform: 'none',
                        borderColor: 'divider',
                        '&.Mui-selected': {
                          bgcolor: 'primary.main',
                          color: 'white',
                          borderColor: 'primary.main',
                          '&:hover': { bgcolor: 'primary.dark' },
                        },
                      },
                    }}
                  >
                    {START_TYPES.map(({ value, label, Icon }) => (
                      <ToggleButton
                        key={value}
                        value={value}
                        aria-label={label}
                      >
                        <Icon fontSize='small' />
                        <Typography
                          variant='metricLabel'
                          sx={{ fontSize: 10, lineHeight: 1 }}
                        >
                          {label}
                        </Typography>
                      </ToggleButton>
                    ))}
                  </ToggleButtonGroup>
                  <Typography
                    variant='pageSub'
                    sx={{ color: 'text.secondary', fontSize: 12 }}
                  >
                    {
                      START_TYPES.find((t) => t.value === startType)
                        ?.description
                    }
                  </Typography>
                </Stack>

                {/* Clone source selection */}
                {startType === 'clone' && (
                  <Stack spacing={1.5}>
                    <TextField
                      select
                      label='Clone from'
                      value={sourceReleaseId}
                      onChange={(e) => setSourceReleaseId(e.target.value)}
                      size='small'
                      fullWidth
                      required
                      disabled={submitting || loadingReleases}
                      slotProps={{
                        select: { displayEmpty: true },
                        inputLabel: { shrink: true },
                      }}
                    >
                      <MenuItem value=''>
                        <Typography
                          variant='tableCell'
                          sx={{ color: 'text.disabled' }}
                        >
                          {loadingReleases
                            ? 'Loading releases…'
                            : 'Select a release'}
                        </Typography>
                      </MenuItem>
                      {availableReleases.map((r) => (
                        <MenuItem key={r._id} value={r._id}>
                          {r.name}
                        </MenuItem>
                      ))}
                    </TextField>

                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={carryAssignments}
                          onChange={(e) =>
                            setCarryAssignments(e.target.checked)
                          }
                          size='small'
                          disabled={submitting}
                        />
                      }
                      label={
                        <Typography variant='tableCell'>
                          Carry assignments into new release
                        </Typography>
                      }
                    />
                    {carryAssignments && (
                      <Alert severity='info' sx={{ py: 0.5, fontSize: 12 }}>
                        Assignments from the source release will be copied.
                        Results always reset to Pending regardless.
                      </Alert>
                    )}
                  </Stack>
                )}

                {/* Environment chip input */}
                <Stack spacing={1}>
                  <FormLabel
                    sx={{
                      fontSize: 12,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: 'text.secondary',
                    }}
                  >
                    Environments
                  </FormLabel>
                  <EnvChipInput
                    value={environments}
                    onChange={setEnvironments}
                  />
                  {environments.length === 0 && (
                    <Typography
                      variant='pageSub'
                      sx={{ color: 'error.main', fontSize: 12 }}
                    >
                      At least one environment is required.
                    </Typography>
                  )}
                </Stack>
              </>
            )}

            {/* Edit-mode: environments note */}
            {isEdit && (
              <Alert severity='info' sx={{ fontSize: 12 }}>
                Environments are managed via the release detail. Add or remove
                environments after saving the name.
              </Alert>
            )}
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button variant='outlined' onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type='submit'
            variant='contained'
            disabled={submitting || name.trim().length === 0}
          >
            {submitting
              ? isEdit
                ? 'Saving…'
                : 'Creating…'
              : isEdit
                ? 'Save changes'
                : startType === 'import'
                  ? 'Create & go to Import'
                  : 'Create release'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
