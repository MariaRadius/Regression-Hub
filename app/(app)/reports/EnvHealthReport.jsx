'use client';

import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import ErrorOutlinedIcon from '@mui/icons-material/ErrorOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import {
  Alert,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useCallback, useEffect, useRef, useState } from 'react';
import { showToast } from '@/components/Toast';
import { createEnvHealthJob, pollEnvHealthJob } from '@/lib/api/envHealth';

const POLL_INTERVAL_MS = 3000;

function passRateColor(rate) {
  if (rate === null) return 'text.disabled';
  if (rate >= 80) return 'pass.main';
  if (rate >= 50) return 'warning.main';
  return 'error.main';
}

function PassRateCell({ rate, total }) {
  if (!total) {
    return (
      <Typography variant='tableCell' color='text.disabled'>
        —
      </Typography>
    );
  }
  return (
    <Typography
      variant='tableCell'
      sx={{ fontWeight: 600, color: passRateColor(rate) }}
    >
      {rate}%
    </Typography>
  );
}

function ReportMatrix({ matrix, releases }) {
  if (!matrix?.length) return null;
  return (
    <Stack spacing={1}>
      <Typography variant='panelTitle'>Environment Health Matrix</Typography>
      <Typography variant='tableCell' color='text.secondary'>
        Pass rate per environment across all releases.
      </Typography>
      <TableContainer component={Paper} variant='outlined'>
        <Table size='small'>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Environment</TableCell>
              {releases.map((r) => (
                <TableCell key={r._id} align='center' sx={{ fontWeight: 700 }}>
                  <Stack spacing={0.25} sx={{ alignItems: 'center' }}>
                    <span>{r.name}</span>
                    {r.archived ? (
                      <Chip
                        label='archived'
                        size='small'
                        sx={{
                          fontSize: 9,
                          height: 16,
                          width: 'fit-content',
                          bgcolor: 'warning.light',
                          color: 'warning.main',
                          border: '1px solid',
                          borderColor: 'warning.light',
                          fontWeight: 600,
                        }}
                      />
                    ) : (
                      <Chip
                        label='active'
                        size='small'
                        sx={{
                          fontSize: 9,
                          height: 16,
                          width: 'fit-content',
                          bgcolor: 'pass.light',
                          color: 'pass.main',
                          border: '1px solid',
                          borderColor: 'pass.border',
                          fontWeight: 600,
                        }}
                      />
                    )}
                  </Stack>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {matrix.map((row) => (
              <TableRow
                key={row.environment}
                sx={{ '&:last-child td': { border: 0 } }}
              >
                <TableCell>
                  <Typography variant='tableCell' sx={{ fontWeight: 600 }}>
                    {row.environment}
                  </Typography>
                </TableCell>
                {row.releases.map((rel) => (
                  <TableCell key={rel.releaseId} align='center'>
                    <Stack spacing={0} sx={{ alignItems: 'center' }}>
                      <PassRateCell rate={rel.passRate} total={rel.total} />
                      {rel.hasData && (
                        <Typography
                          variant='tableCell'
                          color='text.disabled'
                          sx={{ fontSize: 10 }}
                        >
                          {rel.passed}/{rel.total}
                        </Typography>
                      )}
                    </Stack>
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  );
}

function ReleaseTrend({ trend, environments }) {
  if (!trend?.length) return null;
  return (
    <Stack spacing={1}>
      <Typography variant='panelTitle'>Release Trend</Typography>
      <Typography variant='tableCell' color='text.secondary'>
        Overall pass rate per release over time (oldest → newest).
      </Typography>
      <TableContainer component={Paper} variant='outlined'>
        <Table size='small'>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Release</TableCell>
              <TableCell align='center' sx={{ fontWeight: 700 }}>
                Overall
              </TableCell>
              {environments.map((env) => (
                <TableCell key={env} align='center' sx={{ fontWeight: 700 }}>
                  {env}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {trend.map((row) => (
              <TableRow
                key={row.releaseId}
                sx={{ '&:last-child td': { border: 0 } }}
              >
                <TableCell>
                  <Stack spacing={0.25}>
                    <Typography variant='tableCell' sx={{ fontWeight: 600 }}>
                      {row.releaseName}
                    </Typography>
                    {row.archived ? (
                      <Chip
                        label='archived'
                        size='small'
                        sx={{
                          fontSize: 9,
                          height: 16,
                          width: 'fit-content',
                          bgcolor: 'warning.light',
                          color: 'warning.main',
                          border: '1px solid',
                          borderColor: 'warning.light',
                          fontWeight: 600,
                        }}
                      />
                    ) : (
                      <Chip
                        label='active'
                        size='small'
                        sx={{
                          fontSize: 9,
                          height: 16,
                          width: 'fit-content',
                          bgcolor: 'pass.light',
                          color: 'pass.main',
                          border: '1px solid',
                          borderColor: 'pass.border',
                          fontWeight: 600,
                        }}
                      />
                    )}
                  </Stack>
                </TableCell>
                <TableCell align='center'>
                  <PassRateCell
                    rate={row.overall}
                    total={row.overall !== null ? 1 : 0}
                  />
                </TableCell>
                {environments.map((env) => (
                  <TableCell key={env} align='center'>
                    <PassRateCell
                      rate={row.environments[env]}
                      total={row.environments[env] !== null ? 1 : 0}
                    />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  );
}

export default function EnvHealthReport() {
  const [jobStatus, setJobStatus] = useState(null);
  const [reportData, setReportData] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const pollRef = useRef(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const startPolling = useCallback(
    (id) => {
      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          const job = await pollEnvHealthJob(id);
          setJobStatus(job.status);
          if (job.status === 'completed') {
            stopPolling();
            setReportData(job.result);
          } else if (job.status === 'failed') {
            stopPolling();
            setErrorMsg(job.error ?? 'Report generation failed.');
            showToast('Report generation failed', 'error');
          }
        } catch {
          stopPolling();
          setJobStatus('failed');
          setErrorMsg('Could not reach the server while polling.');
        }
      }, POLL_INTERVAL_MS);
    },
    [stopPolling],
  );

  async function handleGenerate() {
    setJobStatus(null);
    setReportData(null);
    setErrorMsg(null);
    try {
      const { jobId: id } = await createEnvHealthJob();
      setJobStatus('queued');
      startPolling(id);
    } catch {
      setJobStatus('failed');
      setErrorMsg('Could not start report generation.');
    }
  }

  const isRunning = jobStatus === 'queued' || jobStatus === 'processing';

  return (
    <Paper
      variant='outlined'
      sx={{
        p: 3,
        borderLeftWidth: 4,
        borderLeftColor:
          jobStatus === 'completed' ? 'pass.main' : 'primary.main',
      }}
    >
      <Stack spacing={2}>
        <Stack
          direction='row'
          spacing={2}
          sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}
        >
          <Stack spacing={0.5}>
            <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
              <AssessmentOutlinedIcon sx={{ color: 'primary.main' }} />
              <Typography variant='panelTitle' component='h2'>
                Environment Health &amp; Release Trend
              </Typography>
            </Stack>
            <Typography variant='tableCell' color='text.secondary'>
              Aggregates pass/fail/pending data across all releases and
              environments. Runs as a background job — you can continue working
              while it processes.
            </Typography>
          </Stack>

          <Button
            variant={jobStatus === 'completed' ? 'outlined' : 'contained'}
            size='small'
            startIcon={
              isRunning ? (
                <CircularProgress size={14} color='inherit' />
              ) : jobStatus === 'completed' ? (
                <RefreshIcon />
              ) : (
                <AssessmentOutlinedIcon />
              )
            }
            onClick={handleGenerate}
            disabled={isRunning}
            sx={{ flexShrink: 0 }}
          >
            {isRunning
              ? jobStatus === 'queued'
                ? 'Queued…'
                : 'Processing…'
              : jobStatus === 'completed'
                ? 'Regenerate'
                : 'Generate Report'}
          </Button>
        </Stack>

        {jobStatus === 'queued' && (
          <Alert severity='info' icon={<CircularProgress size={16} />}>
            Report queued — waiting for processing to start…
          </Alert>
        )}
        {jobStatus === 'processing' && (
          <Alert severity='info' icon={<CircularProgress size={16} />}>
            Running aggregations across all releases and environments…
          </Alert>
        )}
        {jobStatus === 'failed' && (
          <Alert severity='error' icon={<ErrorOutlinedIcon />}>
            {errorMsg ?? 'Report generation failed. Try again.'}
          </Alert>
        )}

        {jobStatus === 'completed' && reportData && (
          <Stack spacing={3}>
            <Divider />
            <ReportMatrix
              matrix={reportData.matrix}
              releases={reportData.releases}
            />
            <ReleaseTrend
              trend={reportData.trend}
              environments={reportData.environments}
            />
            {!reportData.matrix?.length && (
              <Typography variant='tableCell' color='text.secondary'>
                No test result data found. Run some tests first.
              </Typography>
            )}
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
