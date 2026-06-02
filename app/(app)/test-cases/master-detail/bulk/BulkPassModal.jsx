'use client';
import { Grid, TextField } from '@mui/material';
import { useState } from 'react';
import { useQaUserList } from '@/hooks/useSharedData';
import { bulkRecordResults } from '@/lib/api/results';
import { ROLES, STATUS } from '@/lib/constants';
import { showToast } from '@/utils/showToast';
import BulkModalShell from './BulkModalShell';
import BulkStatusFields from './BulkStatusFields';

/**
 * Bulk mark as Pass: sets status, testedBy, testedOn, notes.
 * Sends { releaseId, environment, tcIds } for the new results model.
 * BR-15: QA testedBy is locked to self; admin may pick any active QA user.
 */
export default function BulkPassModal({
  open,
  onClose,
  selection,
  user,
  releaseId,
  environment,
  onSuccess,
}) {
  const { data: qaUsers = [] } = useQaUserList();
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
      const fields = { status: STATUS.PASS, testedBy, testedOn, notes };
      await bulkRecordResults(releaseId, {
        releaseId,
        environment,
        status: STATUS.PASS,
        tcIds: selection.map((s) => s.tcId),
        testedBy,
        testedOn,
        notes,
      });
      showToast(`Marked ${selection.length} as Pass`, 'success');
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
