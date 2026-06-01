'use client';

import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import {
  Alert,
  Button,
  Chip,
  Grid,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useCallback, useEffect, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import Panel from '@/components/Panel';
import PassRateBar from '@/components/PassRateBar';
import ToastProvider, { showToast } from '@/components/Toast';
import { useReleaseEnv } from '@/contexts/ReleaseEnvContext';
import { exportData as apiExportData } from '@/lib/api/exportData';
import { listTestCasesForRelease } from '@/lib/api/releases';
import { listResults } from '@/lib/api/results';
import { STATUS } from '@/lib/constants';
import { dateStamp, normalizedStatus } from '@/utils/formatters';
import { generateSignoffReport } from '@/utils/pdf/generateSignoffReport';

// Teal palette aliases — matches primary.main (#0d9488) at various opacities
const TEAL = '#0d9488';
const teal07 = alpha(TEAL, 0.07);
const teal30 = alpha(TEAL, 0.3);
const teal10 = alpha(TEAL, 0.1);

/**
 * Metric card — displays a single labelled number.
 *
 * @param {{ label: string, value: string|number|null, color?: string }} props
 */
function MetricCard({ label, value, color = 'text.primary' }) {
  return (
    <Stack
      spacing={0.5}
      sx={{
        bgcolor: 'background.default',
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        p: '14px 20px',
        textAlign: 'center',
        minWidth: 100,
      }}
    >
      <Typography variant='metricLabel' color='text.disabled'>
        {label}
      </Typography>
      <Typography variant='metricValue' component='p' sx={{ color }}>
        {value ?? '—'}
      </Typography>
    </Stack>
  );
}

/**
 * Computes pass/fail/pending counts and integer pass rate from a results array.
 *
 * @param {object[]} results
 * @returns {{ total: number, passed: number, failed: number, pending: number, passRate: number }}
 */
function computeSummary(results) {
  const total = results.length;
  const passed = results.filter((r) => r.status === STATUS.PASS).length;
  const failed = results.filter((r) => r.status === STATUS.FAIL).length;
  const pending = results.filter((r) => r.status === STATUS.PENDING).length;
  const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;
  return { total, passed, failed, pending, passRate };
}

/**
 * Reports page client — per-(release, environment) overview, per-app breakdown,
 * and export panel.
 *
 * Version-history table, complete/restore/delete version controls, and free-text
 * env/version inputs removed per the Releases × Environments refactor (RXR-11849).
 *
 * @param {{ applications: object[] }} props
 */
export default function ReportsClient({ applications }) {
  const { releaseId, releaseName, environment, activeRelease } =
    useReleaseEnv();

  const [selectedApp, setSelectedApp] = useState('');
  // summary: { total, passed, failed, pending, passRate } | null
  const [summary, setSummary] = useState(null);
  // appBreakdown: { appId, appName, total, passed, failed, pending, passRate }[]
  const [appBreakdown, setAppBreakdown] = useState([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [generatingExcel, setGeneratingExcel] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  // ── Data fetching ─────────────────────────────────────────────

  const fetchReportData = useCallback(async () => {
    if (!releaseId || !environment) {
      setSummary(null);
      setAppBreakdown([]);
      return;
    }
    setDataLoading(true);
    try {
      // Fetch the full results list and test-cases list in parallel.
      // The results route returns all results for (release, env); the test-cases
      // route carries applicationId per row. We join locally to build the
      // per-app breakdown without requiring a server-side aggregation.
      const [results, casesResp] = await Promise.all([
        listResults(releaseId, { environment }, { silentFailure: true }),
        listTestCasesForRelease(
          releaseId,
          { environment },
          { silentFailure: true },
        ),
      ]);

      if (!results) return;

      setSummary(computeSummary(results));

      // testCasesListResponseSchema: { data: [...], total, page, totalPages }
      const caseRows = casesResp?.data ?? [];
      const caseAppMap = Object.fromEntries(
        caseRows
          .filter((c) => c.caseId && c.applicationId)
          .map((c) => [c.caseId, c.applicationId]),
      );

      // Group results by applicationId.
      const appGroups = {};
      for (const result of results) {
        const appId = caseAppMap[result.caseId];
        if (!appId) continue;
        if (!appGroups[appId]) appGroups[appId] = [];
        appGroups[appId].push(result);
      }

      // Build name lookup from the server-fetched applications list.
      const appNameMap = Object.fromEntries(
        applications.map((a) => [a._id, a.name]),
      );

      const rows = Object.entries(appGroups)
        .map(([appId, appResults]) => ({
          appId,
          appName: appNameMap[appId] ?? 'Unknown Application',
          ...computeSummary(appResults),
        }))
        .sort((a, b) => a.appName.localeCompare(b.appName));

      setAppBreakdown(rows);
    } catch {
      // silentFailure handles per-request errors; top-level catch is defensive.
    } finally {
      setDataLoading(false);
    }
  }, [releaseId, environment, applications]);

  useEffect(() => {
    setSummary(null);
    setAppBreakdown([]);
    fetchReportData();
  }, [fetchReportData]);

  // ── Exports ───────────────────────────────────────────────

  async function exportExcel() {
    setGeneratingExcel(true);
    try {
      const query = { releaseId, environment };
      if (selectedApp) query.applicationId = selectedApp;

      const cases = await apiExportData(query);
      if (!cases?.length) {
        showToast('No test cases to export', 'info');
        return;
      }

      const { utils, writeFile } = await import('xlsx');
      const rows = cases.map((tc) => ({
        'Test Key': tc.testKey,
        'Platform/Application': tc.applicationName,
        Module: tc.moduleName,
        'Test Case': tc.name,
        Preconditions: tc.preconditions,
        Steps: tc.steps,
        'Expected Result': tc.expectedResult,
        Priority: tc.priority,
        'Jira Story': tc.jiraStory,
        Status: normalizedStatus(tc.status),
        Notes: tc.notes,
        'Tested By': tc.testedBy,
        'Tested On': tc.testedOn,
        Environment: tc.environment,
      }));

      const appLabel = selectedApp
        ? applications.find((a) => a._id === selectedApp)?.name
        : 'All';

      const summaryRows = [
        ['Metric', 'Value'],
        ['Application', appLabel],
        ['Release', releaseName ?? ''],
        ['Environment', environment ?? ''],
        ['Total Test Cases', cases.length],
        [
          'Passed',
          cases.filter((t) => normalizedStatus(t.status) === STATUS.PASS)
            .length,
        ],
        [
          'Failed',
          cases.filter((t) => normalizedStatus(t.status) === STATUS.FAIL)
            .length,
        ],
        [
          'Pending',
          cases.filter((t) => normalizedStatus(t.status) === STATUS.PENDING)
            .length,
        ],
        ['Generated', new Date().toLocaleString()],
      ];

      const wb = utils.book_new();
      const wsSummary = utils.aoa_to_sheet(summaryRows);
      wsSummary['!cols'] = [{ wch: 24 }, { wch: 30 }];
      utils.book_append_sheet(wb, wsSummary, 'Summary');

      const wsData = utils.json_to_sheet(rows);
      wsData['!cols'] = [
        14, 22, 18, 24, 18, 18, 24, 10, 14, 10, 30, 12, 14, 14,
      ].map((wch) => ({ wch }));
      utils.book_append_sheet(wb, wsData, 'Test Cases');

      const safeName = (releaseName ?? 'export').replace(/\s+/g, '-');
      writeFile(
        wb,
        `regression-report-${safeName}-${environment ?? ''}-${dateStamp()}.xlsx`,
      );
      showToast('Excel report exported', 'success');
    } catch (e) {
      console.error(e);
      showToast('Export failed', 'error');
    } finally {
      setGeneratingExcel(false);
    }
  }

  async function exportPdf() {
    setGeneratingPdf(true);
    try {
      const query = { releaseId, environment };
      if (selectedApp) query.applicationId = selectedApp;

      const cases = await apiExportData(query);
      if (!cases?.length) {
        showToast('No test cases to export', 'info');
        return;
      }

      const appName = selectedApp
        ? applications.find((a) => a._id === selectedApp)?.name
        : 'All Applications';

      const doc = await generateSignoffReport({
        cases,
        appName,
        environment: environment ?? '',
        version: releaseName ?? '',
      });

      const safeName = (releaseName ?? 'export').replace(/\s+/g, '-');
      doc.save(
        `regression-signoff-${safeName}-${environment ?? ''}-${dateStamp()}.pdf`,
      );
      showToast('PDF exported', 'success');
    } catch (e) {
      console.error(e);
      showToast('PDF export failed', 'error');
    } finally {
      setGeneratingPdf(false);
    }
  }

  // ── Render ────────────────────────────────────────────────

  const hasContext = Boolean(releaseId && environment);
  const isArchived = Boolean(activeRelease?.archived);

  const metricCards = [
    { label: 'Total', value: summary?.total, color: 'text.primary' },
    { label: 'Passed', value: summary?.passed, color: 'success.main' },
    {
      label: 'Failed',
      value: summary?.failed,
      color: (summary?.failed ?? 0) > 0 ? 'error.main' : 'text.disabled',
    },
    { label: 'Pending', value: summary?.pending, color: 'warning.main' },
    {
      label: 'Pass Rate',
      value: summary ? `${summary.passRate}%` : null,
      color: (summary?.passRate ?? 0) >= 80 ? 'success.main' : 'warning.main',
    },
  ];

  return (
    <>
      <ToastProvider />
      <Stack spacing={3}>
        <PageHeader
          eyebrow='Exports'
          title='Reports'
          sub='Overview and Excel / PDF exports for the active release and environment'
        />

        {/* Archived warning */}
        {isArchived && (
          <Alert severity='warning' variant='outlined'>
            This release is archived — exports are still available but no
            results can be recorded.
          </Alert>
        )}

        {/* ── Overview panel ───────────────────────────────────────── */}
        <Panel
          title='Overview'
          headerActions={
            hasContext ? (
              <Stack
                direction='row'
                spacing={1}
                sx={{ alignItems: 'center', flexWrap: 'wrap' }}
              >
                <Typography
                  variant='mono'
                  component='span'
                  sx={{
                    bgcolor: teal10,
                    border: `1px solid ${teal30}`,
                    borderRadius: 0.75,
                    px: 1.25,
                    py: 0.25,
                    color: 'success.dark',
                  }}
                >
                  {releaseName}
                </Typography>
                <Chip
                  label={environment}
                  size='small'
                  sx={{
                    bgcolor: teal07,
                    color: 'primary.dark',
                    border: `1px solid ${teal30}`,
                  }}
                />
              </Stack>
            ) : null
          }
        >
          {!hasContext ? (
            <Stack
              spacing={1}
              sx={{ py: 5, alignItems: 'center', textAlign: 'center' }}
            >
              <AssessmentOutlinedIcon
                sx={{ fontSize: 48, color: 'text.disabled' }}
              />
              <Typography variant='pageTitle' sx={{ fontSize: 18 }}>
                No release selected
              </Typography>
              <Typography variant='pageSub' color='text.disabled'>
                Select a release and environment in the bar above to view
                metrics.
              </Typography>
            </Stack>
          ) : (
            <Stack spacing={2} sx={{ p: 3 }}>
              <Grid container spacing={1.5}>
                {metricCards.map(({ label, value, color }) => (
                  <Grid key={label} size={{ xs: 6, sm: 4, md: 'grow' }}>
                    <MetricCard
                      label={label}
                      value={dataLoading ? '…' : value}
                      color={color}
                    />
                  </Grid>
                ))}
              </Grid>

              {!dataLoading && summary && (
                <PassRateBar
                  value={summary.passRate}
                  label={`Overall pass rate: ${summary.passRate}%`}
                />
              )}
            </Stack>
          )}
        </Panel>

        {/* ── Application Breakdown panel ───────────────────────────── */}
        {hasContext && (
          <Panel title='Application Breakdown'>
            {dataLoading ? (
              <Stack sx={{ py: 3, alignItems: 'center' }}>
                <Typography variant='tableCell' color='text.disabled'>
                  Loading…
                </Typography>
              </Stack>
            ) : appBreakdown.length === 0 ? (
              <Stack
                spacing={1}
                sx={{ py: 5, alignItems: 'center', textAlign: 'center' }}
              >
                <AssessmentOutlinedIcon
                  sx={{ fontSize: 48, color: 'text.disabled' }}
                />
                <Typography variant='pageTitle' sx={{ fontSize: 16 }}>
                  No test cases yet
                </Typography>
                <Typography variant='pageSub' color='text.disabled'>
                  Import test cases into this release to see per-application
                  metrics.
                </Typography>
                <Button variant='contained' href='/import-cases'>
                  Import Cases
                </Button>
              </Stack>
            ) : (
              <TableContainer>
                <Table
                  size='small'
                  stickyHeader
                  aria-label='Application breakdown'
                >
                  <TableHead
                    sx={{
                      '& th': {
                        bgcolor: 'action.selected',
                        borderBottomWidth: 2,
                        borderBottomColor: 'divider',
                      },
                    }}
                  >
                    <TableRow>
                      <TableCell>Application</TableCell>
                      <TableCell align='center'>Total</TableCell>
                      <TableCell align='center' sx={{ color: 'success.main' }}>
                        Pass
                      </TableCell>
                      <TableCell align='center' sx={{ color: 'error.main' }}>
                        Fail
                      </TableCell>
                      <TableCell align='center' sx={{ color: 'warning.main' }}>
                        Pending
                      </TableCell>
                      <TableCell align='center'>Pass Rate</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {appBreakdown.map((row) => (
                      <TableRow key={row.appId} hover>
                        <TableCell>
                          <Typography variant='tableCell' fontWeight={500}>
                            {row.appName}
                          </Typography>
                        </TableCell>
                        <TableCell align='center'>
                          <Typography variant='tableCell'>
                            {row.total}
                          </Typography>
                        </TableCell>
                        <TableCell
                          align='center'
                          sx={{ color: 'success.main' }}
                        >
                          <Typography variant='tableCell'>
                            {row.passed}
                          </Typography>
                        </TableCell>
                        <TableCell
                          align='center'
                          sx={{
                            color:
                              row.failed > 0 ? 'error.main' : 'text.disabled',
                          }}
                        >
                          <Typography variant='tableCell'>
                            {row.failed}
                          </Typography>
                        </TableCell>
                        <TableCell
                          align='center'
                          sx={{
                            color:
                              row.pending > 0
                                ? 'warning.main'
                                : 'text.disabled',
                          }}
                        >
                          <Typography variant='tableCell'>
                            {row.pending}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <PassRateBar
                            value={row.passRate}
                            label={`${row.appName} pass rate: ${row.passRate}%`}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Panel>
        )}

        {/* ── Export panel ────────────────────────────────────────────── */}
        <Panel
          title='Export'
          headerActions={
            <FileDownloadOutlinedIcon
              sx={{ color: 'text.disabled', fontSize: 20 }}
            />
          }
        >
          <Stack spacing={1.75} sx={{ p: 3 }}>
            {!hasContext ? (
              <Typography variant='tableCell' color='text.disabled'>
                Select a release and environment above to enable exports.
              </Typography>
            ) : (
              <>
                <Stack direction='row' spacing={1.75} sx={{ flexWrap: 'wrap' }}>
                  <TextField
                    select
                    label='Application / Scope'
                    value={selectedApp}
                    onChange={(e) => setSelectedApp(e.target.value)}
                    sx={{ minWidth: 200, flex: 1, maxWidth: 360 }}
                    slotProps={{
                      inputLabel: { shrink: true },
                      input: { notched: true },
                      select: { displayEmpty: true },
                    }}
                  >
                    <MenuItem value=''>All Applications</MenuItem>
                    {applications.map((a) => (
                      <MenuItem key={a._id} value={a._id}>
                        {a.name}
                      </MenuItem>
                    ))}
                  </TextField>
                </Stack>

                <Stack direction='row' spacing={1.25}>
                  <Button
                    variant='outlined'
                    onClick={exportExcel}
                    disabled={generatingExcel}
                    aria-busy={generatingExcel}
                  >
                    {generatingExcel ? 'Exporting…' : 'Export Excel'}
                  </Button>
                  <Button
                    variant='contained'
                    onClick={exportPdf}
                    disabled={generatingPdf}
                    aria-busy={generatingPdf}
                  >
                    {generatingPdf ? 'Generating…' : 'Export PDF Signoff'}
                  </Button>
                </Stack>
              </>
            )}
          </Stack>
        </Panel>
      </Stack>
    </>
  );
}
