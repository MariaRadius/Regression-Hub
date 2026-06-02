'use client';

import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

/**
 * Confirmation dialog for the two-phase Excel import flow.
 *
 * Displays a create/update summary, per-file warnings (unrecognized Test Keys,
 * in-file duplicates), and editable 3-char initials for new applications.
 * The Import button is disabled when `analysis.valid === false`.
 *
 * Props:
 *   open              — boolean
 *   analysis          — importAnalysisResponseSchema value (from analyse phase)
 *   initialOverrides  — Record<appName, initial> — controlled by parent
 *   onOverrideChange  — (appName: string, value: string) => void
 *   onConfirm         — () => void — called when user clicks Import
 *   onClose           — () => void
 *   loading           — boolean — disables buttons while committing
 */
export default function ImportConfirmationDialog({
  open,
  analysis,
  initialOverrides = {},
  onOverrideChange,
  onConfirm,
  onClose,
  loading = false,
}) {
  if (!analysis) return null;

  const { valid, createCount, updateCount, errors, warnings, rows } = analysis;

  // Collect new-application rows (those with a proposedInitial)
  const newAppRows = (rows ?? []).filter((r) => r.proposedInitial != null);

  // Build a deduplicated map of appName → { proposedInitial, rowIndices }
  const newAppMap = new Map();
  for (const row of newAppRows) {
    const key = row.applicationName;
    if (!newAppMap.has(key)) {
      newAppMap.set(key, { proposedInitial: row.proposedInitial, count: 0 });
    }
    newAppMap.get(key).count += 1;
  }

  const canImport = valid && !loading;

  return (
    <Dialog open={open} onClose={onClose} maxWidth='sm' fullWidth>
      <DialogTitle sx={{ fontFamily: 'var(--font-heading)', fontWeight: 700 }}>
        Review Import
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={2.5}>
          {/* Summary chips */}
          <Stack direction='row' spacing={1.5} sx={{ flexWrap: 'wrap' }}>
            <Chip
              label={`${createCount} to create`}
              color='success'
              size='small'
              variant='outlined'
            />
            <Chip
              label={`${updateCount} to update`}
              color='primary'
              size='small'
              variant='outlined'
            />
          </Stack>

          {/* File-level errors (import is blocked) */}
          {errors?.length > 0 && (
            <Stack spacing={1}>
              <Alert
                severity='error'
                icon={<WarningAmberIcon fontSize='inherit' />}
              >
                <Typography variant='body2' fontWeight={600} sx={{ mb: 0.5 }}>
                  Import blocked — fix the following errors:
                </Typography>
                <Box component='ul' sx={{ m: 0, pl: 2.5 }}>
                  {errors.map((e) => (
                    <Typography key={e} component='li' variant='body2'>
                      {e}
                    </Typography>
                  ))}
                </Box>
              </Alert>
            </Stack>
          )}

          {/* File-level warnings (import still allowed) */}
          {warnings?.length > 0 && (
            <Alert
              severity='warning'
              icon={<InfoOutlinedIcon fontSize='inherit' />}
            >
              <Typography variant='body2' fontWeight={600} sx={{ mb: 0.5 }}>
                Warnings
              </Typography>
              <Box component='ul' sx={{ m: 0, pl: 2.5 }}>
                {warnings.map((w) => (
                  <Typography key={w} component='li' variant='body2'>
                    {w}
                  </Typography>
                ))}
              </Box>
            </Alert>
          )}

          {/* New-application initials editor */}
          {newAppMap.size > 0 && (
            <Stack spacing={1.5}>
              <Divider />
              <Stack spacing={0.5}>
                <Typography variant='subtitle2' fontWeight={700}>
                  New Applications — Assign Initials
                </Typography>
                <Typography variant='body2' color='text.secondary'>
                  Each new application needs a unique 3-character initial (A–Z,
                  0–9). Edit the suggested values below if needed.
                </Typography>
              </Stack>
              {[...newAppMap.entries()].map(
                ([appName, { proposedInitial }]) => {
                  const currentVal =
                    initialOverrides[appName] ?? proposedInitial ?? '';
                  const isInvalid =
                    currentVal.length !== 3 ||
                    !/^[A-Z0-9]{3}$/.test(currentVal);
                  return (
                    <Stack
                      key={appName}
                      direction='row'
                      spacing={2}
                      sx={{ alignItems: 'center' }}
                    >
                      <Typography
                        variant='body2'
                        sx={{ flex: 1, fontFamily: 'var(--font-body)' }}
                      >
                        {appName}
                      </Typography>
                      <TextField
                        size='small'
                        label='Initial'
                        value={currentVal}
                        onChange={(e) =>
                          onOverrideChange?.(
                            appName,
                            e.target.value
                              .toUpperCase()
                              .replace(/[^A-Z0-9]/g, '')
                              .slice(0, 3),
                          )
                        }
                        error={isInvalid}
                        helperText={
                          isInvalid ? 'Must be exactly 3 chars (A–Z, 0–9)' : ' '
                        }
                        slotProps={{
                          htmlInput: {
                            maxLength: 3,
                            style: {
                              fontFamily: 'var(--font-mono)',
                              fontWeight: 700,
                              letterSpacing: '0.12em',
                              textTransform: 'uppercase',
                              width: 72,
                            },
                          },
                        }}
                        sx={{ width: 120 }}
                      />
                    </Stack>
                  );
                },
              )}
            </Stack>
          )}

          {/* Row-level update preview (show first 20 update rows to avoid a wall of text) */}
          {updateCount > 0 && (
            <Stack spacing={1}>
              <Divider />
              <Typography variant='subtitle2' fontWeight={700}>
                Updates Preview
              </Typography>
              <Stack spacing={0.5}>
                {(rows ?? [])
                  .filter((r) => r.action === 'update')
                  .slice(0, 20)
                  .map((r) => (
                    <Typography
                      key={r.testKey ?? r.rowIndex}
                      variant='body2'
                      color='text.secondary'
                    >
                      <Box
                        component='span'
                        sx={{
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 700,
                          mr: 1,
                        }}
                      >
                        {r.testKey}
                      </Box>
                      {r.priorName ? (
                        <>
                          <Box
                            component='span'
                            sx={{ textDecoration: 'line-through', mr: 0.5 }}
                          >
                            {r.priorName}
                          </Box>
                          {'→ '}
                          {r.testName}
                        </>
                      ) : (
                        r.testName
                      )}
                    </Typography>
                  ))}
                {updateCount > 20 && (
                  <Typography variant='caption' color='text.disabled'>
                    …and {updateCount - 20} more updates
                  </Typography>
                )}
              </Stack>
            </Stack>
          )}
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button variant='outlined' onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant='contained'
          color='primary'
          onClick={onConfirm}
          disabled={!canImport}
          loading={loading}
          loadingPosition='start'
        >
          Import
        </Button>
      </DialogActions>
    </Dialog>
  );
}
