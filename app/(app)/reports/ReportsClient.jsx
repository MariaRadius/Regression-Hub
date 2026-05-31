'use client';

import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import HistoryIcon from '@mui/icons-material/History';
import SearchIcon from '@mui/icons-material/Search';
import SettingsBackupRestoreIcon from '@mui/icons-material/SettingsBackupRestore';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import {
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import ConfirmDialog from '@/components/ConfirmDialog';
import EmptyState from '@/components/EmptyState';
import PageHeader from '@/components/PageHeader';
import Panel from '@/components/Panel';
import PassRateBar from '@/components/PassRateBar';
import ToastProvider, { showToast } from '@/components/Toast';
import { exportData as apiExportData } from '@/lib/api/exportData';
import { putSettings } from '@/lib/api/settings';
import {
  completeVersion as apiCompleteVersion,
  deleteVersion as apiDeleteVersion,
  restoreVersion as apiRestoreVersion,
  getVersionHistoryDetail,
  listVersions,
} from '@/lib/api/versions';
import { STATUS } from '@/lib/constants';
import { dateStamp, normalizedStatus } from '@/utils/formatters';
import { generateSignoffReport } from '@/utils/pdf/generateSignoffReport';

// Teal palette aliases — matches primary.main (#0d9488) at various opacities
const TEAL = '#0d9488';
const teal07 = alpha(TEAL, 0.07);
const teal35 = alpha(TEAL, 0.35);
const teal10 = alpha(TEAL, 0.1);
const teal30 = alpha(TEAL, 0.3);
const teal05 = alpha(TEAL, 0.05);
const teal15 = alpha(TEAL, 0.15);

export default function ReportsClient({
  initialVersions,
  initialSettings,
  initialApplications,
  initialApplicationId,
}) {
  const router = useRouter();
  const [versions, setVersions] = useState(initialVersions);
  const [selectedApp, setSelectedApp] = useState(initialApplicationId);
  const [selectedVersion, setSelectedVersion] = useState('');
  const [environment, setEnvironment] = useState(
    initialSettings.testEnvironment,
  );
  const [version, setVersion] = useState(initialSettings.softwareVersion);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [generatingVersion, setGeneratingVersion] = useState('');
  const [deletingVersion, setDeletingVersion] = useState('');
  const [restoringVersion, setRestoringVersion] = useState('');
  const [confirmRestore, setConfirmRestore] = useState(null); // { version } pending confirmation
  const [confirmComplete, setConfirmComplete] = useState(null); // version string
  const [completingVersion, setCompletingVersion] = useState('');
  const [versionFilter, setVersionFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [viewModal, setViewModal] = useState(null); // { version, summary, byModule, byTester }
  const [viewLoading, setViewLoading] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null); // { ver, isCurrent, msg }

  useEffect(() => {
    setVersions(initialVersions);
  }, [initialVersions]);

  // Sync settings fields if server re-fetches updated values after a mutation
  useEffect(() => {
    setEnvironment(initialSettings.testEnvironment);
    setVersion(initialSettings.softwareVersion);
  }, [initialSettings.testEnvironment, initialSettings.softwareVersion]);

  const fetchVersions = useCallback(() => {
    listVersions({ silentFailure: true }).then((v) => {
      if (v) setVersions(v);
    });
  }, []);

  // Re-fetch versions when the user tabs back in (handles concurrent changes from other users)
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === 'visible') fetchVersions();
    }
    document.addEventListener('visibilitychange', handleVisibility);
    return () =>
      document.removeEventListener('visibilitychange', handleVisibility);
  }, [fetchVersions]);

  function handleAppChange(id) {
    setSelectedApp(id);
    const params = new URLSearchParams(id ? { applicationId: id } : {});
    router.push(`/reports${params.size ? `?${params}` : ''}`);
  }

  function deleteVersion(ver, isCurrent) {
    const msg = isCurrent
      ? `Delete ALL test cases for active version "${ver}"?\n\nThis permanently removes them and cannot be undone.`
      : `Remove the historical snapshot for version "${ver}"?\n\nThis removes the saved history entry but leaves the current test cases untouched.`;
    setConfirmDelete({ ver, isCurrent, msg });
  }

  async function doDelete({ ver, isCurrent }) {
    setConfirmDelete(null);
    setDeletingVersion(ver);
    try {
      const data = await apiDeleteVersion({ version: ver, isCurrent });
      if (selectedVersion === ver) setSelectedVersion('');
      showToast(
        isCurrent
          ? `Deleted ${data.deleted} test cases for v${ver}`
          : `Removed history snapshot for v${ver} from ${data.deleted} test case(s)`,
        'success',
      );
      router.refresh();
    } catch (e) {
      showToast(e.message || 'Delete failed', 'error');
    } finally {
      setDeletingVersion('');
    }
  }

  async function viewVersion(ver) {
    setViewLoading(ver);
    try {
      const data = await getVersionHistoryDetail(ver);
      setViewModal(data);
    } catch (e) {
      showToast(e.message || 'Failed to load version detail', 'error');
    } finally {
      setViewLoading('');
    }
  }

  function restoreVersion(ver) {
    setConfirmRestore({ version: ver });
  }

  async function doRestore({ version: ver }) {
    setConfirmRestore(null);
    setRestoringVersion(ver);
    try {
      // Restore from history[] snapshot
      const data = await apiRestoreVersion(ver);
      showToast(`Restored ${data.restored} test cases to v${ver}`, 'success');
      // Sync the active version across the UI immediately
      setVersion(ver);
      router.refresh();
    } catch (e) {
      showToast(e.message || 'Restore failed', 'error');
    } finally {
      setRestoringVersion('');
    }
  }

  async function markComplete(ver) {
    setConfirmComplete(null);
    setCompletingVersion(ver);
    try {
      const data = await apiCompleteVersion(ver);
      showToast(
        `v${ver} marked as completed — ${data.snapshotted} test cases snapshotted`,
        'success',
      );
      router.refresh();
    } catch (e) {
      showToast(e.message || 'Failed to complete version', 'error');
    } finally {
      setCompletingVersion('');
    }
  }

  async function exportExcel(overrideVersion) {
    try {
      const params = new URLSearchParams();
      if (selectedApp) params.set('applicationId', selectedApp);
      const ver = overrideVersion ?? selectedVersion;
      if (ver) params.set('softwareVersion', ver);
      const cases = await apiExportData(Object.fromEntries(params));
      if (!cases?.length) {
        showToast('No test cases to export', 'info');
        return;
      }

      const { utils, writeFile } = await import('xlsx');
      const rows = cases.map((tc) => ({
        'Platform/Application': tc.applicationName,
        Module: tc.moduleName,
        Type: tc.type,
        Traceability: tc.traceability,
        'Test Case ID': tc.testCaseId,
        'Test Case': tc.testCase,
        Preconditions: tc.preconditions,
        Steps: tc.steps,
        'Expected Result': tc.expectedResult,
        Status: normalizedStatus(tc.status),
        Notes: tc.notes,
        'Tested By': tc.testedBy,
        'Tested On': tc.testedOn,
        'Software Version Tested': tc.softwareVersionTested,
      }));

      // Summary sheet
      const summaryRows = [
        ['Metric', 'Value'],
        [
          'Application',
          selectedApp
            ? initialApplications.find((a) => a._id === selectedApp)?.name
            : 'All',
        ],
        ['Environment', environment],
        ['Version', version || 'Not specified'],
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
        22, 18, 12, 14, 14, 24, 18, 18, 24, 10, 30, 12, 14, 18,
      ].map((wch) => ({ wch }));
      utils.book_append_sheet(wb, wsData, 'Test Cases');

      writeFile(wb, `regression-report-${dateStamp()}.xlsx`);
      showToast('Excel report exported', 'success');
    } catch (e) {
      console.error(e);
      showToast('Export failed', 'error');
    }
  }

  async function exportPdf(overrideVersion) {
    const isVersionExport = overrideVersion !== undefined;
    if (isVersionExport) setGeneratingVersion(overrideVersion);
    else setGeneratingPdf(true);
    try {
      const params = new URLSearchParams();
      if (selectedApp) params.set('applicationId', selectedApp);
      const ver = overrideVersion ?? selectedVersion;
      if (ver) params.set('softwareVersion', ver);
      const cases = await apiExportData(Object.fromEntries(params));
      if (!cases.length) {
        showToast('No test cases to export', 'info');
        if (isVersionExport) setGeneratingVersion('');
        else setGeneratingPdf(false);
        return;
      }

      const appName = selectedApp
        ? initialApplications.find((a) => a._id === selectedApp)?.name
        : 'All Applications';

      const doc = await generateSignoffReport({
        cases,
        appName,
        environment,
        version,
      });
      doc.save(`regression-signoff-${dateStamp()}.pdf`);
      showToast('PDF exported', 'success');
    } catch (e) {
      console.error(e);
      showToast('PDF export failed', 'error');
    } finally {
      setGeneratingPdf(false);
      setGeneratingVersion('');
    }
  }

  const filteredVersions = useMemo(
    () =>
      versions.filter((v) => {
        if (
          versionFilter &&
          !v.version.toLowerCase().includes(versionFilter.toLowerCase())
        )
          return false;
        if (statusFilter === 'active' && !v.isCurrent) return false;
        if (statusFilter === 'completed' && v.isCurrent) return false;
        return true;
      }),
    [versions, versionFilter, statusFilter],
  );

  return (
    <>
      {/* Always-mounted aria-live region — outside Stack so PageHeader is Stack's first child */}
      <Typography
        component='span'
        aria-live='polite'
        aria-atomic='true'
        sx={{
          position: 'absolute',
          width: 1,
          height: 1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
          whiteSpace: 'nowrap',
        }}
      >
        {selectedVersion
          ? `Version ${selectedVersion} selected for export`
          : ''}
      </Typography>
      <Stack spacing={3}>
        <ToastProvider />

        <PageHeader
          eyebrow='Exports'
          title='Reports'
          sub='Generate PDF signoff reports and Excel exports'
        />

        {/* Version History — always rendered to prevent CLS when empty */}
        <Panel
          title='Version History'
          headerActions={
            versions.length > 0 ? (
              <Stack
                direction='row'
                spacing={1}
                sx={{ alignItems: 'center', flexWrap: 'wrap' }}
              >
                <TextField
                  size='small'
                  value={versionFilter}
                  onChange={(e) => setVersionFilter(e.target.value)}
                  label='Version'
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position='start'>
                          <SearchIcon color='disabled' aria-hidden='true' />
                        </InputAdornment>
                      ),
                    },
                  }}
                  sx={{ width: 160 }}
                />
                <TextField
                  select
                  size='small'
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  slotProps={{
                    inputLabel: { shrink: true },
                    select: { displayEmpty: true },
                  }}
                  label='Status'
                  sx={{ width: 160 }}
                >
                  <MenuItem value=''>All statuses</MenuItem>
                  <MenuItem value='active'>Active only</MenuItem>
                  <MenuItem value='completed'>Completed only</MenuItem>
                </TextField>
                <Typography
                  id='version-table-hint'
                  variant='tableCell'
                  color='text.disabled'
                >
                  Select a row to scope the export below
                </Typography>
              </Stack>
            ) : null
          }
        >
          {versions.length === 0 ? (
            <EmptyState
              icon={
                <HistoryIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
              }
              title='No version history yet'
            >
              <Typography variant='body2' color='text.disabled'>
                Export a report below to create your first version snapshot.
              </Typography>
            </EmptyState>
          ) : (
            <>
              <TableContainer>
                <Table
                  size='small'
                  stickyHeader
                  aria-label='Version history'
                  aria-describedby='version-table-hint'
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
                      <TableCell>Version</TableCell>
                      <TableCell align='center'>Total</TableCell>
                      <TableCell align='center'>Pass</TableCell>
                      <TableCell align='center'>Fail</TableCell>
                      <TableCell align='center'>Pending</TableCell>
                      <TableCell align='center'>Pass Rate</TableCell>
                      <TableCell align='right'>Last Updated</TableCell>
                      <TableCell align='center'>Export</TableCell>
                      <TableCell align='center' sx={{ width: 72 }}>
                        Actions
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredVersions.map((v) => {
                      const isSelected = selectedVersion === v.version;
                      return (
                        <TableRow
                          key={v.version}
                          hover
                          tabIndex={0}
                          aria-selected={isSelected}
                          onClick={() =>
                            setSelectedVersion(isSelected ? '' : v.version)
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setSelectedVersion(isSelected ? '' : v.version);
                            }
                          }}
                          sx={{
                            cursor: 'pointer',
                            bgcolor: isSelected ? teal07 : undefined,
                            outline: isSelected
                              ? `2px solid ${teal35}`
                              : undefined,
                            '&:focus-visible': {
                              outline: '2px solid',
                              outlineColor: 'primary.main',
                              outlineOffset: -2,
                            },
                          }}
                        >
                          {/* Version label */}
                          <TableCell>
                            <Stack
                              direction='row'
                              spacing={1}
                              sx={{ alignItems: 'center' }}
                            >
                              {isSelected && (
                                <FiberManualRecordIcon
                                  sx={{ color: 'primary.main', fontSize: 10 }}
                                  aria-hidden='true'
                                />
                              )}
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
                                v{v.version}
                              </Typography>
                              {v.isCurrent ? (
                                <Chip
                                  label='ACTIVE'
                                  size='small'
                                  color='success'
                                  variant='outlined'
                                />
                              ) : (
                                <Chip
                                  label='completed'
                                  size='small'
                                  variant='outlined'
                                  sx={{
                                    color: 'text.disabled',
                                    borderColor: 'divider',
                                  }}
                                />
                              )}
                            </Stack>
                          </TableCell>

                          {/* Numeric stats */}
                          <TableCell align='center'>
                            <Typography variant='tableCell'>
                              {v.total}
                            </Typography>
                          </TableCell>
                          <TableCell align='center'>
                            <Typography
                              variant='tableCell'
                              sx={{ color: 'success.main' }}
                            >
                              {v.passed}
                            </Typography>
                          </TableCell>
                          <TableCell align='center'>
                            <Typography
                              variant='tableCell'
                              sx={{
                                color:
                                  v.failed > 0 ? 'error.main' : 'text.disabled',
                              }}
                            >
                              {v.failed}
                            </Typography>
                          </TableCell>
                          <TableCell align='center'>
                            <Typography
                              variant='tableCell'
                              sx={{ color: 'warning.main' }}
                            >
                              {v.pending}
                            </Typography>
                          </TableCell>

                          {/* Pass rate bar */}
                          <TableCell align='center'>
                            <PassRateBar value={v.passRate} maxWidth={60} />
                          </TableCell>

                          {/* Last updated */}
                          <TableCell align='right'>
                            <Typography
                              variant='tableCell'
                              color='text.disabled'
                            >
                              {v.lastUpdated
                                ? new Date(v.lastUpdated).toLocaleDateString()
                                : '—'}
                            </Typography>
                          </TableCell>

                          {/* Export buttons */}
                          <TableCell
                            align='center'
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Stack
                              direction='row'
                              spacing={0.625}
                              sx={{
                                justifyContent: 'center',
                                flexWrap: 'wrap',
                              }}
                            >
                              {!v.isCurrent && (
                                <Button
                                  variant='outlined'
                                  size='small'
                                  startIcon={
                                    viewLoading === v.version ? null : (
                                      <VisibilityOutlinedIcon />
                                    )
                                  }
                                  onClick={() => viewVersion(v.version)}
                                  disabled={viewLoading === v.version}
                                  aria-label={
                                    viewLoading === v.version
                                      ? `Loading v${v.version}`
                                      : `View v${v.version}`
                                  }
                                  aria-busy={viewLoading === v.version}
                                  sx={{ minWidth: 0 }}
                                >
                                  {viewLoading === v.version
                                    ? 'Loading…'
                                    : 'View'}
                                </Button>
                              )}
                              <Button
                                variant='outlined'
                                size='small'
                                onClick={() => exportExcel(v.version)}
                                sx={{ minWidth: 0 }}
                              >
                                Excel
                              </Button>
                              <Button
                                variant='contained'
                                size='small'
                                onClick={() => exportPdf(v.version)}
                                disabled={generatingVersion === v.version}
                                aria-label={
                                  generatingVersion === v.version
                                    ? `Generating PDF for v${v.version}`
                                    : `Export PDF for v${v.version}`
                                }
                                aria-busy={generatingVersion === v.version}
                                sx={{ minWidth: 0 }}
                              >
                                {generatingVersion === v.version
                                  ? 'Generating…'
                                  : 'PDF'}
                              </Button>
                            </Stack>
                          </TableCell>

                          {/* Row actions */}
                          <TableCell
                            align='center'
                            onClick={(e) => e.stopPropagation()}
                            sx={{ whiteSpace: 'nowrap' }}
                          >
                            {v.isCurrent && (
                              <Tooltip
                                title={`Mark v${v.version} as completed`}
                              >
                                <span>
                                  <IconButton
                                    size='small'
                                    aria-label={`Mark v${v.version} as completed`}
                                    onClick={() =>
                                      setConfirmComplete(v.version)
                                    }
                                    disabled={completingVersion === v.version}
                                    color='success'
                                    sx={{
                                      opacity:
                                        completingVersion === v.version
                                          ? 0.4
                                          : 0.75,
                                      '&:hover': { opacity: 1 },
                                    }}
                                  >
                                    <CheckCircleOutlinedIcon />
                                  </IconButton>
                                </span>
                              </Tooltip>
                            )}
                            {!v.isCurrent && (
                              <Tooltip
                                title={`Restore test cases to saved state from v${v.version}`}
                              >
                                <span>
                                  <IconButton
                                    size='small'
                                    aria-label={`Restore test cases to v${v.version}`}
                                    onClick={() => restoreVersion(v.version)}
                                    disabled={restoringVersion === v.version}
                                    color='primary'
                                    sx={{
                                      opacity:
                                        restoringVersion === v.version
                                          ? 0.4
                                          : 0.75,
                                      '&:hover': { opacity: 1 },
                                    }}
                                  >
                                    <HistoryIcon fontSize='small' />
                                  </IconButton>
                                </span>
                              </Tooltip>
                            )}
                            <Tooltip
                              title={
                                v.isCurrent
                                  ? `Delete all test cases for v${v.version}`
                                  : `Remove history snapshot for v${v.version}`
                              }
                            >
                              <span>
                                <IconButton
                                  size='small'
                                  aria-label={
                                    v.isCurrent
                                      ? `Delete all test cases for v${v.version}`
                                      : `Remove history snapshot for v${v.version}`
                                  }
                                  onClick={() =>
                                    deleteVersion(v.version, v.isCurrent)
                                  }
                                  disabled={deletingVersion === v.version}
                                  color='error'
                                  sx={{
                                    opacity:
                                      deletingVersion === v.version ? 0.4 : 0.7,
                                    '&:hover': { opacity: 1 },
                                  }}
                                >
                                  <DeleteOutlinedIcon fontSize='small' />
                                </IconButton>
                              </span>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>

              {/* Selected version banner */}
              {selectedVersion && (
                <Stack
                  direction='row'
                  spacing={1.25}
                  sx={{
                    alignItems: 'center',
                    px: 2.5,
                    py: 1.25,
                    bgcolor: teal05,
                    borderTop: `1px solid ${teal15}`,
                  }}
                >
                  <Stack
                    direction='row'
                    spacing={0.75}
                    sx={{ alignItems: 'center' }}
                  >
                    <FiberManualRecordIcon
                      sx={{ color: 'primary.main', fontSize: 10 }}
                      aria-hidden='true'
                    />
                    <Typography
                      variant='tableCell'
                      component='span'
                      sx={{ color: 'primary.main' }}
                    >
                      Selected: v{selectedVersion}
                    </Typography>
                  </Stack>
                  <Typography
                    variant='tableCell'
                    component='span'
                    color='text.disabled'
                  >
                    — custom export below will use this version
                  </Typography>
                  <Button
                    variant='text'
                    size='small'
                    onClick={() => setSelectedVersion('')}
                    aria-label='Clear selected version'
                    sx={{ ml: 'auto !important', color: 'text.disabled' }}
                  >
                    Clear ×
                  </Button>
                </Stack>
              )}
            </>
          )}
        </Panel>

        {/* Custom Export */}
        <Panel
          title={
            <>
              Custom Export{' '}
              {selectedVersion && (
                <Typography component='span' sx={{ color: 'primary.main' }}>
                  — scoped to v{selectedVersion}
                </Typography>
              )}
            </>
          }
        >
          <Stack spacing={1.75} sx={{ p: 2.5 }}>
            <Stack direction='row' spacing={1.75} sx={{ flexWrap: 'wrap' }}>
              <TextField
                select
                label='Application / Scope'
                value={selectedApp}
                onChange={(e) => handleAppChange(e.target.value)}
                sx={{ minWidth: 180, flex: 1 }}
                slotProps={{
                  inputLabel: { shrink: true },
                  input: { notched: true },
                  select: { displayEmpty: true },
                }}
              >
                <MenuItem value=''>All Applications</MenuItem>
                {initialApplications.map((a) => (
                  <MenuItem key={a._id} value={a._id}>
                    {a.name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label='Test Environment'
                value={environment}
                onChange={(e) => setEnvironment(e.target.value)}
                onBlur={() =>
                  putSettings(
                    { testEnvironment: environment, softwareVersion: version },
                    { silentFailure: true },
                  )
                }
                placeholder='e.g. QA, Staging…'
                sx={{ minWidth: 180, flex: 1 }}
              />
              <TextField
                label='Software Version (for PDF header)'
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                onBlur={() =>
                  putSettings(
                    { testEnvironment: environment, softwareVersion: version },
                    { silentFailure: true },
                  )
                }
                placeholder='e.g. 2.4.1…'
                sx={{ minWidth: 180, flex: 1 }}
              />
            </Stack>
            <Stack direction='row' spacing={1.25}>
              <Button variant='outlined' onClick={() => exportExcel()}>
                Export Excel
              </Button>
              <Button
                variant='contained'
                onClick={() => exportPdf()}
                disabled={generatingPdf}
              >
                {generatingPdf ? 'Generating…' : 'Export PDF Signoff'}
              </Button>
            </Stack>
          </Stack>
        </Panel>

        {/* ── Dialogs ─────────────────────────────────────────────────────── */}

        {/* Delete Confirmation */}
        <ConfirmDialog
          open={!!confirmDelete}
          title='Delete Version?'
          confirmLabel='Delete'
          confirmColor='error'
          onConfirm={() => doDelete(confirmDelete)}
          onClose={() => setConfirmDelete(null)}
        >
          <Typography variant='tableCell' sx={{ whiteSpace: 'pre-line' }}>
            {confirmDelete?.msg}
          </Typography>
        </ConfirmDialog>

        {/* Restore Confirmation */}
        <Dialog
          open={!!confirmRestore}
          onClose={() => setConfirmRestore(null)}
          maxWidth='xs'
          fullWidth
        >
          <DialogTitle>Restore to v{confirmRestore?.version}?</DialogTitle>
          <DialogContent>
            <Stack spacing={1.25}>
              <Typography variant='tableCell'>
                All current test case results will be{' '}
                <strong>
                  reset to their saved state from v{confirmRestore?.version}
                </strong>
                .
              </Typography>
              <Typography variant='tableCell'>
                Your current state is automatically saved as a history entry —
                you can always restore back to it.
              </Typography>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button variant='outlined' onClick={() => setConfirmRestore(null)}>
              Cancel
            </Button>
            <Button
              variant='contained'
              onClick={() => doRestore(confirmRestore)}
            >
              Yes, Restore
            </Button>
          </DialogActions>
        </Dialog>

        {/* Mark Complete Confirmation */}
        <ConfirmDialog
          open={!!confirmComplete}
          title={`Mark v${confirmComplete} as Completed?`}
          confirmLabel='Yes, Mark Complete'
          confirmColor='success'
          onConfirm={() => markComplete(confirmComplete)}
          onClose={() => setConfirmComplete(null)}
        >
          <Typography variant='tableCell'>
            This saves a snapshot of all test case results for v
            {confirmComplete} and marks the testing cycle as{' '}
            <strong>done</strong>. The version will appear as{' '}
            <strong>completed</strong> in history and can be viewed or restored
            anytime.
          </Typography>
        </ConfirmDialog>

        {/* Version History Detail */}
        <Dialog
          open={!!viewModal}
          onClose={() => setViewModal(null)}
          maxWidth='md'
          fullWidth
          slotProps={{ paper: { sx: { maxHeight: '88vh' } } }}
        >
          <DialogTitle>
            <Stack direction='row' spacing={1.5} sx={{ alignItems: 'center' }}>
              <Typography
                variant='mono'
                component='span'
                sx={{
                  bgcolor: teal10,
                  border: `1px solid ${teal30}`,
                  borderRadius: 0.75,
                  px: 1.5,
                  py: 0.375,
                  color: 'success.dark',
                }}
              >
                v{viewModal?.version}
              </Typography>
              <Chip
                label='Historical Snapshot'
                size='small'
                sx={{ bgcolor: 'grey.100', color: 'text.secondary' }}
              />
            </Stack>
          </DialogTitle>

          <DialogContent dividers>
            {/* Summary stats */}
            <Grid container spacing={1.25} sx={{ mb: 3 }}>
              {[
                {
                  label: 'Total',
                  value: viewModal?.summary.total,
                  color: 'text.primary',
                },
                {
                  label: 'Passed',
                  value: viewModal?.summary.passed,
                  color: 'success.dark',
                },
                {
                  label: 'Failed',
                  value: viewModal?.summary.failed,
                  color: 'error.main',
                },
                {
                  label: 'Pending',
                  value: viewModal?.summary.pending,
                  color: 'warning.main',
                },
                {
                  label: 'Pass Rate',
                  value: `${viewModal?.summary.passRate}%`,
                  color:
                    (viewModal?.summary.passRate ?? 0) >= 80
                      ? 'success.dark'
                      : 'warning.main',
                },
              ].map(({ label, value, color }) => (
                <Grid key={label} size='grow'>
                  <Stack
                    spacing={0.5}
                    sx={{
                      bgcolor: 'background.default',
                      p: '12px 16px',
                      textAlign: 'center',
                      border: 1,
                      borderColor: 'divider',
                      borderRadius: 1,
                    }}
                  >
                    <Typography variant='metricLabel' color='text.disabled'>
                      {label}
                    </Typography>
                    <Typography
                      variant='panelTitle'
                      component='p'
                      sx={{ color }}
                    >
                      {value}
                    </Typography>
                  </Stack>
                </Grid>
              ))}
            </Grid>

            {/* Module breakdown */}
            {viewModal?.byModule.length > 0 && (
              <Stack spacing={1.25} sx={{ mb: 2.75 }}>
                <Typography variant='panelTitle' component='h3'>
                  Module Breakdown
                </Typography>
                <TableContainer>
                  <Table size='small'>
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
                        <TableCell>Module</TableCell>
                        <TableCell align='center'>Total</TableCell>
                        <TableCell
                          align='center'
                          sx={{ color: 'success.dark' }}
                        >
                          Pass
                        </TableCell>
                        <TableCell align='center' sx={{ color: 'error.main' }}>
                          Fail
                        </TableCell>
                        <TableCell
                          align='center'
                          sx={{ color: 'warning.main' }}
                        >
                          Pending
                        </TableCell>
                        <TableCell align='center'>Pass Rate</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {viewModal.byModule.map((m) => (
                        <TableRow key={m.module}>
                          <TableCell>
                            <Typography variant='tableCell'>
                              {m.module}
                            </Typography>
                          </TableCell>
                          <TableCell align='center'>
                            <Typography variant='tableCell'>
                              {m.total}
                            </Typography>
                          </TableCell>
                          <TableCell
                            align='center'
                            sx={{ color: 'success.dark' }}
                          >
                            <Typography variant='tableCell'>
                              {m.passed}
                            </Typography>
                          </TableCell>
                          <TableCell
                            align='center'
                            sx={{
                              color:
                                m.failed > 0 ? 'error.main' : 'text.disabled',
                            }}
                          >
                            <Typography variant='tableCell'>
                              {m.failed}
                            </Typography>
                          </TableCell>
                          <TableCell
                            align='center'
                            sx={{
                              color:
                                m.pending > 0
                                  ? 'warning.main'
                                  : 'text.disabled',
                            }}
                          >
                            <Typography variant='tableCell'>
                              {m.pending}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <PassRateBar
                              value={m.passRate}
                              label={`${m.module} pass rate: ${m.passRate}%`}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Stack>
            )}

            {/* Tester breakdown */}
            {viewModal?.byTester.length > 0 && (
              <Stack spacing={1.25} sx={{ mb: 2.75 }}>
                <Typography variant='panelTitle' component='h3'>
                  Tester Breakdown
                </Typography>
                <Stack direction='row' spacing={1} sx={{ flexWrap: 'wrap' }}>
                  {viewModal.byTester.map((t) => (
                    <Stack
                      key={t.tester}
                      spacing={0.75}
                      sx={{
                        bgcolor: 'background.default',
                        border: 1,
                        borderColor: 'divider',
                        borderRadius: 1,
                        p: '10px 16px',
                        minWidth: 140,
                      }}
                    >
                      <Typography variant='tableCell' fontWeight={600}>
                        {t.tester}
                      </Typography>
                      <Stack direction='row' spacing={1}>
                        <Typography
                          variant='tableCell'
                          component='span'
                          sx={{ color: 'success.dark' }}
                        >
                          {t.passed} pass
                        </Typography>
                        <Typography
                          variant='tableCell'
                          component='span'
                          sx={{ color: 'error.main' }}
                        >
                          {t.failed} fail
                        </Typography>
                        <Typography
                          variant='tableCell'
                          component='span'
                          sx={{ color: 'warning.main' }}
                        >
                          {t.pending} pending
                        </Typography>
                      </Stack>
                    </Stack>
                  ))}
                </Stack>
              </Stack>
            )}

            {viewModal?.summary.total === 0 && (
              <EmptyState
                icon={
                  <HistoryIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
                }
                title='No snapshot data for this version'
              >
                <Typography variant='body2' color='text.disabled'>
                  Re-import a newer version to generate history.
                </Typography>
              </EmptyState>
            )}
          </DialogContent>

          <DialogActions>
            <Button
              variant='outlined'
              onClick={() => exportExcel(viewModal?.version)}
            >
              Export Excel
            </Button>
            <Button
              variant='outlined'
              onClick={() => exportPdf(viewModal?.version)}
            >
              Export PDF
            </Button>
            <Button
              variant='contained'
              startIcon={<SettingsBackupRestoreIcon />}
              onClick={() => {
                setViewModal(null);
                setConfirmRestore({ version: viewModal.version });
              }}
              disabled={restoringVersion === viewModal?.version}
            >
              Restore to This Version
            </Button>
          </DialogActions>
        </Dialog>
      </Stack>
    </>
  );
}
