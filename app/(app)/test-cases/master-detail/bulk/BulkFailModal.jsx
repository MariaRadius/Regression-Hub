'use client';
import { Grid, TextField } from '@mui/material';
import { useState } from 'react';
import { useQaUserList } from '@/hooks/useSharedData';
import { bulkRecordResults } from '@/lib/api/results';
import { ROLES, STATUS } from '@/lib/constants';
import { JIRA_KEY_RE } from '@/lib/schemas/testCases';
import { showToast } from '@/utils/showToast';
import BulkModalShell from './BulkModalShell';
import BulkStatusFields from './BulkStatusFields';

/**
 * Bulk mark as Fail: sets status, notes (required), jiraStory,
 * testedBy, testedOn.
 * Sends { releaseId, environment } for the new results model.
 * BR-15: QA testedBy is locked to self; admin may pick any active QA user.
 */
export default function BulkFailModal({
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
  const [notes, setNotes] = useState('');
  const [jiraStory, setJiraStory] = useState('');
  const [testedBy, setTestedBy] = useState(user?.name || '');
  const [testedOn, setTestedOn] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [loading, setLoading] = useState(false);
  const [notesError, setNotesError] = useState(false);

  const jiraStoryError = Boolean(jiraStory && !JIRA_KEY_RE.test(jiraStory));

  async function handleConfirm() {
    const ne = !notes.trim();
    if (ne || jiraStoryError) {
      setNotesError(ne);
      return;
    }
    setNotesError(false);
    setLoading(true);
    try {
      const fields = {
        status: STATUS.FAIL,
        notes,
        jiraStory,
        testedBy,
        testedOn,
      };
      await bulkRecordResults(releaseId, {
        releaseId,
        environment,
        status: STATUS.FAIL,
        caseIds: selection.map((s) => s.caseId),
        testedBy,
        testedOn,
        notes,
      });
      showToast(`Marked ${selection.length} as Fail`, 'success');
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
      title={`Mark ${selection.length} as Fail`}
      subtitle='Records fail status, notes, tester, date'
      confirmLabel={`Mark ${selection.length} as Fail`}
      confirmColor='error'
      helperNote={`This will update ${selection.length} test ${selection.length === 1 ? 'case' : 'cases'} and cannot be undone.`}
      helperColor='error'
      footerLeft={`${selection.length} cases will be updated`}
      loading={loading}
      onConfirm={handleConfirm}
    >
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            fullWidth
            size='small'
            label='Jira Story (optional)'
            value={jiraStory}
            onChange={(e) => setJiraStory(e.target.value)}
            error={jiraStoryError}
            helperText={
              jiraStoryError ? 'Must be a valid Jira key (e.g. RXR-123)' : ''
            }
            slotProps={{
              htmlInput: { spellCheck: false, autoComplete: 'off' },
            }}
          />
        </Grid>
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
            label='Notes'
            multiline
            minRows={3}
            maxRows={10}
            required
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              if (e.target.value.trim()) setNotesError(false);
            }}
            error={notesError}
            helperText={notesError ? 'Notes is required' : ''}
          />
        </Grid>
      </Grid>
    </BulkModalShell>
  );
}
