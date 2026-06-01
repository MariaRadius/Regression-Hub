'use client';

import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import TableChartOutlinedIcon from '@mui/icons-material/TableChartOutlined';
import {
  Alert,
  Button,
  Chip,
  Grid,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useCallback, useEffect, useState } from 'react';
import EmptyState from '@/components/EmptyState';
import PageHeader from '@/components/PageHeader';
import Panel from '@/components/Panel';
import PassRateBar from '@/components/PassRateBar';
import { showToast } from '@/components/Toast';
import { useReleaseEnv } from '@/contexts/ReleaseEnvContext';
import { exportData as apiExportData } from '@/lib/api/exportData';
import { listResults } from '@/lib/api/results';
import {
  listSnapshots,
  saveSnapshot,
  snapshotDownloadUrl,
} from '@/lib/api/snapshots';
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
 * @see {@link app/(app)/reports/__tests__/ReportsClient.test.jsx}
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
 * Formats a generatedAt ISO string into a readable local date + time.
 *
 * @param {string} iso
 * @returns {string}
 */
function formatSnapshotDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Reports page client — context overview, PDF snapshot download, Excel export,
 * and Version History table.
 *
 * Clean-slate rewrite per spec §2.1, §3.1, §4, §5 (RXR-11849):
 *  - Application Breakdown table removed.
 *  - PDF generates + downloads locally then uploads as a stored snapshot.
 *  - Excel is always built from latest data and never stored or audited.
 *  - Version History lists one stored PDF snapshot per (release, environment).
 *
 * @param {{ initialSnapshots: object[] }} props
 * @see {@link app/(app)/reports/__tests__/ReportsClient.test.jsx}
 */
export default function ReportsClient({ initialSnapshots }) {
  const { releaseId, releaseName, environment } = useReleaseEnv();

  // summary: { total, passed, failed, pending, passRate } | null
  const [summary, setSummary] = useState(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [generatingExcel, setGeneratingExcel] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [snapshots, setSnapshots] = useState(initialSnapshots ?? []);

  const hasContext = Boolean(releaseId && environment);

  // ── Overview data fetching ────────────────────────────────────────────────

  const fetchOverview = useCallback(async () => {
    if (!releaseId || !environment) {
      setSummary(null);
      return;
    }
    setDataLoading(true);
    try {
      const results = await listResults(
        releaseId,
        { environment },
        { silentFailure: true },
      );
      if (!results) return;
      setSummary(computeSummary(results));
    } catch {
      // silentFailure handles per-request errors; defensive catch
    } finally {
      setDataLoading(false);
    }
  }, [releaseId, environment]);

  useEffect(() => {
    setSummary(null);
    fetchOverview();
  }, [fetchOverview]);

  // ── Snapshot list refresh ─────────────────────────────────────────────────

  async function refreshSnapshots() {
    try {
      const updated = await listSnapshots({ silentFailure: true });
      if (updated) setSnapshots(updated);
    } catch {
      // best-effort refresh; do not surface to the user
    }
  }

  // ── PDF download + snapshot upload ───────────────────────────────────────

  /**
   * Generates a fresh PDF signoff report, downloads it locally, and uploads the
   * same bytes as the stored snapshot for the active (release, environment).
   *
   * Local download always happens first. Upload failure surfaces a warning toast
   * without blocking the user from having the file.
   *
   * @see {@link app/(app)/reports/__tests__/ReportsClient.test.jsx}
   */
  async function onDownloadPdf() {
    setGeneratingPdf(true);
    try {
      const cases = await apiExportData({ releaseId, environment });
      if (!cases?.length) {
        showToast('No test cases to export', 'info');
        return;
      }

      const doc = await generateSignoffReport({
        cases,
        appName: 'All Applications',
        environment: environment ?? '',
        version: releaseName ?? '',
      });

      const safeName = (releaseName ?? 'export').replace(/\s+/g, '-');
      const filename = `regression-signoff-${safeName}-${environment ?? ''}-${dateStamp()}.pdf`;

      // 1. Download locally first — this must always succeed before we attempt upload.
      doc.save(filename);

      // 2. Upload the same bytes as the stored snapshot.
      const blob = new Blob([doc.output('blob')], { type: 'application/pdf' });
      const fd = new FormData();
      fd.append('file', blob, filename);
      fd.append('environment', environment);
      fd.append('filename', filename);

      try {
        await saveSnapshot(releaseId, fd);
        showToast('PDF downloaded and saved to Version History', 'success');
        await refreshSnapshots();
      } catch {
        showToast(
          'PDF downloaded, but saving to Version History failed',
          'warning',
        );
      }
    } catch (e) {
      console.error(e);
      showToast('PDF export failed', 'error');
    } finally {
      setGeneratingPdf(false);
    }
  }

  // ── Excel export (client-side xlsx, no snapshot) ─────────────────────────

  /**
   * Exports the latest saved data for the active (release, environment) as an
   * import-compatible Excel workbook. No snapshot is created or audited.
   *
   * @see {@link app/(app)/reports/__tests__/ReportsClient.test.jsx}
   */
  async function onExportExcel() {
    setGeneratingExcel(true);
    try {
      const cases = await apiExportData({ releaseId, environment });
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

      const summaryRows = [
        ['Metric', 'Value'],
        ['Application', 'All'],
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

  // ── Metric cards ─────────────────────────────────────────────────────────

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

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Stack spacing={3}>
      <PageHeader
        title='Reports'
        sub='Generate signed-off PDF snapshots and editable Excel exports for a release and environment.'
      />

      {/* ── Context bar ─────────────────────────────────────────────── */}
      {hasContext ? (
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
      ) : (
        <Alert severity='info'>
          Select a release and environment from the top bar to generate reports.
        </Alert>
      )}

      {/* ── Overview panel ───────────────────────────────────────────── */}
      <Panel title='Overview'>
        <Stack spacing={2} sx={{ p: 3 }}>
          {hasContext ? (
            <>
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
            </>
          ) : (
            <Typography variant='tableCell' color='text.disabled'>
              No release selected.
            </Typography>
          )}
        </Stack>
      </Panel>

      {/* ── Download PDF panel ───────────────────────────────────────── */}
      <Panel title='Download PDF'>
        <Stack spacing={2} sx={{ p: 3 }}>
          <Alert severity='info'>
            Downloading a PDF generates a fresh report, downloads it to you, and
            saves it as the snapshot for this release + environment. Generating
            again replaces the previous snapshot.
          </Alert>
          <Stack direction='row' spacing={1.5} sx={{ alignItems: 'center' }}>
            <Tooltip title='Generates and downloads a PDF, and stores it in Version History (one snapshot per release + environment).'>
              <span>
                <Button
                  variant='contained'
                  startIcon={<PictureAsPdfOutlinedIcon />}
                  onClick={onDownloadPdf}
                  disabled={!hasContext || generatingPdf}
                  aria-busy={generatingPdf}
                >
                  {generatingPdf ? 'Generating…' : 'Download PDF'}
                </Button>
              </span>
            </Tooltip>
          </Stack>
        </Stack>
      </Panel>

      {/* ── Export Excel panel ───────────────────────────────────────── */}
      <Panel title='Export Excel'>
        <Stack spacing={2} sx={{ p: 3 }}>
          <Alert severity='info'>
            Excel exports reflect the latest saved data and can be re-imported
            into this release. They are not saved to Version History or audited.
          </Alert>
          <Stack spacing={0.5}>
            <Tooltip title='Exports the latest saved data as an import-compatible Excel workbook. Not stored.'>
              <span>
                <Button
                  variant='outlined'
                  startIcon={<TableChartOutlinedIcon />}
                  onClick={onExportExcel}
                  disabled={!hasContext || generatingExcel}
                  aria-busy={generatingExcel}
                >
                  {generatingExcel ? 'Exporting…' : 'Export Excel'}
                </Button>
              </span>
            </Tooltip>
            <Typography variant='caption' color='text.disabled'>
              Editable · import-compatible · not stored.
            </Typography>
          </Stack>
        </Stack>
      </Panel>

      {/* ── Version History panel ────────────────────────────────────── */}
      <Panel title='Version History'>
        <Stack spacing={2} sx={{ p: 3 }}>
          <Alert severity='info'>
            Shows the latest stored PDF snapshot for each release + environment.
            Only the most recent snapshot per combination is kept.
          </Alert>
          {snapshots.length === 0 ? (
            <EmptyState
              icon={
                <HistoryOutlinedIcon
                  sx={{ fontSize: 48, color: 'text.disabled' }}
                />
              }
              title='No snapshots yet'
            >
              <Typography variant='pageSub' color='text.disabled'>
                Download a PDF to create your first snapshot.
              </Typography>
            </EmptyState>
          ) : (
            <TableContainer>
              <Table size='small' stickyHeader aria-label='Version history'>
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
                    <TableCell>Release</TableCell>
                    <TableCell>Environment</TableCell>
                    <TableCell>Snapshot Timestamp</TableCell>
                    <TableCell>Generated By</TableCell>
                    <TableCell align='center'>Download</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {snapshots.map((s) => (
                    <TableRow key={s._id} hover>
                      <TableCell>
                        <Typography variant='tableCell' fontWeight={500}>
                          {s.releaseName}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip label={s.environment} size='small' />
                      </TableCell>
                      <TableCell>
                        <Typography variant='tableCell'>
                          {formatSnapshotDate(s.generatedAt)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant='tableCell'>
                          {s.generatedBy}
                        </Typography>
                      </TableCell>
                      <TableCell align='center'>
                        <Tooltip title='Download the stored snapshot (no regeneration).'>
                          <Button
                            component='a'
                            href={snapshotDownloadUrl(s._id)}
                            download
                            size='small'
                            startIcon={<DownloadOutlinedIcon />}
                          >
                            Download
                          </Button>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Stack>
      </Panel>
    </Stack>
  );
}
