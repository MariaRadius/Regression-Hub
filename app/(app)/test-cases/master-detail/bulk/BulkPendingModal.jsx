'use client';
import { TextField } from '@mui/material';
import { useState } from 'react';
import { bulkRecordResults } from '@/lib/api/results';
import { STATUS } from '@/lib/constants';
import { showToast } from '@/utils/showToast';
import BulkModalShell from './BulkModalShell';

/**
 * Bulk mark as Pending: clears tester/date. Requires a reason.
 * Sends { releaseId, environment } for the new results model.
 */
export default function BulkPendingModal({
  open,
  onClose,
  selection,
  releaseId,
  environment,
  onSuccess,
}) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [reasonError, setReasonError] = useState(false);

  async function handleConfirm() {
    if (!reason.trim()) {
      setReasonError(true);
      return;
    }
    setReasonError(false);
    setLoading(true);
    try {
      await bulkRecordResults(releaseId, {
        releaseId,
        environment,
        status: STATUS.PENDING,
        caseIds: selection.map((s) => s.caseId),
        reason: reason.trim(),
      });
      showToast(`Marked ${selection.length} as Pending`, 'success');
      onSuccess({ status: STATUS.PENDING, reason: reason.trim() });
    } catch (e) {
      showToast(e.message || 'Bulk update failed', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <BulkModalShell
      open={open}
      onClose={onClose}
      selection={selection}
      title={`Mark ${selection.length} as Pending`}
      subtitle='Resets test status and clears tester information'
      confirmLabel={`Mark ${selection.length} as Pending`}
      confirmColor='warning'
      helperNote='This will clear tester and tested date for all selected cases'
      helperColor='warning'
      footerLeft={`${selection.length} cases will be updated`}
      loading={loading}
      onConfirm={handleConfirm}
    >
      <TextField
        fullWidth
        label='Reason for Reset'
        required
        multiline
        minRows={3}
        maxRows={10}
        value={reason}
        onChange={(e) => {
          setReason(e.target.value);
          if (e.target.value.trim()) setReasonError(false);
        }}
        error={reasonError}
        helperText={reasonError ? 'A reason is required' : ''}
        slotProps={{ htmlInput: { autoComplete: 'off' } }}
      />
    </BulkModalShell>
  );
}
