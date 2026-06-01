'use client';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import HighlightOffIcon from '@mui/icons-material/HighlightOff';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import {
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
import { useEffect, useState } from 'react';
import RichTextDisplay from '@/components/RichTextDisplay';
import { listResults } from '@/lib/api/results';
import { STATUS } from '@/lib/constants';
import { normalizedStatus } from '@/utils/formatters';

const STATUS_COLOR = {
  [STATUS.PASS]: 'success',
  [STATUS.FAIL]: 'error',
  [STATUS.PENDING]: 'warning',
};

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

function ReadField({ label, value, mono }) {
  return (
    <Stack spacing={0.25}>
      <Typography variant='formLabel' color='text.disabled'>
        {label}
      </Typography>
      <Typography variant={mono ? 'mono' : 'tableCell'}>
        {value || '—'}
      </Typography>
    </Stack>
  );
}

/**
 * Per-environment results grid for a single test case.
 * Fetches all environments' results from the active release.
 *
 * @param {{ releaseId: string, caseId: string, environments: string[] }} props
 */
function EnvResultsGrid({ releaseId, caseId, environments }) {
  const [envResults, setEnvResults] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!releaseId || !caseId || !environments?.length) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);

    Promise.all(
      environments.map((env) =>
        listResults(releaseId, { environment: env, caseId }).then((rows) => ({
          env,
          result: rows.find((r) => r.caseId === caseId) ?? null,
        })),
      ),
    )
      .then((rows) => {
        if (!cancelled) {
          setEnvResults(rows);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [releaseId, caseId, environments]);

  if (loading) {
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
  onEdit,
  onAction,
  onClose,
}) {
  if (!tc) return null;

  const st = normalizedStatus(tc.status);

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

      {/* Card 3 — Results by Environment */}
      {releaseId && environments?.length > 0 && (
        <Card variant='outlined'>
          <CardContent>
            <SectionLabel>Results by Environment</SectionLabel>
            <EnvResultsGrid
              releaseId={releaseId}
              caseId={tc.caseId}
              environments={environments}
            />
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}
