'use client';
import { TextField } from '@mui/material';
import { useState } from 'react';
import { bulkUpdateTestCases } from '@/lib/api/testCasesBulk';
import { STATUS } from '@/lib/constants';
import { showToast } from '@/utils/showToast';
import BulkModalShell from './BulkModalShell';

/**
 * Bulk mark as Pending: clears tester/date. Requires a reason (stored in notes).
 */
export default function BulkPendingModal({
  open,
  onClose,
  selection,
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
      const fields = {
        status: STATUS.PENDING,
        testedBy: '',
        testedOn: '',
        notes: reason.trim(),
      };
      const res = await bulkUpdateTestCases({
        ids: selection.map((s) => s._id),
        fields,
      });
      const toastMsg = `Marked ${res.updated} as Pending${res.skipped ? `, ${res.skipped} skipped (already Pending)` : ''}`;
      showToast(toastMsg, 'success');
      onSuccess(fields);
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
