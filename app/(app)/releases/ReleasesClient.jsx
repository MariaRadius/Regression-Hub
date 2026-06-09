'use client';

import AddIcon from '@mui/icons-material/Add';
import ArchiveIcon from '@mui/icons-material/Archive';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import EditIcon from '@mui/icons-material/Edit';
import NewReleasesIcon from '@mui/icons-material/NewReleases';
import UnarchiveIcon from '@mui/icons-material/Unarchive';
import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import ConfirmDialog from '@/components/ConfirmDialog';
import { showToast } from '@/components/Toast';
import { deleteRelease, updateRelease } from '@/lib/api/releases';
import { ROLES } from '@/lib/constants';
import ReleaseFormDialog from './ReleaseFormDialog';

function StatusChip({ archived }) {
  if (archived) {
    return (
      <Chip
        label='Archived'
        size='small'
        icon={<ArchiveIcon sx={{ fontSize: '12px !important' }} />}
        sx={{
          bgcolor: 'warning.light',
          color: 'warning.main',
          border: '1px solid',
          borderColor: 'pending.border',
          fontWeight: 600,
          fontSize: 11,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}
      />
    );
  }
  return (
    <Chip
      label='Active'
      size='small'
      sx={{
        bgcolor: 'pass.light',
        color: 'pass.main',
        border: '1px solid',
        borderColor: 'pass.border',
        fontWeight: 600,
        fontSize: 11,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
      }}
    />
  );
}

function EnvList({ environments }) {
  return (
    <Stack direction='row' spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
      {environments.map((env) => (
        <Chip
          key={env}
          label={env}
          size='small'
          variant='outlined'
          sx={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.03em' }}
        />
      ))}
    </Stack>
  );
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Client component for the Releases management page.
 * Admin users can create, edit, archive/unarchive, and delete releases.
 * QA users have read-only access.
 *
 * @param {{ user: object, releases: object[] }} props
 */
export default function ReleasesClient({ user, releases: initialReleases }) {
  const router = useRouter();
  const isAdmin = user?.role === ROLES.ADMIN;

  const [releases, setReleases] = useState(initialReleases);
  const [error, setError] = useState(null);

  // Form dialog state
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null); // release being edited

  // Archive/unarchive confirm dialog
  const [archiveDialog, setArchiveDialog] = useState({
    open: false,
    release: null,
  });

  // Delete confirm dialog
  const [deleteDialog, setDeleteDialog] = useState({
    open: false,
    release: null,
  });

  // ── handlers ──────────────────────────────────────────────────────────────

  const handleCreate = useCallback(() => {
    setEditTarget(null);
    setFormOpen(true);
  }, []);

  const handleEdit = useCallback((release) => {
    setEditTarget(release);
    setFormOpen(true);
  }, []);

  const handleFormClose = useCallback(() => {
    setFormOpen(false);
    setEditTarget(null);
  }, []);

  const handleFormSuccess = useCallback(() => {
    setFormOpen(false);
    setEditTarget(null);
    router.refresh();
  }, [router]);

  const handleArchiveClick = useCallback((release) => {
    setArchiveDialog({ open: true, release });
  }, []);

  const handleArchiveClose = useCallback(() => {
    setArchiveDialog({ open: false, release: null });
  }, []);

  const handleArchiveConfirm = useCallback(async () => {
    const { release } = archiveDialog;
    if (!release) return;
    setError(null);
    try {
      await updateRelease(release._id, { archived: !release.archived });
      handleArchiveClose();
      setReleases((prev) =>
        prev.map((r) =>
          r._id === release._id ? { ...r, archived: !r.archived } : r,
        ),
      );
      showToast(
        `${release.name} ${release.archived ? 'unarchived' : 'archived'}`,
        'success',
      );
      router.refresh();
    } catch (err) {
      setError(err?.message ?? 'Failed to update release.');
    }
  }, [archiveDialog, handleArchiveClose, router]);

  const handleDeleteClick = useCallback((release) => {
    setDeleteDialog({ open: true, release });
  }, []);

  const handleDeleteClose = useCallback(() => {
    setDeleteDialog({ open: false, release: null });
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    const { release } = deleteDialog;
    if (!release) return;
    setError(null);
    try {
      await deleteRelease(release._id, { confirm: 'DELETE' });
      handleDeleteClose();
      setReleases((prev) => prev.filter((r) => r._id !== release._id));
      showToast(`${release.name} deleted`, 'success');
      router.refresh();
    } catch (err) {
      setError(err?.message ?? 'Failed to delete release.');
    }
  }, [deleteDialog, handleDeleteClose, router]);

  // ── empty state ───────────────────────────────────────────────────────────

  if (releases.length === 0) {
    return (
      <Stack spacing={2} sx={{ alignItems: 'center', py: 10 }}>
        <NewReleasesIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
        <Typography variant='pageTitle' sx={{ textAlign: 'center' }}>
          No releases yet
        </Typography>
        <Typography
          variant='pageSub'
          sx={{ color: 'text.secondary', textAlign: 'center' }}
        >
          Create your first release to start tracking test results per
          environment.
        </Typography>
        {isAdmin && (
          <Button
            variant='contained'
            startIcon={<AddIcon />}
            onClick={handleCreate}
          >
            New Release
          </Button>
        )}

        <ReleaseFormDialog
          open={formOpen}
          editTarget={editTarget}
          onClose={handleFormClose}
          onSuccess={handleFormSuccess}
        />
      </Stack>
    );
  }

  // ── archive dialog content ─────────────────────────────────────────────────

  const archivingRelease = archiveDialog.release;
  const isUnarchiving = archivingRelease?.archived === true;

  // ── main table ────────────────────────────────────────────────────────────

  return (
    <Stack spacing={3}>
      {/* Page header */}
      <Stack
        direction='row'
        sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}
      >
        <Stack spacing={0.5}>
          <Typography variant='pageEyebrow' sx={{ color: 'text.disabled' }}>
            Manage
          </Typography>
          <Typography variant='pageTitle'>Releases</Typography>
          <Typography variant='pageSub' sx={{ color: 'text.secondary' }}>
            {releases.length} release{releases.length !== 1 ? 's' : ''} total
          </Typography>
        </Stack>

        {isAdmin && (
          <Button
            variant='contained'
            startIcon={<AddIcon />}
            onClick={handleCreate}
          >
            New Release
          </Button>
        )}
      </Stack>

      {/* Error banner */}
      {error && (
        <Alert severity='error' onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Releases table */}
      <TableContainer component={Paper} elevation={1}>
        <Table size='small'>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Environments</TableCell>
              <TableCell>Created</TableCell>
              {isAdmin && (
                <TableCell align='right' sx={{ width: 120 }}>
                  Actions
                </TableCell>
              )}
            </TableRow>
          </TableHead>

          <TableBody>
            {releases.map((release) => (
              <TableRow
                key={release._id}
                sx={{
                  opacity: release.archived ? 0.65 : 1,
                  '&:last-child td': { border: 0 },
                }}
              >
                <TableCell>
                  <Stack spacing={0.25}>
                    <Typography variant='tableCell' sx={{ fontWeight: 600 }}>
                      {release.name}
                    </Typography>
                    {release.clonedFrom && (
                      <Typography
                        variant='metricSub'
                        sx={{ color: 'text.disabled' }}
                      >
                        Cloned from a previous release
                      </Typography>
                    )}
                  </Stack>
                </TableCell>

                <TableCell>
                  <StatusChip archived={release.archived} />
                </TableCell>

                <TableCell>
                  <EnvList environments={release.environments ?? []} />
                </TableCell>

                <TableCell>
                  <Typography
                    variant='tableCell'
                    sx={{ color: 'text.secondary' }}
                  >
                    {formatDate(release.createdAt)}
                  </Typography>
                </TableCell>

                {isAdmin && (
                  <TableCell align='right'>
                    <Stack
                      direction='row'
                      spacing={0.5}
                      sx={{ justifyContent: 'flex-end' }}
                    >
                      {/* Edit — disabled while archived */}
                      <Tooltip
                        title={
                          release.archived
                            ? 'Unarchive to edit'
                            : 'Edit release'
                        }
                      >
                        <span>
                          <IconButton
                            size='small'
                            disabled={release.archived}
                            onClick={() => handleEdit(release)}
                            aria-label={`Edit ${release.name}`}
                          >
                            <EditIcon fontSize='small' />
                          </IconButton>
                        </span>
                      </Tooltip>

                      {/* Archive / Unarchive */}
                      <Tooltip
                        title={
                          release.archived
                            ? 'Unarchive release'
                            : 'Archive release'
                        }
                      >
                        <IconButton
                          size='small'
                          onClick={() => handleArchiveClick(release)}
                          aria-label={
                            release.archived
                              ? `Unarchive ${release.name}`
                              : `Archive ${release.name}`
                          }
                        >
                          {release.archived ? (
                            <UnarchiveIcon fontSize='small' />
                          ) : (
                            <ArchiveIcon fontSize='small' />
                          )}
                        </IconButton>
                      </Tooltip>

                      {/* Delete — disabled while archived */}
                      <Tooltip
                        title={
                          release.archived
                            ? 'Unarchive before deleting'
                            : 'Delete release'
                        }
                      >
                        <span>
                          <IconButton
                            size='small'
                            color='error'
                            disabled={release.archived}
                            onClick={() => handleDeleteClick(release)}
                            aria-label={`Delete ${release.name}`}
                          >
                            <DeleteOutlinedIcon fontSize='small' />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Stack>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* ReleaseFormDialog — create or edit */}
      <ReleaseFormDialog
        open={formOpen}
        editTarget={editTarget}
        onClose={handleFormClose}
        onSuccess={handleFormSuccess}
      />

      {/* Archive / Unarchive confirm dialog */}
      <ConfirmDialog
        open={archiveDialog.open}
        title={isUnarchiving ? 'Unarchive release?' : 'Archive release?'}
        confirmLabel={isUnarchiving ? 'Unarchive' : 'Archive'}
        confirmColor={isUnarchiving ? 'primary' : 'warning'}
        onConfirm={handleArchiveConfirm}
        onClose={handleArchiveClose}
      >
        {isUnarchiving ? (
          <Typography>
            <strong>{archivingRelease?.name}</strong> will be made active again.
            Test cases, results, and assignments will be editable.
          </Typography>
        ) : (
          <Stack spacing={1.5}>
            <Typography>
              <strong>{archivingRelease?.name}</strong> will be frozen:
            </Typography>
            <Box component='ul' sx={{ m: 0, pl: 2.5, '& li': { mb: 0.5 } }}>
              <li>
                <Typography variant='tableCell'>
                  Hidden from the default release selector (still findable via
                  search).
                </Typography>
              </li>
              <li>
                <Typography variant='tableCell'>
                  No new results, edits, assignments, or imports until
                  unarchived.
                </Typography>
              </li>
              <li>
                <Typography variant='tableCell'>
                  Excluded from dashboard and reporting aggregates.
                </Typography>
              </li>
            </Box>
            <Typography variant='tableCell' sx={{ color: 'text.secondary' }}>
              This is fully reversible — unarchive at any time to restore
              access.
            </Typography>
          </Stack>
        )}
      </ConfirmDialog>

      {/* Delete confirm dialog */}
      <ConfirmDialog
        open={deleteDialog.open}
        title='Delete release?'
        confirmLabel='Delete'
        confirmColor='error'
        onConfirm={handleDeleteConfirm}
        onClose={handleDeleteClose}
      >
        <Stack spacing={1.5}>
          <Typography>
            <strong>{deleteDialog.release?.name}</strong> and all of its data
            will be permanently removed:
          </Typography>
          <Box component='ul' sx={{ m: 0, pl: 2.5, '& li': { mb: 0.5 } }}>
            <li>
              <Typography variant='tableCell'>
                All test cases defined in this release.
              </Typography>
            </li>
            <li>
              <Typography variant='tableCell'>
                All test results across every environment (Pass, Fail, Pending).
              </Typography>
            </li>
            <li>
              <Typography variant='tableCell'>
                All assignments scoped to this release.
              </Typography>
            </li>
            <li>
              <Typography variant='tableCell'>
                All audit events associated with this release.
              </Typography>
            </li>
          </Box>
          <Typography
            variant='tableCell'
            sx={{ color: 'error.main', fontWeight: 600 }}
          >
            This action cannot be undone.
          </Typography>
        </Stack>
      </ConfirmDialog>
    </Stack>
  );
}
