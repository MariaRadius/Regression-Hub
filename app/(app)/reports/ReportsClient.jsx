'use client';

import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import GridOnOutlinedIcon from '@mui/icons-material/GridOnOutlined';
import PostAddOutlinedIcon from '@mui/icons-material/PostAddOutlined';
import {
  Alert,
  AlertTitle,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { useMemo, useState } from 'react';
import EmptyState from '@/components/EmptyState';
import PageHeader from '@/components/PageHeader';
import Panel from '@/components/Panel';
import { showToast } from '@/components/Toast';
import { useReleaseEnv } from '@/contexts/ReleaseEnvContext';
import { exportData as apiExportData } from '@/lib/api/exportData';
import {
  listSnapshots,
  saveSnapshot,
  snapshotDownloadUrl,
} from '@/lib/api/snapshots';
import { ROLES } from '@/lib/constants';
import { dateStamp } from '@/utils/formatters';
import { generateSignoffReport } from '@/utils/pdf/generateSignoffReport';
import EnvHealthReport from './EnvHealthReport';
import { buildExcelExportData } from './exportWorkbook';

/** Composite key uniquely identifying a (release, environment) row. */
function rowKey(releaseId, environment) {
  return `${releaseId}::${environment}`;
}

/**
 * Derives the unified report rows from the active releases and stored snapshots.
 *
 * 1. One generatable row per non-archived release × environment, left-joining the
 *    saved copy by `releaseId::environment` (null when none → "Not generated yet").
 * 2. A download-only row for any saved copy whose (release, environment) is not
 *    already covered above (release archived/renamed) so no stored report is hidden.
 * 3. Stable sort by release name, then environment.
 *
 * Pure and exported for unit testing.
 *
 * @param {Array<{ _id: string, name: string, environments?: string[], archived?: boolean }>} releases
 * @param {Array<{ _id: string, releaseId: string, releaseName: string, environment: string }>} snapshots
 * @returns {Array<{ releaseId: string, releaseName: string, environment: string, snapshot: object|null, generatable: boolean }>}
 * @see {@link app/(app)/reports/__tests__/buildReportRows.test.js}
 */
export function buildReportRows(releases, snapshots) {
  const snaps = snapshots ?? [];
  const active = (releases ?? []).filter((r) => !r.archived);

  const covered = new Set();
  const rows = [];

  for (const release of active) {
    for (const environment of release.environments ?? []) {
      covered.add(rowKey(release._id, environment));
      const snapshot =
        snaps.find(
          (s) => s.releaseId === release._id && s.environment === environment,
        ) ?? null;
      rows.push({
        releaseId: release._id,
        releaseName: release.name,
        environment,
        snapshot,
        generatable: true,
      });
    }
  }

  // Append download-only rows for stored copies whose release is no longer active.
  for (const s of snaps) {
    const key = rowKey(s.releaseId, s.environment);
    if (covered.has(key)) continue;
    covered.add(key);
    rows.push({
      releaseId: s.releaseId,
      releaseName: s.releaseName,
      environment: s.environment,
      snapshot: s,
      generatable: false,
    });
  }

  rows.sort((a, b) => {
    const byName = (a.releaseName ?? '').localeCompare(b.releaseName ?? '');
    if (byName !== 0) return byName;
    return (a.environment ?? '').localeCompare(b.environment ?? '');
  });

  return rows;
}

/**
 * Groups sorted report rows by release for sectioned rendering.
 * Preserves the incoming sort order (release name, then environment).
 *
 * @param {ReturnType<typeof buildReportRows>} rows
 * @returns {Array<{ releaseId: string, releaseName: string, generatable: boolean, rows: object[] }>}
 */
function groupByRelease(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.releaseId)) {
      groups.set(row.releaseId, {
        releaseId: row.releaseId,
        releaseName: row.releaseName,
        generatable: row.generatable,
        rows: [],
      });
    }
    groups.get(row.releaseId).rows.push(row);
  }
  return [...groups.values()];
}

/**
 * Formats a generatedAt ISO string into a deterministic UTC date + time.
 *
 * @param {string} iso
 * @returns {string}
 */
export function formatSnapshotDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const month = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ][d.getUTCMonth()];
  const day = d.getUTCDate();
  const year = d.getUTCFullYear();
  const hour = d.getUTCHours();
  const minute = String(d.getUTCMinutes()).padStart(2, '0');
  return `${month} ${day}, ${year}, ${hour}:${minute} UTC`;
}

/**
 * A single environment card: shows the latest saved copy (or its absence) and
 * the in-place actions for that (release, environment).
 *
 * @param {{
 *   row: object,
 *   busy: 'create' | 'excel' | undefined,
 *   onCreate: (row: object) => void,
 *   onExcel: (row: object) => void,
 * }} props
 */
function ReportCard({ row, busy, onCreate, onExcel }) {
  const { snapshot, generatable } = row;
  const creating = busy === 'create';
  const exporting = busy === 'excel';
  const rowBusy = Boolean(busy);

  return (
    <Paper
      variant='outlined'
      sx={{
        p: 2,
        height: '100%',
        borderLeftWidth: 4,
        borderLeftColor: snapshot ? 'success.main' : 'divider',
        transition: 'box-shadow 120ms ease',
        '&:hover': { boxShadow: 2 },
      }}
    >
      <Stack spacing={2} sx={{ height: '100%' }}>
        <Stack spacing={2} sx={{ flexGrow: 1 }}>
          <Typography
            variant='mono'
            component='span'
            sx={{
              fontWeight: 700,
              letterSpacing: '0.04em',
              color: 'text.primary',
            }}
          >
            {row.environment}
          </Typography>

          {snapshot ? (
            <Stack spacing={0.25}>
              <Stack
                direction='row'
                spacing={1}
                sx={{
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <Typography
                  variant='caption'
                  sx={{
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'text.secondary',
                  }}
                >
                  Last snapshot
                </Typography>
                <Tooltip title='Download the saved copy — the exact same PDF, no rebuild.'>
                  <IconButton
                    component='a'
                    href={snapshotDownloadUrl(snapshot._id)}
                    download
                    size='small'
                    color='primary'
                    aria-label={`Download saved copy for ${row.releaseName} ${row.environment}`}
                  >
                    <FileDownloadOutlinedIcon fontSize='small' />
                  </IconButton>
                </Tooltip>
              </Stack>
              <Typography
                variant='tableCell'
                sx={{ fontWeight: 500 }}
                suppressHydrationWarning
              >
                {formatSnapshotDate(snapshot.generatedAt)}
              </Typography>
              <Typography variant='caption' color='text.disabled'>
                by {snapshot.generatedBy}
              </Typography>
            </Stack>
          ) : (
            <Stack spacing={0.25}>
              <Typography variant='tableCell' color='text.secondary'>
                No snapshot yet
              </Typography>
              <Typography variant='caption' color='text.disabled'>
                Create one to download and save it here.
              </Typography>
            </Stack>
          )}
        </Stack>

        {generatable && (
          <Stack spacing={1}>
            <Tooltip title='Builds a fresh PDF and replaces the current saved copy.'>
              <span>
                <Button
                  fullWidth
                  variant='contained'
                  size='small'
                  startIcon={
                    creating ? (
                      <CircularProgress size={16} color='inherit' />
                    ) : (
                      <PostAddOutlinedIcon />
                    )
                  }
                  onClick={() => onCreate(row)}
                  disabled={rowBusy}
                  aria-busy={creating}
                  aria-label={`Create report for ${row.releaseName} ${row.environment}`}
                >
                  {creating ? 'Creating…' : 'Create report'}
                </Button>
              </span>
            </Tooltip>
            <Tooltip title='Editable spreadsheet of the latest data — not saved here.'>
              <span>
                <Button
                  fullWidth
                  variant='text'
                  size='small'
                  startIcon={
                    exporting ? (
                      <CircularProgress size={16} color='inherit' />
                    ) : (
                      <GridOnOutlinedIcon />
                    )
                  }
                  onClick={() => onExcel(row)}
                  disabled={rowBusy}
                  aria-busy={exporting}
                  aria-label={`Export Excel for ${row.releaseName} ${row.environment}`}
                >
                  {exporting ? 'Exporting…' : 'Export Excel'}
                </Button>
              </span>
            </Tooltip>
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}

/**
 * Reports page client — a single guided surface over every active Release ×
 * Environment, grouped into release cards. Each environment card can create a
 * fresh regression report (PDF, downloaded + saved as the latest copy),
 * re-download the saved copy without rebuilding it, or export an editable,
 * import-ready Excel spreadsheet (never stored).
 *
 * Clean-slate rewrite per spec §2.1, §3.1, §4, §5 (RXR-11849): no Overview,
 * no Application Breakdown, no single active-selection scoping — the page lists
 * every combo with per-row, keyed busy state.
 *
 * @param {{ initialSnapshots: object[] }} props
 * @see {@link app/(app)/reports/__tests__/ReportsClient.test.jsx}
 * @see {@link app/(app)/reports/__tests__/buildReportRows.test.js}
 */
export default function ReportsClient({ initialSnapshots, userRole }) {
  const { releases } = useReleaseEnv();
  const canManageReleases = userRole === ROLES.ADMIN;

  const [snapshots, setSnapshots] = useState(initialSnapshots ?? []);
  // busy: { [rowKey]: 'create' | 'excel' } — one in-flight action per row.
  const [busy, setBusy] = useState({});

  const groups = useMemo(
    () => groupByRelease(buildReportRows(releases, snapshots)),
    [releases, snapshots],
  );

  function setRowBusy(key, action) {
    setBusy((b) => ({ ...b, [key]: action }));
  }

  function clearRowBusy(key) {
    setBusy((b) => {
      const next = { ...b };
      delete next[key];
      return next;
    });
  }

  async function refreshSnapshots() {
    const updated = await listSnapshots({ silentFailure: true });
    if (updated) setSnapshots(updated);
  }

  // ── Create report: generate PDF, download locally, save as latest copy ─────

  /**
   * Generates a fresh signoff PDF for the row, downloads it locally, then uploads
   * the same bytes as the latest stored copy. The local download always happens
   * first; an upload failure surfaces a warning without blocking the file.
   *
   * @param {{ releaseId: string, releaseName: string, environment: string }} row
   * @see {@link app/(app)/reports/__tests__/ReportsClient.test.jsx}
   */
  async function onCreateReport(row) {
    const key = rowKey(row.releaseId, row.environment);
    setRowBusy(key, 'create');
    try {
      const cases = await apiExportData({
        releaseId: row.releaseId,
        environment: row.environment,
      });
      if (!cases?.length) {
        showToast(
          'No test cases to report on for this release and environment',
          'info',
        );
        return;
      }

      const doc = await generateSignoffReport({
        cases,
        appName: 'All Applications',
        environment: row.environment,
        version: row.releaseName ?? '',
      });

      const safeName = (row.releaseName ?? 'export').replace(/\s+/g, '-');
      const filename = `regression-signoff-${safeName}-${row.environment}-${dateStamp()}.pdf`;

      // 1. Download locally first — must succeed before we attempt the upload.
      doc.save(filename);

      // 2. Upload the same bytes as the latest stored copy.
      const blob = new Blob([doc.output('blob')], { type: 'application/pdf' });
      const fd = new FormData();
      fd.append('file', blob, filename);
      fd.append('environment', row.environment);
      fd.append('filename', filename);

      try {
        await saveSnapshot(row.releaseId, fd);
        showToast('Regression report created and downloaded', 'success');
        await refreshSnapshots();
      } catch {
        showToast(
          'Report downloaded, but saving the copy failed — try again',
          'warning',
        );
      }
    } catch (e) {
      console.error(e);
      showToast('Creating the regression report failed', 'error');
    } finally {
      clearRowBusy(key);
    }
  }

  // ── Export Excel: client-side xlsx, never stored or audited ────────────────

  /**
   * Exports the latest saved data for the row as an import-compatible Excel
   * workbook. Creates no stored copy, audit event, or table change.
   *
   * @param {{ releaseId: string, releaseName: string, environment: string }} row
   * @see {@link app/(app)/reports/__tests__/ReportsClient.test.jsx}
   */
  async function onExportExcel(row) {
    const key = rowKey(row.releaseId, row.environment);
    setRowBusy(key, 'excel');
    try {
      const cases = await apiExportData({
        releaseId: row.releaseId,
        environment: row.environment,
      });
      if (!cases?.length) {
        showToast(
          'No test cases to report on for this release and environment',
          'info',
        );
        return;
      }

      const { utils, writeFile } = await import('xlsx');
      const workbookData = buildExcelExportData(cases, {
        releaseName: row.releaseName ?? '',
        environment: row.environment,
      });

      const wb = utils.book_new();
      const wsSummary = utils.aoa_to_sheet(workbookData.summaryRows);
      wsSummary['!cols'] = workbookData.summaryCols;
      wsSummary['!merges'] = workbookData.summaryMerges;
      utils.book_append_sheet(wb, wsSummary, 'Summary');

      const wsData = utils.json_to_sheet(workbookData.dataRows);
      wsData['!cols'] = workbookData.dataCols;
      utils.book_append_sheet(wb, wsData, 'Test Cases');
      for (const sheet of workbookData.applicationSheets) {
        const wsApp = utils.json_to_sheet(sheet.rows);
        wsApp['!cols'] = workbookData.dataCols;
        utils.book_append_sheet(wb, wsApp, sheet.name);
      }

      const safeName = (row.releaseName ?? 'export').replace(/\s+/g, '-');
      writeFile(
        wb,
        `regression-report-${safeName}-${row.environment}-${dateStamp()}.xlsx`,
      );
      showToast('Excel report exported', 'success');
    } catch (e) {
      console.error(e);
      showToast('Export failed', 'error');
    } finally {
      clearRowBusy(key);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Stack spacing={3}>
      <PageHeader
        title='Reports'
        sub='Generate PDF signoff reports and Excel exports, or run the environment health analysis.'
      />
      <EnvHealthReport />
      <Divider />

      <Alert severity='info'>
        <AlertTitle>How reports work</AlertTitle>
        Pick a release and environment below and select{' '}
        <strong>Create report</strong>: we build a fresh PDF from the latest
        results, download it to you right away, and keep a copy here — so you or
        a teammate can re-download the exact same file later with{' '}
        <strong>Download copy</strong>, without rebuilding it. Creating again
        replaces the kept copy. Prefer the raw data?{' '}
        <strong>Export Excel</strong> gives you an editable, import-ready
        spreadsheet that is not saved here.
      </Alert>

      {groups.length === 0 ? (
        <Panel title='Regression reports'>
          <Stack sx={{ p: 3 }}>
            <EmptyState
              icon={
                <DescriptionOutlinedIcon
                  sx={{ fontSize: 48, color: 'text.disabled' }}
                />
              }
              title='No releases yet'
            >
              <Typography variant='pageSub' color='text.disabled'>
                Create a release to start generating regression reports.
              </Typography>
              {canManageReleases ? (
                <Button component='a' href='/releases' variant='contained'>
                  Go to releases
                </Button>
              ) : null}
            </EmptyState>
          </Stack>
        </Panel>
      ) : (
        groups.map((group) => (
          <Panel
            key={group.releaseId}
            title={group.releaseName}
            headerActions={
              group.generatable ? null : (
                <Chip label='Archived' size='small' variant='outlined' />
              )
            }
          >
            <Grid container spacing={2} sx={{ p: 3 }}>
              {group.rows.map((row) => (
                <Grid
                  key={rowKey(row.releaseId, row.environment)}
                  size={{ xs: 12, sm: 6, md: 4 }}
                >
                  <ReportCard
                    row={row}
                    busy={busy[rowKey(row.releaseId, row.environment)]}
                    onCreate={onCreateReport}
                    onExcel={onExportExcel}
                  />
                </Grid>
              ))}
            </Grid>
          </Panel>
        ))
      )}
    </Stack>
  );
}
