'use client';
import { Checkbox, FormControlLabel, Grid, TextField } from '@mui/material';
import { useState } from 'react';
import { useQaUserList, useTeamSettings } from '@/hooks/useSharedData';
import { buildJiraDrafts } from '@/lib/api/jira';
import { updateTestCaseForRelease } from '@/lib/api/releases';
import { bulkRecordResults } from '@/lib/api/results';
import { JIRA_ISSUE_MODES, ROLES, STATUS } from '@/lib/constants';
import { JIRA_KEY_RE } from '@/lib/schemas/testCases';
import { showToast } from '@/utils/showToast';
import { toastJiraOutcome } from '@/utils/toastJiraOutcome';
import BulkModalShell from './BulkModalShell';
import BulkStatusFields from './BulkStatusFields';

/**
 * Bulk mark as Fail: sets status, notes (required), jiraStory,
 * testedBy, testedOn.
 * Sends { releaseId, environment, tcIds } for the new results model.
 * BR-15: QA testedBy is locked to self; admin may pick any active QA user.
 *
 * Jira (ask mode): after the Fail is recorded, fetches editable issue drafts
 * and hands them up via `onSuccess(fields, { jiraDrafts })` so the page can
 * open the review dialog. Auto mode: the server creates during recording and
 * the outcome is toasted here.
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
  const { data: teamSettings } = useTeamSettings();
  // Checkbox appears only in ask mode with the server-side env vars present;
  // in auto mode the server creates without asking.
  const showJiraOption =
    !!teamSettings?.jiraConfigured &&
    teamSettings?.jiraIssueMode === JIRA_ISSUE_MODES.ASK;
  const [createJira, setCreateJira] = useState(true);
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
      const tcIds = selection.map((s) => s.tcId);
      const res = await bulkRecordResults(releaseId, {
        releaseId,
        environment,
        status: STATUS.FAIL,
        tcIds,
        testedBy,
        testedOn,
        notes,
      });
      showToast(`Marked ${selection.length} as Fail`, 'success');
      // Auto mode: server already created — just report.
      toastJiraOutcome(res?.jira);

      // Save jiraStory back onto test cases that don't already have one so the
      // notification bell tracks this story for all test cases going forward
      // (covers old/existing test cases from active and archived releases).
      // Admin-only endpoint — QA failures are silently ignored.
      if (jiraStory && JIRA_KEY_RE.test(jiraStory) && releaseId) {
        const unlinked = selection.filter((s) => !s.jiraStory);
        await Promise.allSettled(
          unlinked.map((s) =>
            updateTestCaseForRelease(
              releaseId,
              s.tcId,
              { jiraStory },
              { silentFailure: true },
            ),
          ),
        );
      }

      // Ask mode: fetch editable drafts and hand them to the review dialog.
      let jiraDrafts = null;
      if (showJiraOption && createJira) {
        try {
          const draftsRes = await buildJiraDrafts(releaseId, {
            environment,
            tcIds,
            notes,
          });
          toastJiraOutcome({ created: [], errors: [], ...draftsRes });
          if (draftsRes.drafts.length) jiraDrafts = draftsRes.drafts;
        } catch (e) {
          showToast(
            `Results saved, but Jira drafts could not be built: ${e.message}`,
            'warning',
          );
        }
      }
      onSuccess(fields, jiraDrafts ? { jiraDrafts } : undefined);
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
        {showJiraOption && (
          <Grid size={{ xs: 12 }}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={createJira}
                  onChange={(e) => setCreateJira(e.target.checked)}
                />
              }
              label='Create Jira issue (you review each draft before it is sent)'
            />
          </Grid>
        )}
      </Grid>
    </BulkModalShell>
  );
}
