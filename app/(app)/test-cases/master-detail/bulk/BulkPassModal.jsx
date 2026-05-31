'use client';
import { Grid, TextField } from '@mui/material';
import { useState } from 'react';
import { useQaUsers } from '@/hooks/useSharedData';
import { bulkUpdateTestCases } from '@/lib/api/testCasesBulk';
import { ROLES, STATUS } from '@/lib/constants';
import { showToast } from '@/utils/showToast';
import BulkModalShell from './BulkModalShell';
import BulkStatusFields from './BulkStatusFields';

/**
 * Bulk mark as Pass: sets status, testedBy, testedOn, notes.
 */
export default function BulkPassModal({
  open,
  onClose,
  selection,
  user,
  onSuccess,
}) {
  const qaUsers = useQaUsers();
  const lockTester = user?.role === ROLES.QA;
  const [testedBy, setTestedBy] = useState(user?.name || '');
  const [testedOn, setTestedOn] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    try {
      const fields = {
        status: STATUS.PASS,
        testedBy,
        testedOn,
        notes,
      };
      const res = await bulkUpdateTestCases({
        ids: selection.map((s) => s._id),
        fields,
      });
      showToast(
        `Marked ${res.updated} as Pass${res.skipped ? `, ${res.skipped} skipped (already Pass)` : ''}`,
        'success',
      );
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
      title={`Mark ${selection.length} as Pass`}
      subtitle='Records pass status, tester, date'
      confirmLabel={`Mark ${selection.length} as Pass`}
      confirmColor='success'
      helperNote={`This will update ${selection.length} test ${selection.length === 1 ? 'case' : 'cases'} and cannot be undone.`}
      helperColor='warning'
      footerLeft={`${selection.length} cases will be updated`}
      loading={loading}
      onConfirm={handleConfirm}
    >
      <Grid container spacing={2}>
        <BulkStatusFields
          qaUsers={qaUsers}
          testedBy={testedBy}
          onTestedBy={setTestedBy}
          testedOn={testedOn}
          onTestedOn={setTestedOn}
          disabled={lockTester}
        />
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
