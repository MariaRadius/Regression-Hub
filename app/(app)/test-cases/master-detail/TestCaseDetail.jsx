'use client';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import HighlightOffIcon from '@mui/icons-material/HighlightOff';
import HighlightOffOutlinedIcon from '@mui/icons-material/HighlightOffOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import HourglassEmptyOutlinedIcon from '@mui/icons-material/HourglassEmptyOutlined';
import ManageHistoryOutlinedIcon from '@mui/icons-material/ManageHistoryOutlined';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import UpdateOutlinedIcon from '@mui/icons-material/UpdateOutlined';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  IconButton,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import RichTextDisplay from '@/components/RichTextDisplay';
import { STATUS } from '@/lib/constants';
import { normalizedStatus } from '@/utils/formatters';

const STATUS_COLOR = {
  [STATUS.PASS]: 'success',
  [STATUS.FAIL]: 'error',
  [STATUS.PENDING]: 'warning',
};

const FIELD_LABELS = Object.freeze({
  status: 'Status',
  testedBy: 'Tester',
  notes: 'Notes',
  assignedTo: 'Assignee',
  reason: 'Reason',
});

function displayValue(value) {
  return value ? value : '—';
}

function actorName(value) {
  return value || 'System';
}

function buildHistoryEntries(events) {
  if (!events?.length) return [];

  const enriched = [];
  const resultState = new Map();
  const assignmentState = new Map();

  for (const event of [...events].reverse()) {
    const environment = event.environment || 'All environments';

    if (event.category === 'result') {
      const key = event.environment || '__all__';
      const previous = resultState.get(key) || {
        status: STATUS.PENDING,
        testedBy: null,
        notes: null,
        reason: null,
      };
      const next = {
        status: event.status || STATUS.PENDING,
        testedBy: event.by ?? null,
        notes: event.notes ?? null,
        reason: event.reason ?? null,
      };
      const details = [];
      for (const field of ['status', 'testedBy', 'notes', 'reason']) {
        if (previous[field] === next[field]) continue;
        details.push({
          label: FIELD_LABELS[field],
          before: displayValue(previous[field]),
          after: displayValue(next[field]),
        });
      }
      enriched.push({
        ...event,
        title: `${environment} execution updated`,
        summary: `updated ${environment} execution`,
        details,
      });
      resultState.set(key, next);
      continue;
    }

    if (event.category === 'assignment') {
      const key = event.environment || '__all__';
      const previous = assignmentState.get(key) || { assignedTo: null };
      const next = { assignedTo: event.assignedTo ?? null };
      enriched.push({
        ...event,
        title: `${environment} assignment updated`,
        summary: `updated ${environment} assignment`,
        details: [
          {
            label: FIELD_LABELS.assignedTo,
            before: displayValue(previous.assignedTo),
            after: displayValue(next.assignedTo),
          },
        ],
      });
      assignmentState.set(key, next);
      continue;
    }

    if (event.category === 'test_case') {
      enriched.push({
        ...event,
        title:
          event.action === 'create' ? 'Test case created' : 'Test case updated',
        summary:
          event.action === 'create'
            ? 'created this test case'
            : 'updated this test case',
        details:
          event.changes?.map((change) => ({
            label: change.label,
            before: displayValue(change.before),
            after: displayValue(change.after),
          })) || [],
      });
      continue;
    }

    if (event.category === 'import') {
      enriched.push({
        ...event,
        title:
          event.action === 'create'
            ? `Imported test case into ${environment}`
            : `Updated test case via import in ${environment}`,
        summary:
          event.action === 'create'
            ? `imported this test case into ${environment}`
            : `updated this test case by import in ${environment}`,
        details: [],
      });
      continue;
    }

    enriched.push({
      ...event,
      title: 'Activity updated',
      summary: 'updated this activity',
      details: [],
    });
  }

  return enriched.reverse();
}

function HistoryDetailRow({ detail }) {
  const isStatusRow = detail.label === 'Status';
  const statusBefore = normalizedStatus(detail.before);
  const statusAfter = normalizedStatus(detail.after);

  function statusIcon(status) {
    if (status === STATUS.PASS) return <CheckCircleOutlinedIcon />;
    if (status === STATUS.FAIL) return <HighlightOffOutlinedIcon />;
    return <HourglassEmptyOutlinedIcon />;
  }

  return (
    <Stack
      spacing={0.5}
      sx={{
        py: 0.875,
        borderTop: 1,
        borderColor: 'divider',
      }}
    >
      <Typography
        variant='formLabel'
        sx={{ color: 'primary.main', letterSpacing: 0.8 }}
      >
        {detail.label}
      </Typography>
      {isStatusRow ? (
        <Stack direction='row' spacing={0.75} sx={{ alignItems: 'center' }}>
          <Chip
            size='small'
            icon={statusIcon(statusBefore)}
            label={`Before: ${statusBefore}`}
            color={STATUS_COLOR[statusBefore] || 'default'}
            variant='outlined'
            sx={{
              height: 24,
              '& .MuiChip-label': {
                px: 1,
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
              },
              '& .MuiChip-icon': { fontSize: 14 },
            }}
          />
          <Typography variant='tableCell' color='text.secondary'>
            →
          </Typography>
          <Chip
            size='small'
            icon={statusIcon(statusAfter)}
            label={`After: ${statusAfter}`}
            color={STATUS_COLOR[statusAfter] || 'default'}
            sx={{
              height: 24,
              '& .MuiChip-label': {
                px: 1,
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
              },
              '& .MuiChip-icon': { fontSize: 14 },
            }}
          />
        </Stack>
      ) : (
        <Stack spacing={0.25}>
          <Typography variant='tableCell' color='text.secondary'>
            Before: {detail.before}
          </Typography>
          <Typography variant='tableCell' sx={{ fontWeight: 600 }}>
            After: {detail.after}
          </Typography>
        </Stack>
      )}
    </Stack>
  );
}

function SectionLabel({ children }) {
  return (
    <Typography
      variant='formLabel'
      color='text.secondary'
      sx={{ lineHeight: 1, mb: 1.5, display: 'block' }}
    >
      {children}
    </Typography>
  );
}

function RichField({ label, value }) {
  return (
    <Stack spacing={0.5}>
      <Typography variant='formLabel' color='text.disabled'>
        {label}
      </Typography>
      <Box
        sx={{
          borderLeft: '3px solid',
          borderColor: 'divider',
          pl: 1.5,
          py: 0.5,
          minHeight: 32,
        }}
      >
        {value ? (
          <RichTextDisplay value={value} />
        ) : (
          <Typography
            variant='tableCell'
            color='text.disabled'
            sx={{ fontStyle: 'italic' }}
          >
            —
          </Typography>
        )}
      </Box>
    </Stack>
  );
}

function ReadField({ label, value, mono, loading }) {
  return (
    <Stack spacing={0.25}>
      <Typography variant='formLabel' color='text.disabled'>
        {label}
      </Typography>
      {loading ? (
        <Skeleton variant='text' width='70%' />
      ) : (
        <Typography variant={mono ? 'mono' : 'tableCell'}>
          {value || '—'}
        </Typography>
      )}
    </Stack>
  );
}

/**
 * Per-environment results grid for a single test case.
 * Results are fetched by the parent (TestCaseDetailPanel) and passed as props
 * so both the mobile and desktop instances share one network round-trip.
 *
 * @param {{ environments: string[], envResults: Array<{env:string,result:object|null}>|null, envLoading: boolean }} props
 */
function EnvResultsGrid({ environments, envResults, envLoading }) {
  if (envLoading) {
    return (
      <Stack spacing={1}>
        {(environments ?? []).map((env) => (
          <Skeleton key={env} variant='rounded' height={36} />
        ))}
      </Stack>
    );
  }

  if (!envResults?.length) {
    return (
      <Typography variant='tableCell' color='text.disabled'>
        No environments configured.
      </Typography>
    );
  }

  return (
    <Stack spacing={1}>
      {envResults.map(({ env, result }) => {
        const st = normalizedStatus(result?.status);
        return (
          <Stack
            key={env}
            direction='row'
            spacing={1.5}
            sx={{
              alignItems: 'center',
              px: 1.5,
              py: 1,
              border: 1,
              borderColor: 'divider',
              borderRadius: 1,
            }}
          >
            <Typography
              variant='tableCell'
              sx={{ minWidth: 80, fontWeight: 600 }}
            >
              {env}
            </Typography>
            <Chip
              size='small'
              label={st}
              color={STATUS_COLOR[st] || 'default'}
              sx={{ minWidth: 72 }}
            />
            {result?.testedBy && (
              <Typography
                variant='tableCell'
                color='text.secondary'
                sx={{ flex: 1 }}
                noWrap
              >
                {result.testedBy}
                {result.testedOn
                  ? ` · ${new Date(result.testedOn).toLocaleDateString()}`
                  : ''}
              </Typography>
            )}
          </Stack>
        );
      })}
    </Stack>
  );
}

/**
 * Picks the most recently executed env result (largest testedOn). Rows that
 * were never executed (no testedOn — e.g. seeded Pending) are ignored.
 *
 * @param {Array<{env:string,result:object|null}>|null} envResults
 * @returns {{env:string, result:object}|null}
 */
function latestExecution(envResults) {
  if (!envResults?.length) return null;
  let latest = null;
  for (const row of envResults) {
    if (!row.result?.testedOn) continue;
    const ts = new Date(row.result.testedOn).getTime();
    if (Number.isNaN(ts)) continue;
    if (!latest || ts > latest.ts) latest = { ...row, ts };
  }
  if (!latest) return null;
  const { ts, ...rest } = latest;
  return rest;
}

/**
 * Read-only summary of the most recent execution across environments:
 * the fields the per-environment grid omits (notes, assignee, exact
 * timestamp). Values are rendered straight from the result row returned by the
 * API; fields with no value render as "—". Fed by the same `envResults` prop —
 * no extra network call.
 *
 * @param {{ envResults: Array<{env:string,result:object|null}>|null, envLoading: boolean }} props
 */
function ExecutionDetails({ envResults, envLoading }) {
  const latest = envLoading ? null : latestExecution(envResults);

  // Loaded, but nothing has been executed across any environment yet.
  if (!envLoading && !latest) {
    return (
      <Typography variant='tableCell' color='text.disabled'>
        Not yet executed.
      </Typography>
    );
  }

  // During load the labels stay put; only the values become skeletons.
  const env = latest?.env;
  const result = latest?.result;
  const st = result ? normalizedStatus(result.status) : null;

  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, sm: 6 }}>
        <ReadField label='Environment' value={env} loading={envLoading} />
      </Grid>
      <Grid size={{ xs: 12, sm: 6 }}>
        <Stack spacing={0.25}>
          <Typography variant='formLabel' color='text.disabled'>
            Status
          </Typography>
          {envLoading ? (
            <Skeleton variant='rounded' width={72} height={24} />
          ) : (
            <Box>
              <Chip
                size='small'
                label={st}
                color={STATUS_COLOR[st] || 'default'}
                sx={{ minWidth: 72 }}
              />
            </Box>
          )}
        </Stack>
      </Grid>
      <Grid size={{ xs: 12, sm: 6 }}>
        <ReadField
          label='Tested By'
          value={result?.testedBy}
          loading={envLoading}
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 6 }}>
        <ReadField
          label='Tested On'
          value={
            result?.testedOn ? new Date(result.testedOn).toLocaleString() : ''
          }
          loading={envLoading}
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 6 }}>
        <ReadField
          label='Assignee'
          value={result?.assignedTo}
          loading={envLoading}
        />
      </Grid>
      <Grid size={12}>
        <ReadField label='Notes' value={result?.notes} loading={envLoading} />
      </Grid>
    </Grid>
  );
}

/**
 * Detail panel: read-only sectioned view of a selected test case.
 * All edits go through modals — identity fields via the Edit modal (onEdit),
 * execution fields via the Pass / Fail / Pending modals (onAction).
 *
 * Shows a per-environment results grid when releaseId + environments are provided.
 */
export default function TestCaseDetail({
  tc,
  releaseId,
  environments,
  envResults,
  envLoading,
  historyOpen,
  historyEvents,
  historyLoading,
  historyError,
  onToggleHistory,
  onEdit,
  onAction,
  onClose,
}) {
  if (!tc) return null;

  const st = normalizedStatus(tc.status);
  const historyEntries = buildHistoryEntries(historyEvents);

  return (
    <Stack
      spacing={2}
      sx={{
        p: { xs: 2, sm: 3 },
      }}
    >
      {/* Header */}
      <Stack spacing={1}>
        <Stack
          direction='row'
          spacing={1}
          sx={{ alignItems: 'center', flexWrap: 'wrap' }}
        >
          {tc.testKey && (
            <Typography variant='mono' color='text.disabled'>
              {tc.testKey}
            </Typography>
          )}
          {tc.moduleName && (
            <>
              <Typography variant='tableCell' color='text.disabled'>
                ·
              </Typography>
              <Typography variant='tableCell' color='text.secondary'>
                {tc.applicationName}
              </Typography>
              <Typography variant='tableCell' color='text.disabled'>
                /
              </Typography>
              <Typography variant='tableCell' color='text.secondary'>
                {tc.moduleName}
              </Typography>
            </>
          )}
        </Stack>
        <Stack
          direction='row'
          spacing={1}
          sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }}
        >
          <Typography variant='panelTitle' component='h2' sx={{ flex: 1 }}>
            {tc.testCase || '—'}
          </Typography>
          <IconButton size='small' onClick={() => onEdit(tc)}>
            <EditIcon />
          </IconButton>
          <IconButton
            size='small'
            onClick={onClose}
            aria-label='Close detail panel'
          >
            <CloseIcon fontSize='small' />
          </IconButton>
        </Stack>
      </Stack>

      {/* Execution Action Buttons */}
      <Stack id='execution-action-buttons' direction='row' spacing={1}>
        <Tooltip
          title={
            st === STATUS.PASS
              ? 'Already marked as Pass — select a different status to change it'
              : ''
          }
        >
          <Button
            size='small'
            variant={st === STATUS.PASS ? 'contained' : 'outlined'}
            color='success'
            startIcon={
              st === STATUS.PASS ? (
                <CheckCircleIcon />
              ) : (
                <CheckCircleOutlinedIcon />
              )
            }
            onClick={
              st === STATUS.PASS ? undefined : () => onAction('pass', tc._id)
            }
          >
            Pass
          </Button>
        </Tooltip>
        <Tooltip
          title={
            st === STATUS.FAIL
              ? 'Already marked as Fail — select a different status to change it'
              : ''
          }
        >
          <Button
            size='small'
            variant={st === STATUS.FAIL ? 'contained' : 'outlined'}
            color='error'
            startIcon={
              st === STATUS.FAIL ? <CheckCircleIcon /> : <HighlightOffIcon />
            }
            onClick={
              st === STATUS.FAIL ? undefined : () => onAction('fail', tc._id)
            }
          >
            Fail
          </Button>
        </Tooltip>
        <Tooltip
          title={
            st === STATUS.PENDING
              ? 'Already marked as Pending — select a different status to change it'
              : ''
          }
        >
          <Button
            size='small'
            variant={st === STATUS.PENDING ? 'contained' : 'outlined'}
            color='warning'
            startIcon={
              st === STATUS.PENDING ? (
                <CheckCircleIcon />
              ) : (
                <RadioButtonUncheckedIcon />
              )
            }
            onClick={
              st === STATUS.PENDING
                ? undefined
                : () => onAction('pending', tc._id)
            }
          >
            Pending
          </Button>
        </Tooltip>
      </Stack>

      <Divider />

      {/* Card 1 — Test Content */}
      <Card variant='outlined'>
        <CardContent>
          <SectionLabel>Test Content</SectionLabel>
          <Stack spacing={2}>
            <RichField label='Description' value={tc.testCase} />
            <RichField label='Preconditions' value={tc.preconditions} />
            <RichField label='Steps' value={tc.steps} />
            <RichField label='Expected Result' value={tc.expectedResult} />
          </Stack>
        </CardContent>
      </Card>

      {/* Card 2 — Test Identity */}
      <Card variant='outlined'>
        <CardContent>
          <SectionLabel>Test Identity</SectionLabel>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <ReadField label='Test Key' value={tc.testKey} mono />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <ReadField label='Type' value={tc.type} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <ReadField label='Application' value={tc.applicationName} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <ReadField label='Module' value={tc.moduleName} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <ReadField label='Traceability' value={tc.traceability} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <ReadField label='Priority' value={tc.priority} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <ReadField label='Jira Story' value={tc.jiraStory} />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Card 3 — Execution Details (most recent execution) */}
      {releaseId && environments?.length > 0 && (
        <Card variant='outlined'>
          <CardContent>
            <SectionLabel>Execution Details</SectionLabel>
            <ExecutionDetails envResults={envResults} envLoading={envLoading} />
          </CardContent>
        </Card>
      )}

      {/* Card 4 — Results by Environment */}
      {releaseId && environments?.length > 0 && (
        <Card variant='outlined'>
          <CardContent>
            <SectionLabel>Results by Environment</SectionLabel>
            <EnvResultsGrid
              environments={environments}
              envResults={envResults}
              envLoading={envLoading}
            />
          </CardContent>
        </Card>
      )}

      <Button
        fullWidth
        variant={historyOpen ? 'contained' : 'outlined'}
        startIcon={<HistoryOutlinedIcon />}
        aria-label={historyOpen ? 'Hide history' : 'Show history'}
        onClick={onToggleHistory}
      >
        {historyOpen ? 'Hide History' : 'History'}
      </Button>

      {historyOpen && (
        <Card variant='outlined'>
          <CardContent>
            <SectionLabel>History</SectionLabel>
            {historyLoading ? (
              <Stack spacing={1}>
                <Skeleton variant='rounded' height={88} />
                <Skeleton variant='rounded' height={88} />
              </Stack>
            ) : historyError ? (
              <Alert severity='error'>{historyError}</Alert>
            ) : historyEntries.length === 0 ? (
              <Stack spacing={2} sx={{ alignItems: 'center', py: 3 }}>
                <ManageHistoryOutlinedIcon color='disabled' fontSize='large' />
                <Typography variant='sectionTitle'>No history yet</Typography>
                <Typography
                  variant='tableCell'
                  color='text.secondary'
                  sx={{ textAlign: 'center', maxWidth: 360 }}
                >
                  Changes and execution activity for this test case will appear
                  here after the next update.
                </Typography>
                <Button variant='contained' onClick={onToggleHistory}>
                  Hide history
                </Button>
              </Stack>
            ) : (
              <Stack spacing={1.5}>
                {historyEntries.map((entry) => (
                  <Card
                    key={entry._id}
                    variant='outlined'
                    sx={{
                      borderRadius: 2,
                      borderColor: 'divider',
                      bgcolor: 'background.paper',
                      boxShadow: '0 4px 16px rgba(15, 23, 42, 0.04)',
                    }}
                  >
                    <CardContent>
                      <Stack spacing={1}>
                        <Stack
                          direction='row'
                          spacing={1}
                          sx={{
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                        >
                          <Typography
                            variant='sectionTitle'
                            sx={{ flex: 1, minWidth: 0 }}
                          >
                            Updated by {actorName(entry.by)}
                          </Typography>
                          <Chip
                            size='small'
                            label={entry.environment || 'All environments'}
                            variant='outlined'
                          />
                        </Stack>

                        <Stack
                          direction='row'
                          spacing={0.75}
                          sx={{ alignItems: 'center' }}
                        >
                          <ScheduleOutlinedIcon
                            fontSize='small'
                            sx={{ color: 'primary.main' }}
                          />
                          <Typography
                            variant='tableCell'
                            color='text.secondary'
                          >
                            {new Date(entry.at).toLocaleString()}
                          </Typography>
                        </Stack>

                        <Stack
                          direction='row'
                          spacing={0.75}
                          sx={{ alignItems: 'center' }}
                        >
                          <UpdateOutlinedIcon
                            fontSize='small'
                            sx={{ color: 'primary.main' }}
                          />
                          <Typography variant='tableCell'>
                            {entry.summary}
                          </Typography>
                        </Stack>

                        {entry.details.length > 0 && (
                          <Stack spacing={0}>
                            {entry.details.map((detail) => (
                              <HistoryDetailRow
                                key={`${entry._id}-${detail.label}`}
                                detail={detail}
                              />
                            ))}
                          </Stack>
                        )}

                        {entry.details.length === 0 && (
                          <Typography
                            variant='tableCell'
                            color='text.secondary'
                          >
                            No field-level diff was recorded for this activity.
                          </Typography>
                        )}
                      </Stack>
                    </CardContent>
                  </Card>
                ))}
              </Stack>
            )}
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}
