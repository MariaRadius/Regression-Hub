'use client';

import AccessTimeIcon from '@mui/icons-material/AccessTime';
import AddIcon from '@mui/icons-material/Add';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import AssignmentOutlined from '@mui/icons-material/AssignmentOutlined';
import ChecklistIcon from '@mui/icons-material/Checklist';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import GridViewIcon from '@mui/icons-material/GridView';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  LinearProgress,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { priorityToColor } from '@/app/theme';
import ConfirmDialog from '@/components/ConfirmDialog';
import EmptyState from '@/components/EmptyState';
import PageHeader from '@/components/PageHeader';
import ToastProvider, { showToast } from '@/components/Toast';
import {
  createAssignment as apiCreateAssignment,
  deleteAssignment as apiDeleteAssignment,
  updateAssignment as apiUpdateAssignment,
} from '@/lib/api/assignments';
import {
  ASSIGNMENT_STATUS,
  PRIORITIES,
  PRIORITY_DEFAULT,
} from '@/lib/constants';

function ProgressBar({ completed, total }) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const color = pct === 100 ? 'success' : pct > 50 ? 'info' : 'warning';
  return (
    <Box>
      <Stack direction='row' sx={{ justifyContent: 'space-between', mb: 0.5 }}>
        <Typography
          variant='metricSub'
          sx={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {completed} / {total} tested
        </Typography>
        <Typography
          variant='tableCell'
          fontWeight={600}
          color={
            pct === 100
              ? 'success.main'
              : pct > 50
                ? 'info.main'
                : 'warning.main'
          }
          sx={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {pct}%
        </Typography>
      </Stack>
      <LinearProgress
        variant='determinate'
        value={pct}
        color={color}
        sx={{ borderRadius: 1, height: 6 }}
      />
    </Box>
  );
}

function DueDate({ dueDate }) {
  if (!dueDate)
    return (
      <Typography component='span' variant='tableCell' color='text.disabled'>
        No due date
      </Typography>
    );
  const due = new Date(dueDate);
  const now = new Date();
  const isOverdue = due < now;
  const diff = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
  const label = isOverdue
    ? `Overdue by ${Math.abs(diff)}d`
    : diff === 0
      ? 'Due today'
      : diff === 1
        ? 'Due tomorrow'
        : `Due in ${diff}d`;
  const formatted = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(due);
  return (
    <Typography
      component='span'
      variant='tableCell'
      fontWeight={600}
      color={
        isOverdue ? 'error.main' : diff <= 2 ? 'warning.main' : 'text.disabled'
      }
    >
      <AccessTimeIcon
        sx={{ fontSize: 'inherit', verticalAlign: 'middle', mr: 0.5 }}
        aria-hidden='true'
      />
      {formatted} — {label}
    </Typography>
  );
}

const EMPTY_FORM = {
  title: '',
  type: 'module',
  moduleIds: [],
  testCaseIds: [],
  assignedTo: '',
  priority: PRIORITY_DEFAULT,
  dueDate: '',
  notes: '',
};

export default function AssignmentsClient({
  view,
  assignments,
  modules,
  moduleCounts,
  qaUsers,
}) {
  const router = useRouter();

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({});

  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    message: '',
    onConfirm: null,
  });

  function handleModalClose() {
    const isDirty =
      form.title ||
      form.moduleIds.length > 0 ||
      form.notes ||
      form.assignedTo ||
      form.dueDate;
    if (isDirty) {
      setConfirmDialog({
        open: true,
        message: 'Discard this assignment? Your changes will be lost.',
        onConfirm: () => {
          setConfirmDialog((prev) => ({ ...prev, open: false }));
          setShowModal(false);
          setForm(EMPTY_FORM);
        },
      });
    } else {
      setShowModal(false);
      setForm(EMPTY_FORM);
    }
  }

  async function createAssignment(e) {
    e.preventDefault();
    if (!form.assignedTo) {
      showToast('Select an assignee', 'info');
      return;
    }
    if (form.type === 'module' && !form.moduleIds.length) {
      showToast('Select at least one module', 'info');
      return;
    }

    setSaving(true);
    try {
      const data = await apiCreateAssignment(form);
      showToast(
        `Assignment created — ${data.testCaseCount} test cases`,
        'success',
      );
      setShowModal(false);
      setForm(EMPTY_FORM);
      router.refresh();
    } catch (err) {
      showToast(err.message || 'Failed to create', 'error');
    } finally {
      setSaving(false);
    }
  }

  function cancelAssignment(id) {
    setConfirmDialog({
      open: true,
      message:
        'Cancel this assignment? The test cases will remain but lose their assignment.',
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, open: false }));
        try {
          await apiDeleteAssignment(id);
          showToast('Assignment cancelled', 'info');
          router.refresh();
        } catch (err) {
          showToast(err.message || 'Failed to cancel', 'error');
        }
      },
    });
  }

  async function saveEdit(id) {
    try {
      await apiUpdateAssignment(id, editForm);
      showToast('Updated', 'success');
      setEditId(null);
      router.refresh();
    } catch (err) {
      showToast(err.message || 'Failed to update', 'error');
    }
  }

  function viewCases(a) {
    router.push(`/test-cases?assignedTo=${encodeURIComponent(a.assignedTo)}`);
  }

  const active = assignments.filter(
    (a) => a.status === ASSIGNMENT_STATUS.ACTIVE,
  );
  const cancelled = assignments.filter(
    (a) => a.status !== ASSIGNMENT_STATUS.ACTIVE,
  );

  return (
    <Stack spacing={3}>
      <ToastProvider />

      {/* Header */}
      <PageHeader
        eyebrow='Team'
        title='Assignments'
        sub='Assign test cases and modules to team members'
        actions={
          <Button
            variant='contained'
            size='small'
            startIcon={<AddIcon />}
            onClick={() => {
              setForm(EMPTY_FORM);
              setShowModal(true);
            }}
          >
            New Assignment
          </Button>
        }
      />

      {/* Tabs */}
      <Tabs
        value={view}
        onChange={(_, v) => v && router.push(`?view=${v}`)}
        sx={{ mb: 2.5, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab label='Assigned to Me' value='mine' />
        <Tab label='Assigned by Me' value='sent' />
      </Tabs>

      {/* Cards */}
      {active.length === 0 ? (
        <EmptyState
          icon={<AssignmentOutlined />}
          title={
            view === 'mine'
              ? 'No assignments for you yet'
              : "You haven't assigned anything yet"
          }
        >
          <Typography
            variant='tableCell'
            color='text.disabled'
            sx={{ mt: 0.75 }}
          >
            {view === 'mine'
              ? 'Ask a team member to assign test cases to you.'
              : 'Click "New Assignment" to assign a module or test cases.'}
          </Typography>
        </EmptyState>
      ) : (
        <Stack spacing={1.75}>
          {active.map((a) => (
            <AssignmentCard
              key={a._id}
              assignment={a}
              view={view}
              isEditing={editId === a._id}
              editForm={editForm}
              onEdit={() => {
                setEditId(a._id);
                setEditForm({
                  title: a.title,
                  notes: a.notes,
                  priority: a.priority,
                  dueDate: a.dueDate ? a.dueDate.slice(0, 10) : '',
                });
              }}
              onEditChange={(f) => setEditForm((prev) => ({ ...prev, ...f }))}
              onSaveEdit={() => saveEdit(a._id)}
              onCancelEdit={() => setEditId(null)}
              onCancel={() => cancelAssignment(a._id)}
              onViewCases={() => viewCases(a)}
            />
          ))}
        </Stack>
      )}

      {cancelled.length > 0 && (
        <Accordion
          disableGutters
          elevation={0}
          variant='outlined'
          sx={{ mt: 3 }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant='tableCell'>
              Cancelled ({cancelled.length})
            </Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ p: 0 }}>
            <Stack spacing={1.25} sx={{ p: 1.25 }}>
              {cancelled.map((a) => (
                <Paper
                  key={a._id}
                  variant='outlined'
                  sx={{ opacity: 0.55, px: 2.25, py: 1.75 }}
                >
                  <Stack
                    direction='row'
                    sx={{
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <Stack spacing={0.25}>
                      <Typography variant='panelTitle' component='h2'>
                        {a.title}
                      </Typography>
                      <Typography variant='tableCell' color='text.disabled'>
                        {a.assignedBy}{' '}
                        <ArrowForwardIcon
                          sx={{
                            fontSize: 'inherit',
                            verticalAlign: 'middle',
                            mx: 0.5,
                          }}
                          aria-hidden='true'
                        />{' '}
                        {a.assignedTo} · {a.testCaseCount} cases · Cancelled
                      </Typography>
                    </Stack>
                  </Stack>
                </Paper>
              ))}
            </Stack>
          </AccordionDetails>
        </Accordion>
      )}

      {/* Confirm Dialog */}
      <ConfirmDialog
        confirmDialog={confirmDialog}
        setConfirmDialog={setConfirmDialog}
      />

      {/* Create Assignment Modal */}
      <Dialog
        open={showModal}
        onClose={handleModalClose}
        maxWidth='sm'
        fullWidth
      >
        <DialogTitle>New Assignment</DialogTitle>
        <DialogContent dividers>
          <form id='create-assignment-form' onSubmit={createAssignment}>
            <Stack spacing={2}>
              {/* Title */}
              <TextField
                size='small'
                fullWidth
                label='Title (optional)'
                value={form.title}
                onChange={(e) =>
                  setForm((f) => ({ ...f, title: e.target.value }))
                }
                placeholder='e.g. Auth Module — v2.5 regression'
                slotProps={{
                  htmlInput: { name: 'assignment-title', autoComplete: 'off' },
                }}
              />

              {/* Scope: Module or Manual selection */}
              <Stack spacing={0.75}>
                <Typography variant='formLabel' sx={{ display: 'block' }}>
                  Scope
                </Typography>
                <ToggleButtonGroup
                  exclusive
                  value={form.type}
                  onChange={(_, v) =>
                    v &&
                    setForm((f) => ({
                      ...f,
                      type: v,
                      moduleIds: [],
                      testCaseIds: [],
                    }))
                  }
                  size='small'
                  fullWidth
                >
                  <ToggleButton value='module'>
                    <GridViewIcon fontSize='small' sx={{ mr: 0.75 }} />
                    By Module
                  </ToggleButton>
                  <ToggleButton value='selection'>
                    <ChecklistIcon fontSize='small' sx={{ mr: 0.75 }} />
                    By Selection
                  </ToggleButton>
                </ToggleButtonGroup>
              </Stack>

              {/* Module picker */}
              {form.type === 'module' && (
                <Stack spacing={0.75}>
                  <Typography variant='formLabel' sx={{ display: 'block' }}>
                    Modules to assign
                  </Typography>
                  <Stack
                    spacing={0.5}
                    sx={{
                      maxHeight: 200,
                      overflowY: 'auto',
                      border: 1,
                      borderColor: 'divider',
                      borderRadius: 2,
                      p: 1,
                    }}
                  >
                    {modules.length === 0 ? (
                      <Typography
                        variant='tableCell'
                        color='text.disabled'
                        sx={{ p: 1 }}
                      >
                        No modules found
                      </Typography>
                    ) : (
                      modules.map((m) => {
                        const checked = form.moduleIds.includes(m._id);
                        const count = moduleCounts[m._id] ?? '…';
                        return (
                          <Stack
                            key={m._id}
                            direction='row'
                            spacing={1}
                            component='label'
                            sx={{
                              alignItems: 'center',
                              px: 1,
                              py: 0.5,
                              borderRadius: 1.5,
                              bgcolor: checked
                                ? 'action.selected'
                                : 'transparent',
                              border: '1px solid',
                              borderColor: checked
                                ? 'primary.main'
                                : 'transparent',
                              cursor: 'pointer',
                            }}
                          >
                            <Checkbox
                              size='small'
                              checked={checked}
                              onChange={() =>
                                setForm((f) => ({
                                  ...f,
                                  moduleIds: checked
                                    ? f.moduleIds.filter((id) => id !== m._id)
                                    : [...f.moduleIds, m._id],
                                }))
                              }
                              sx={{ p: 0.5 }}
                            />
                            <Stack
                              direction='row'
                              spacing={0.5}
                              sx={{
                                flex: 1,
                                minWidth: 0,
                                alignItems: 'center',
                              }}
                            >
                              <Typography
                                variant='tableCell'
                                color='text.disabled'
                                noWrap
                              >
                                {m.applicationName} /
                              </Typography>
                              <Typography variant='tableCell' noWrap>
                                {m.name}
                              </Typography>
                            </Stack>
                            <Typography
                              variant='tableCell'
                              color='text.disabled'
                              sx={{ flexShrink: 0 }}
                            >
                              {count} cases
                            </Typography>
                          </Stack>
                        );
                      })
                    )}
                  </Stack>
                </Stack>
              )}

              {form.type === 'selection' && (
                <Alert severity='info' variant='outlined'>
                  To assign specific test cases, select them on the{' '}
                  <strong>Test Cases</strong> page and click the{' '}
                  <Box component='strong' sx={{ color: 'primary.main' }}>
                    Assign
                  </Box>{' '}
                  button.
                </Alert>
              )}

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
                required
              >
                <MenuItem value=''>Select team member…</MenuItem>
                {qaUsers.map((u) => (
                  <MenuItem key={u} value={u}>
                    {u}
                  </MenuItem>
                ))}
              </TextField>

              {/* Priority + Due Date */}
              <Grid container spacing={1.5}>
                <Grid size={6}>
                  <TextField
                    select
                    size='small'
                    fullWidth
                    label='Priority'
                    value={form.priority}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, priority: e.target.value }))
                    }
                  >
                    <MenuItem value={PRIORITIES.HIGH}>High</MenuItem>
                    <MenuItem value={PRIORITIES.MEDIUM}>Medium</MenuItem>
                    <MenuItem value={PRIORITIES.LOW}>Low</MenuItem>
                  </TextField>
                </Grid>
                <Grid size={6}>
                  <TextField
                    size='small'
                    fullWidth
                    type='date'
                    label='Due Date (optional)'
                    slotProps={{
                      inputLabel: { shrink: true },
                      htmlInput: { name: 'assignment-due-date' },
                    }}
                    value={form.dueDate}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, dueDate: e.target.value }))
                    }
                  />
                </Grid>
              </Grid>

              {/* Notes */}
              <TextField
                fullWidth
                multiline
                minRows={3}
                maxRows={10}
                label='Notes (optional)'
                value={form.notes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
                placeholder='Instructions, context, or special focus areas…'
                slotProps={{
                  htmlInput: {
                    style: { resize: 'vertical' },
                    name: 'assignment-notes',
                    autoComplete: 'off',
                  },
                }}
              />
            </Stack>
          </form>
        </DialogContent>
        <DialogActions>
          <Button variant='outlined' onClick={handleModalClose}>
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
            {saving ? 'Creating…' : 'Create Assignment'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

function AssignmentCard({
  assignment: a,
  view,
  isEditing,
  editForm,
  onEdit,
  onEditChange,
  onSaveEdit,
  onCancelEdit,
  onCancel,
  onViewCases,
}) {
  const isMine = view === 'mine';
  const isSent = view === 'sent';

  const priorityStripeColor =
    a.priority === PRIORITIES.HIGH
      ? 'error.main'
      : a.priority === PRIORITIES.LOW
        ? 'success.main'
        : 'warning.main';

  return (
    <Paper variant='outlined' sx={{ overflow: 'hidden', p: 0 }}>
      {/* Priority stripe */}
      <Box sx={{ height: 4, bgcolor: priorityStripeColor }} />

      <Stack sx={{ px: 2.5, py: 2 }} spacing={1.5}>
        {isEditing ? (
          /* Edit mode */
          <>
            <TextField
              size='small'
              fullWidth
              label='Title'
              value={editForm.title || ''}
              onChange={(e) => onEditChange({ title: e.target.value })}
            />
            <Grid container spacing={1.5}>
              <Grid size={6}>
                <TextField
                  select
                  size='small'
                  fullWidth
                  label='Priority'
                  value={editForm.priority || PRIORITY_DEFAULT}
                  onChange={(e) => onEditChange({ priority: e.target.value })}
                >
                  <MenuItem value={PRIORITIES.HIGH}>High</MenuItem>
                  <MenuItem value={PRIORITIES.MEDIUM}>Medium</MenuItem>
                  <MenuItem value={PRIORITIES.LOW}>Low</MenuItem>
                </TextField>
              </Grid>
              <Grid size={6}>
                <TextField
                  size='small'
                  fullWidth
                  type='date'
                  label='Due date'
                  slotProps={{ inputLabel: { shrink: true } }}
                  value={editForm.dueDate || ''}
                  onChange={(e) => onEditChange({ dueDate: e.target.value })}
                />
              </Grid>
            </Grid>
            <TextField
              size='small'
              fullWidth
              multiline
              rows={2}
              label='Notes'
              value={editForm.notes || ''}
              onChange={(e) => onEditChange({ notes: e.target.value })}
              slotProps={{ htmlInput: { style: { resize: 'vertical' } } }}
            />
            <Stack
              direction='row'
              spacing={1}
              sx={{ justifyContent: 'flex-end' }}
            >
              <Button variant='outlined' size='small' onClick={onCancelEdit}>
                Cancel
              </Button>
              <Button variant='contained' size='small' onClick={onSaveEdit}>
                Save
              </Button>
            </Stack>
          </>
        ) : (
          /* View mode */
          <>
            <Stack
              direction='row'
              spacing={1.5}
              sx={{
                alignItems: 'flex-start',
                justifyContent: 'space-between',
              }}
            >
              <Stack sx={{ flex: 1, minWidth: 0 }} spacing={0.5}>
                <Stack
                  direction='row'
                  spacing={1}
                  sx={{ alignItems: 'center', flexWrap: 'wrap' }}
                >
                  <Typography variant='panelTitle' component='h2'>
                    {a.title}
                  </Typography>
                  <Chip
                    label={a.priority || 'Medium'}
                    color={priorityToColor(a.priority)}
                    size='small'
                  />
                </Stack>
                <Stack
                  direction='row'
                  sx={{
                    flexWrap: 'wrap',
                    rowGap: 0.5,
                    columnGap: 1.75,
                    color: 'text.disabled',
                  }}
                >
                  {isMine && (
                    <Typography variant='tableCell' color='text.disabled'>
                      From: <strong>{a.assignedBy}</strong>
                    </Typography>
                  )}
                  {isSent && (
                    <Typography variant='tableCell' color='text.disabled'>
                      To: <strong>{a.assignedTo}</strong>
                    </Typography>
                  )}
                  <Typography variant='tableCell' color='text.disabled'>
                    {a.type === 'module' ? (
                      <>
                        <GridViewIcon
                          sx={{ fontSize: 'inherit', verticalAlign: 'middle' }}
                          aria-hidden='true'
                        />{' '}
                        {a.moduleIds?.length || 1} module
                        {(a.moduleIds?.length || 1) !== 1 ? 's' : ''}
                      </>
                    ) : (
                      <>
                        <ChecklistIcon
                          sx={{ fontSize: 'inherit', verticalAlign: 'middle' }}
                          aria-hidden='true'
                        />{' '}
                        Selection
                      </>
                    )}
                    {' · '}
                    {a.testCaseCount} test case
                    {a.testCaseCount !== 1 ? 's' : ''}
                  </Typography>
                  <DueDate dueDate={a.dueDate} />
                </Stack>
              </Stack>
              <Stack direction='row' spacing={0.75} sx={{ flexShrink: 0 }}>
                {isSent && (
                  <Tooltip title='Edit assignment'>
                    <IconButton
                      size='small'
                      onClick={onEdit}
                      aria-label='Edit assignment'
                    >
                      <EditIcon fontSize='small' />
                    </IconButton>
                  </Tooltip>
                )}
                <Button variant='contained' size='small' onClick={onViewCases}>
                  View Cases
                </Button>
                {isSent && (
                  <Tooltip title='Cancel assignment'>
                    <IconButton
                      size='small'
                      color='error'
                      onClick={onCancel}
                      aria-label='Cancel assignment'
                    >
                      <CloseIcon fontSize='small' />
                    </IconButton>
                  </Tooltip>
                )}
              </Stack>
            </Stack>

            <ProgressBar completed={a.completedCount} total={a.testCaseCount} />

            {a.notes && (
              <Alert
                severity='info'
                icon={false}
                variant='outlined'
                sx={{ py: 0.5 }}
              >
                <Typography variant='tableCell' color='text.disabled'>
                  {a.notes}
                </Typography>
              </Alert>
            )}
          </>
        )}
      </Stack>
    </Paper>
  );
}
