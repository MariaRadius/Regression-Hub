'use client';
import { Alert, CircularProgress, Grid, Stack, TextField } from '@mui/material';
import { useEffect, useState } from 'react';
import { useQaUserList } from '@/hooks/useSharedData';
import { bulkRecordResults, listCaseResults } from '@/lib/api/results';
import { ROLES, STATUS } from '@/lib/constants';
import { JIRA_KEY_RE } from '@/lib/schemas/testCases';
import { showToast } from '@/utils/showToast';
import BulkModalShell from './BulkModalShell';
import BulkStatusFields from './BulkStatusFields';

/**
 * Bulk mark as Known Issue: reclassifies a failed case as a tracked, accepted
 * problem. The Jira reference is auto-fetched from the Test Issue linked when
 * the case failed (`jiraIssueKeys` on the result row) — no manual entry in the
 * common path. A manual key is requested only when a selected failure has no
 * linked Jira issue (e.g. Jira disabled at fail time).
 * Only reachable from a currently-failed row — the data layer rejects any
 * selected case that is not Fail.
 * BR-15: QA testedBy is locked to self; admin may pick any active QA user.
 */
export default function BulkKnownIssueModal({
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
  const [linkedKeys, setLinkedKeys] = useState([]);
  const [needsManual, setNeedsManual] = useState(false);
  const [loadingKeys, setLoadingKeys] = useState(true);
  const [jiraKey, setJiraKey] = useState('');
  const [notes, setNotes] = useState('');
  const [testedBy, setTestedBy] = useState(user?.name || '');
  const [testedOn, setTestedOn] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [loading, setLoading] = useState(false);
  const [jiraKeyError, setJiraKeyError] = useState(false);

  // Auto-fetch the Jira reference(s) already saved on each failed row for the
  // active environment. If any selected case lacks one, a manual key is needed.
  useEffect(() => {
    let active = true;
    setLoadingKeys(true);
    Promise.all(
      selection.map((s) =>
        listCaseResults(releaseId, s.tcId)
          .then(
            (rows) =>
              rows.find((r) => r.environment === environment)?.jiraIssueKeys ??
              [],
          )
          .catch(() => []),
      ),
    ).then((perCase) => {
      if (!active) return;
      setLinkedKeys([...new Set(perCase.flat())]);
      setNeedsManual(perCase.some((keys) => keys.length === 0));
      setLoadingKeys(false);
    });
    return () => {
      active = false;
    };
  }, [selection, releaseId, environment]);

  async function handleConfirm() {
    if (needsManual && (!jiraKey.trim() || !JIRA_KEY_RE.test(jiraKey.trim()))) {
      setJiraKeyError(true);
      return;
    }
    setJiraKeyError(false);
    setLoading(true);
    try {
      await bulkRecordResults(releaseId, {
        releaseId,
        environment,
        status: STATUS.KNOWN_ISSUE,
        tcIds: selection.map((s) => s.tcId),
        // Only rows with no linked issue consume this; linked rows ignore it.
        jiraKey: needsManual ? jiraKey.trim() : undefined,
        testedBy,
        testedOn,
        notes,
      });
      showToast(`Marked ${selection.length} as Known Issue`, 'success');
      onSuccess({ status: STATUS.KNOWN_ISSUE });
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
      title={`Mark ${selection.length} as Known Issue`}
      subtitle='Reclassifies a failure as a tracked, accepted issue'
      confirmLabel={`Mark ${selection.length} as Known Issue`}
      confirmColor='info'
      confirmDisabled={loadingKeys}
      helperNote='Only failed cases can be marked as a Known Issue; any selected case that is not currently Fail is skipped.'
      helperColor='info'
      footerLeft={`${selection.length} cases will be updated`}
      loading={loading}
      onConfirm={handleConfirm}
    >
      <Grid container spacing={2}>
        <Grid size={{ xs: 12 }}>
          {loadingKeys ? (
            <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
              <CircularProgress size={16} />
            </Stack>
          ) : linkedKeys.length > 0 ? (
            <Alert severity='info' icon={false}>
              Linked Jira {linkedKeys.length === 1 ? 'issue' : 'issues'}{' '}
              (auto-fetched): <strong>{linkedKeys.join(', ')}</strong>
            </Alert>
          ) : null}
        </Grid>
        {needsManual && (
          <Grid size={{ xs: 12 }}>
            <TextField
              fullWidth
              size='small'
              label='Jira Key'
              required
              helperText={
                jiraKeyError
                  ? 'A valid Jira key is required (e.g. RXR-123)'
                  : 'No Jira issue is linked to this failure — enter the tracking ticket.'
              }
              value={jiraKey}
              onChange={(e) => {
                setJiraKey(e.target.value);
                if (JIRA_KEY_RE.test(e.target.value.trim())) {
                  setJiraKeyError(false);
                }
              }}
              error={jiraKeyError}
              slotProps={{
                htmlInput: { spellCheck: false, autoComplete: 'off' },
              }}
            />
          </Grid>
        )}
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
