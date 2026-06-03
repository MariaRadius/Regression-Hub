'use client';
import { MenuItem, TextField } from '@mui/material';
import { useState } from 'react';
import { useQaUserList } from '@/hooks/useSharedData';
import { createAssignment } from '@/lib/api/assignments';
import { showToast } from '@/utils/showToast';
import BulkModalShell from './BulkModalShell';

/**
 * Reassign the selected test cases to a QA user, scoped to the active
 * environment. Sends { tcIds, releaseId, assignedTo, environments }.
 */
export default function BulkReassignModal({
  open,
  onClose,
  selection,
  releaseId,
  environment,
  onSuccess,
}) {
  const { data: qaUsers = [] } = useQaUserList();
  const [assignedTo, setAssignedTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [assigneeError, setAssigneeError] = useState(false);

  async function handleConfirm() {
    if (!assignedTo) {
      setAssigneeError(true);
      return;
    }
    setLoading(true);
    try {
      await createAssignment({
        tcIds: selection.map((s) => s.tcId),
        releaseId,
        assignedTo,
        environments: [environment],
      });
      showToast(
        `Reassigned ${selection.length} cases to ${assignedTo}`,
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
      title={`Reassign ${selection.length} Cases`}
      subtitle={`Assigns the selected cases in the ${environment} environment`}
      confirmLabel={`Reassign ${selection.length} Cases`}
      confirmColor='primary'
      helperNote='The selected cases will be reassigned to the chosen user for the active environment'
      helperColor='info'
      footerLeft={`${selection.length} cases will be reassigned`}
      loading={loading}
      onConfirm={handleConfirm}
    >
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
        slotProps={{
          select: { displayEmpty: true },
          inputLabel: { shrink: true },
        }}
      >
        <MenuItem value=''>— Select user —</MenuItem>
        {qaUsers.map((u) => (
          <MenuItem key={u} value={u}>
            {u}
          </MenuItem>
        ))}
      </TextField>
    </BulkModalShell>
  );
}
