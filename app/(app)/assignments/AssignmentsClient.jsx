'use client';

import AddIcon from '@mui/icons-material/Add';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import PersonIcon from '@mui/icons-material/Person';
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
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import { useCallback, useEffect, useState } from 'react';
import ConfirmDialog from '@/components/ConfirmDialog';
import PageHeader from '@/components/PageHeader';
import ToastProvider, { showToast } from '@/components/Toast';
import { useReleaseEnv } from '@/contexts/ReleaseEnvContext';
import {
  createAssignment as apiCreateAssignment,
  deleteAssignment as apiDeleteAssignment,
  listAssignments,
} from '@/lib/api/assignments';

const EMPTY_FORM = {
  tcId: '',
  testKey: '',
  caseName: '',
  assignedTo: '',
  environment: '',
};

export default function AssignmentsClient({ isAdmin, qaUsers }) {
  const { releaseId, releaseName, environments, activeRelease } =
    useReleaseEnv();

  const isArchived = activeRelease?.archived ?? false;

  const [scopeFilter, setScopeFilter] = useState('');
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [testCases, setTestCases] = useState([]);
  const [loadingCases, setLoadingCases] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);

  // Reset scope filter when release changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: releaseId is the trigger; setScopeFilter is a stable setter
  useEffect(() => {
    setScopeFilter('');
  }, [releaseId]);

  const fetchAssignments = useCallback(async () => {
    if (!releaseId) {
      setAssignments([]);
      return;
    }
    setLoading(true);
    try {
      const data = await listAssignments({ releaseId });
      setAssignments(data);
    } catch (err) {
      showToast(err.message || 'Failed to load assignments', 'error');
    } finally {
      setLoading(false);
    }
  }, [releaseId]);

  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  // Fetch test cases for the create form.
  // Uses the first environment to satisfy the listTestCases invariant.
  async function openCreateModal() {
    setForm({ ...EMPTY_FORM, environment: environments[0] ?? '' });
    setShowModal(true);
    const firstEnv = environments[0];
    if (!firstEnv) {
      setTestCases([]);
      return;
    }
    setLoadingCases(true);
    try {
      const url = `/api/releases/${releaseId}/test-cases?environment=${encodeURIComponent(firstEnv)}&limit=200`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to load test cases');
      const payload = await res.json();
      // listTestCases returns { data, total, ... }
      const rows = Array.isArray(payload) ? payload : (payload.data ?? []);
      setTestCases(rows);
    } catch (err) {
      showToast(err.message || 'Failed to load test cases', 'error');
      setTestCases([]);
    } finally {
      setLoadingCases(false);
    }
  }

  function closeModal() {
    setShowModal(false);
    setForm(EMPTY_FORM);
    setTestCases([]);
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.tcId) {
      showToast('Select a test case', 'info');
      return;
    }
    if (!form.assignedTo) {
      showToast('Select an assignee', 'info');
      return;
    }
    if (!form.environment) {
      showToast('Select an environment', 'info');
      return;
    }

    setSaving(true);
    try {
      await apiCreateAssignment({
        tcIds: [form.tcId],
        releaseId,
        assignedTo: form.assignedTo,
        environment: form.environment,
      });
      showToast('Assignment created', 'success');
      closeModal();
      fetchAssignments();
    } catch (err) {
      showToast(err.message || 'Failed to create assignment', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await apiDeleteAssignment(deleteTarget._id);
      showToast('Assignment removed', 'info');
      setDeleteTarget(null);
      fetchAssignments();
    } catch (err) {
      showToast(err.message || 'Failed to remove assignment', 'error');
    }
  }

  const visibleAssignments = assignments.filter(
    (a) => scopeFilter === '' || a.environment === scopeFilter,
  );

  const noRelease = !releaseId;

  return (
    <Stack spacing={3}>
      <ToastProvider />

      <PageHeader
        eyebrow='Release'
        title='Assignments'
        sub={
          releaseName
            ? `Who is responsible for each case in ${releaseName}`
            : 'Select a release to view assignments'
        }
        actions={
          isAdmin && !isArchived && !noRelease ? (
            <Button
              variant='contained'
              size='small'
              startIcon={<AddIcon />}
              onClick={openCreateModal}
            >
              Assign Case
            </Button>
          ) : undefined
        }
      />

      {isArchived && (
        <Alert severity='warning' variant='outlined'>
          This release is archived. Assignments are read-only.
        </Alert>
      )}

      {noRelease ? (
        <Stack spacing={2} sx={{ alignItems: 'center', py: 8 }}>
          <AssignmentOutlinedIcon
            sx={{ fontSize: 48, color: 'text.disabled' }}
          />
          <Typography variant='pageTitle' sx={{ fontWeight: 700 }}>
            No release selected
          </Typography>
          <Typography variant='pageSub' color='text.disabled'>
            Choose a release in the context bar to view assignments.
          </Typography>
        </Stack>
      ) : (
        <>
          {/* Scope filter */}
          <Stack direction='row' spacing={1.5} sx={{ alignItems: 'center' }}>
            <Typography variant='formLabel'>Scope</Typography>
            <ToggleButtonGroup
              exclusive
              size='small'
              value={scopeFilter}
              onChange={(_, v) => v !== null && setScopeFilter(v)}
            >
              <ToggleButton value=''>All</ToggleButton>
              {environments.map((env) => (
                <ToggleButton key={env} value={env}>
                  {env}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Stack>

          {loading ? (
            <Stack sx={{ alignItems: 'center', py: 6 }}>
              <CircularProgress size={32} />
            </Stack>
          ) : visibleAssignments.length === 0 ? (
            <Stack spacing={2} sx={{ alignItems: 'center', py: 8 }}>
              <AssignmentOutlinedIcon
                sx={{ fontSize: 48, color: 'text.disabled' }}
              />
              <Typography variant='pageTitle' sx={{ fontWeight: 700 }}>
                No assignments yet
              </Typography>
              <Typography variant='pageSub' color='text.disabled'>
                {isAdmin && !isArchived
                  ? 'Click "Assign Case" to assign a test case to a team member.'
                  : 'No cases have been assigned in this release.'}
              </Typography>
              {isAdmin && !isArchived && (
                <Button
                  variant='contained'
                  startIcon={<AddIcon />}
                  onClick={openCreateModal}
                >
                  Assign Case
                </Button>
              )}
            </Stack>
          ) : (
            <Paper variant='outlined' sx={{ overflow: 'hidden' }}>
              <TableContainer>
                <Table size='small'>
                  <TableHead>
                    <TableRow>
                      <TableCell>Test Case</TableCell>
                      <TableCell>Responsible</TableCell>
                      <TableCell>Scope</TableCell>
                      <TableCell>Assigned By</TableCell>
                      <TableCell>Date</TableCell>
                      {isAdmin && !isArchived && <TableCell align='right' />}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {visibleAssignments.map((a) => (
                      <AssignmentRow
                        key={a._id}
                        assignment={a}
                        isAdmin={isAdmin}
                        isArchived={isArchived}
                        onDelete={() => setDeleteTarget(a)}
                      />
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          )}
        </>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title='Remove Assignment'
        confirmLabel='Remove'
        confirmColor='error'
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      >
        <Typography variant='tableCell'>
          Remove the assignment of <strong>{deleteTarget?.assignedTo}</strong>{' '}
          to{' '}
          <strong>
            {deleteTarget?.testKey ? deleteTarget.testKey : 'this test case'}
          </strong>
          ? This does not delete the test case or its results.
        </Typography>
      </ConfirmDialog>

      {/* Create Assignment Modal */}
      <Dialog open={showModal} onClose={closeModal} maxWidth='sm' fullWidth>
        <DialogTitle>Assign Test Case</DialogTitle>
        <DialogContent dividers>
          <form id='create-assignment-form' onSubmit={handleCreate}>
            <Stack spacing={2.5}>
              {/* Test case picker */}
              <TextField
                select
                size='small'
                fullWidth
                label='Test Case'
                value={form.tcId}
                onChange={(e) => {
                  const tc = testCases.find((c) => c._id === e.target.value);
                  setForm((f) => ({
                    ...f,
                    tcId: e.target.value,
                    testKey: tc?.testKey ?? '',
                    // listTestCases returns 'testCase' as the display name field
                    caseName: tc?.testCase ?? '',
                  }));
                }}
                slotProps={{
                  select: { displayEmpty: true },
                  inputLabel: { shrink: true },
                }}
                required
                disabled={loadingCases}
              >
                <MenuItem value=''>
                  {loadingCases ? 'Loading…' : 'Select a test case…'}
                </MenuItem>
                {testCases.map((tc) => (
                  <MenuItem key={tc._id} value={tc._id}>
                    <Stack
                      direction='row'
                      spacing={1}
                      sx={{ alignItems: 'center', width: '100%' }}
                    >
                      <Typography variant='mono' sx={{ flexShrink: 0 }}>
                        {tc.testKey}
                      </Typography>
                      <Typography variant='tableCell' noWrap>
                        {tc.testCase}
                      </Typography>
                    </Stack>
                  </MenuItem>
                ))}
              </TextField>

              {/* Assignee */}
              <TextField
                select
                size='small'
                fullWidth
                label='Assignee'
                value={form.assignedTo}
                onChange={(e) =>
                  setForm((f) => ({ ...f, assignedTo: e.target.value }))
                }
                slotProps={{
                  select: { displayEmpty: true },
                  inputLabel: { shrink: true },
                }}
                required
              >
                <MenuItem value=''>Select team member…</MenuItem>
                {qaUsers.map((u) => (
                  <MenuItem key={u} value={u}>
                    {u}
                  </MenuItem>
                ))}
              </TextField>

              {/* Scope */}
              <Stack spacing={0.75}>
                <Typography variant='formLabel' sx={{ display: 'block' }}>
                  Scope
                </Typography>
                <ToggleButtonGroup
                  exclusive
                  size='small'
                  fullWidth
                  value={form.environment}
                  onChange={(_, v) =>
                    v !== null && setForm((f) => ({ ...f, environment: v }))
                  }
                >
                  {environments.map((env) => (
                    <ToggleButton key={env} value={env}>
                      {env}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
                <Typography variant='metricSub' color='text.disabled'>
                  {form.environment
                    ? `This assignment applies only to the ${form.environment} environment.`
                    : 'This release has no environments; add one before assigning.'}
                </Typography>
              </Stack>
            </Stack>
          </form>
        </DialogContent>
        <DialogActions>
          <Button variant='outlined' onClick={closeModal}>
            Cancel
          </Button>
          <Button
            type='submit'
            form='create-assignment-form'
            variant='contained'
            disabled={saving}
            startIcon={
              saving ? (
                <CircularProgress size={14} color='inherit' />
              ) : undefined
            }
          >
            {saving ? 'Assigning…' : 'Assign'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

function AssignmentRow({ assignment: a, isAdmin, isArchived, onDelete }) {
  const formattedDate = a.createdAt
    ? new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).format(new Date(a.createdAt))
    : '—';

  return (
    <TableRow hover>
      {/* Test case */}
      <TableCell>
        <Stack spacing={0.25}>
          {a.testKey && (
            <Typography variant='mono' color='text.secondary'>
              {a.testKey}
            </Typography>
          )}
          <Typography variant='tableCell'>{a.caseName || a.testKey}</Typography>
        </Stack>
      </TableCell>

      {/* Responsible */}
      <TableCell>
        <Stack direction='row' spacing={0.75} sx={{ alignItems: 'center' }}>
          <PersonIcon
            sx={{ fontSize: 16, color: 'secondary.main', flexShrink: 0 }}
          />
          <Typography variant='tableCell' fontWeight={600}>
            {a.assignedTo}
          </Typography>
        </Stack>
      </TableCell>

      {/* Scope */}
      <TableCell>
        <Chip
          label={a.environment}
          size='small'
          color='primary'
          variant='filled'
        />
      </TableCell>

      {/* Assigned by */}
      <TableCell>
        <Typography variant='tableCell' color='text.disabled'>
          {a.assignedBy || '—'}
        </Typography>
      </TableCell>

      {/* Date */}
      <TableCell>
        <Typography variant='tableCell' color='text.disabled'>
          {formattedDate}
        </Typography>
      </TableCell>

      {/* Delete action — admin only, non-archived */}
      {isAdmin && !isArchived && (
        <TableCell align='right'>
          <Tooltip title='Remove assignment'>
            <IconButton
              size='small'
              color='error'
              onClick={onDelete}
              aria-label='Remove assignment'
            >
              <DeleteOutlineIcon fontSize='small' />
            </IconButton>
          </Tooltip>
        </TableCell>
      )}
    </TableRow>
  );
}
