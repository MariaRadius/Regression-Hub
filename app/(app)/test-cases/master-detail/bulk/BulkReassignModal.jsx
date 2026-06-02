'use client';
import { Grid, MenuItem, TextField } from '@mui/material';
import { useState } from 'react';
import { useQaUserList } from '@/hooks/useSharedData';
import { createAssignment } from '@/lib/api/assignments';
import { PRIORITIES } from '@/lib/constants';
import { showToast } from '@/utils/showToast';
import BulkModalShell from './BulkModalShell';

/**
 * Bulk reassign: creates a release-wide assignment for each selected test case.
 * Sends { tcIds, releaseId, assignedTo }. Required field: assignedTo.
 */
export default function BulkReassignModal({
  open,
  onClose,
  selection,
  releaseId,
  onSuccess,
}) {
  const { data: qaUsers = [] } = useQaUserList();
  const [assignedTo, setAssignedTo] = useState('');
  const [priority, setPriority] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [assigneeError, setAssigneeError] = useState(false);

  async function handleConfirm() {
    if (!assignedTo) {
      setAssigneeError(true);
      return;
    }
    setAssigneeError(false);
    setLoading(true);
    try {
      await createAssignment({
        tcIds: selection.map((s) => s.tcId),
        releaseId,
        assignedTo,
      });
      showToast(
        `↻ Assigned ${selection.length} cases to ${assignedTo}`,
        'success',
      );
      onSuccess();
    } catch (e) {
      showToast(e.message || 'Assignment failed', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <BulkModalShell
      open={open}
      onClose={onClose}
      selection={selection}
      title={`↻ Assign ${selection.length} Cases`}
      subtitle='Creates a new assignment for the selected test cases'
      confirmLabel={`↻ Assign ${selection.length} Cases`}
      confirmColor='primary'
      helperNote='A new assignment will be created and test cases will be linked to the assignee'
      helperColor='info'
      footerLeft={`${selection.length} cases will be assigned`}
      loading={loading}
      onConfirm={handleConfirm}
    >
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            select
            fullWidth
            size='small'
            label='Assignee'
            required
            value={assignedTo}
            onChange={(e) => {
              setAssignedTo(e.target.value);
              setAssigneeError(false);
            }}
            error={assigneeError}
            helperText={assigneeError ? 'Select a user to assign to' : ''}
            slotProps={{ select: { displayEmpty: true } }}
          >
            <MenuItem value=''>— Select user —</MenuItem>
            {qaUsers.map((u) => (
              <MenuItem key={u} value={u}>
                {u}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            select
            fullWidth
            size='small'
            label='Priority (optional)'
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          >
            <MenuItem value=''>— No preference —</MenuItem>
            {Object.values(PRIORITIES).map((p) => (
              <MenuItem key={p} value={p}>
                {p}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            fullWidth
            size='small'
            label='Title (optional)'
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            type='date'
            fullWidth
            size='small'
            label='Due Date (optional)'
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Grid>
        <Grid size={{ xs: 12 }}>
          <TextField
            fullWidth
            label='Notes (optional)'
            multiline
            minRows={3}
            maxRows={10}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Grid>
      </Grid>
    </BulkModalShell>
  );
}
