'use client';

import CloseIcon from '@mui/icons-material/Close';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DescriptionIcon from '@mui/icons-material/Description';
import ErrorIcon from '@mui/icons-material/Error';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import { useRef, useState } from 'react';
import ImportConfirmationDialog from '@/components/ImportConfirmationDialog';
import PageHeader from '@/components/PageHeader';
import ToastProvider, { showToast } from '@/components/Toast';
import { useReleaseEnv } from '@/contexts/ReleaseEnvContext';
import { importIntoRelease } from '@/lib/api/releases';
import { validateParsedRows, validatePreParse } from '@/utils/importValidation';
import { slugify } from '@/utils/slugify';

function PageShell({ children }) {
  return (
    <Stack>
      <ToastProvider />
      <PageHeader
        eyebrow='QA Regression Control Center'
        title='Import Test Cases'
        sub='Upload an Excel workbook to create or update test cases for the active release'
      />
      {children}
    </Stack>
  );
}

/**
 * @param {{ roster: Array<{ name: string, username: string }> | null, knownApps: Array<{ name: string, initial: string }> | null }} props
 * @see {@link __tests__/ImportCasesClient.test.jsx}
 */
export default function ImportCasesClient({ roster, knownApps }) {
  const { releaseId, releaseName, environments, environment, activeRelease } =
    useReleaseEnv();
  // Extract teamId from activeRelease if available (used by validatePreParse)
  const teamId = activeRelease?.teamId ?? null;

  const [pendingFile, setPendingFile] = useState(null);
  const [importEnv, setImportEnv] = useState('');
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState('idle'); // idle | analysing | confirming | committing
  const [analysis, setAnalysis] = useState(null);
  const [overrides, setOverrides] = useState({});
  const [error, setError] = useState(null);
  const [validationErrors, setValidationErrors] = useState([]);
  const [clientApps, setClientApps] = useState(null); // apps preview from validateParsedRows
  const [parsedRows, setParsedRows] = useState(null); // normalized rows with fingerprints
  const [rowsValid, setRowsValid] = useState(false); // from validateParsedRows
  const fileRef = useRef();

  const isArchived = Boolean(activeRelease?.archived);
  const envList = environments ?? [];
  // Derived during render — no effect needed when the active release changes.
  const selectedEnv = envList.includes(importEnv)
    ? importEnv
    : environment || '';
  const busy = phase === 'analysing' || phase === 'committing';

  // Load error: roster or knownApps fetch failed (null = failed, [] = empty but ok)
  const loadError = roster === null || knownApps === null;

  async function stageFile(file) {
    if (!file) return;

    setError(null);
    setValidationErrors([]);
    setClientApps(null);
    setParsedRows(null);
    setRowsValid(false);

    // Stage A: pre-parse fail-fast validation
    const preResult = validatePreParse({
      file,
      teamId,
      releaseId,
      environment: selectedEnv,
      isArchived,
      environments: envList,
      overrides,
    });
    if (!preResult.ok) {
      setError(preResult.error);
      return;
    }

    setPendingFile(file);

    // Parse the workbook once (dynamic import — keeps SheetJS code-split)
    let rows;
    try {
      const buffer = await file.arrayBuffer();
      const { parseWorkbookBuffer } = await import('@/utils/excelImport');
      rows = parseWorkbookBuffer(buffer);
    } catch (e) {
      setError(e.message || 'Failed to parse the workbook');
      setPendingFile(null);
      return;
    }

    // Add client-derived fingerprint to every row
    const rowsWithFingerprints = rows.map((row) => ({
      ...row,
      fingerprint: slugify(row.testCase ?? ''),
    }));

    // Stage B: post-parse aggregating validation
    const postResult = validateParsedRows({
      rows: rowsWithFingerprints,
      roster: roster ?? [],
      knownApps: knownApps ?? [],
      overrides,
    });

    setParsedRows(rowsWithFingerprints);
    setRowsValid(postResult.valid);
    setClientApps(postResult.apps);
    if (!postResult.valid) {
      setValidationErrors(postResult.errors);
    }
  }

  function clearFile() {
    setPendingFile(null);
    setError(null);
    setValidationErrors([]);
    setClientApps(null);
    setParsedRows(null);
    setRowsValid(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleAnalyse() {
    if (!parsedRows || !releaseId || isArchived || !rowsValid) return;
    setPhase('analysing');
    setError(null);
    try {
      const result = await importIntoRelease(releaseId, { rows: parsedRows });
      setAnalysis(result);
      setOverrides({});
      setPhase('confirming');
    } catch (e) {
      setError(e.message || 'Could not analyse the workbook');
      setPhase('idle');
    }
  }

  async function handleConfirm() {
    if (!parsedRows || !releaseId || !selectedEnv) return;
    setPhase('committing');
    try {
      const result = await importIntoRelease(releaseId, {
        rows: parsedRows,
        confirmed: true,
        environment: selectedEnv,
        appInitialOverrides:
          Object.keys(overrides).length > 0 ? overrides : undefined,
      });
      showToast(
        `Imported ${result.imported} and updated ${result.updated} test cases into ${releaseName} · ${selectedEnv}.`,
        'success',
      );
      setAnalysis(null);
      clearFile();
      setPhase('idle');
    } catch (e) {
      // Keep the dialog open so the admin can adjust initials and retry.
      showToast(e.message || 'Import failed', 'error');
      setPhase('confirming');
    }
  }

  function closeDialog() {
    if (phase === 'committing') return;
    setAnalysis(null);
    setPhase('idle');
  }

  // ── No release in the working context ──────────────────────────────────────
  if (!releaseId) {
    return (
      <PageShell>
        <Paper variant='outlined' sx={{ p: 6 }}>
          <Stack
            spacing={1.5}
            sx={{ alignItems: 'center', textAlign: 'center' }}
          >
            <FolderOpenIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
            <Typography variant='h6' fontWeight={700}>
              No release selected
            </Typography>
            <Typography variant='body2' color='text.secondary'>
              Pick a release in the bar above, or create one, before importing
              test cases.
            </Typography>
            <Button variant='contained' component={Link} href='/releases'>
              Go to Releases
            </Button>
          </Stack>
        </Paper>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <Paper variant='outlined' sx={{ p: 2 }}>
        {loadError && (
          <Alert
            severity='error'
            icon={<ErrorIcon fontSize='inherit' />}
            sx={{ mb: 2 }}
          >
            Failed to load team data. Reload the page to retry.
          </Alert>
        )}

        {isArchived && (
          <Alert
            severity='warning'
            icon={<LockOutlinedIcon fontSize='inherit' />}
            sx={{ mb: 2 }}
          >
            {releaseName} is archived. Unarchive it to import test cases.
          </Alert>
        )}

        <Stack spacing={2}>
          <TextField
            select
            size='small'
            label='Import environment'
            value={selectedEnv}
            onChange={(e) => {
              setImportEnv(e.target.value);
              // Staged file was validated against the previous environment.
              // Clear it so Stage A re-runs against the new environment on next drop.
              if (pendingFile) clearFile();
            }}
            disabled={isArchived || busy || envList.length === 0}
            helperText='Result columns from the workbook are written to this environment'
            sx={{ maxWidth: 320 }}
          >
            {envList.map((env) => (
              <MenuItem key={env} value={env}>
                {env}
              </MenuItem>
            ))}
          </TextField>

          <Paper
            data-testid='upload-dropzone'
            variant='outlined'
            role='button'
            tabIndex={isArchived ? -1 : 0}
            aria-label='Upload .xlsx file — click or drag and drop'
            onClick={() =>
              !pendingFile &&
              !isArchived &&
              !loadError &&
              fileRef.current?.click()
            }
            onKeyDown={(e) => {
              if (isArchived || loadError) return;
              if (e.key === 'Enter' || e.key === ' ') {
                if (e.key === ' ') e.preventDefault();
                if (!pendingFile) fileRef.current?.click();
              }
            }}
            onDragOver={(e) => {
              if (isArchived || loadError) return;
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              if (isArchived || loadError) return;
              e.preventDefault();
              setDragging(false);
              stageFile(e.dataTransfer.files[0]);
            }}
            sx={{
              border: '2px dashed',
              borderColor: pendingFile
                ? rowsValid
                  ? 'success.main'
                  : 'error.main'
                : dragging
                  ? 'primary.main'
                  : 'divider',
              borderRadius: 2,
              p: 3,
              textAlign: 'center',
              cursor:
                isArchived || loadError
                  ? 'not-allowed'
                  : pendingFile
                    ? 'default'
                    : 'pointer',
              opacity: isArchived || loadError ? 0.6 : 1,
              transition: 'border-color 0.2s ease, background-color 0.2s ease',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <input
              ref={fileRef}
              type='file'
              accept='.xlsx'
              hidden
              aria-label='Upload .xlsx file'
              onChange={(e) => {
                stageFile(e.target.files[0]);
                e.target.value = '';
              }}
            />

            {pendingFile ? (
              <Stack
                direction='row'
                spacing={1}
                sx={{ alignItems: 'center', justifyContent: 'center' }}
              >
                <DescriptionIcon
                  sx={{ color: rowsValid ? 'success.main' : 'error.main' }}
                />
                <Typography variant='subtitle2' fontWeight={600}>
                  {pendingFile.name}
                </Typography>
                <IconButton
                  size='small'
                  aria-label='Clear selected file'
                  onClick={(e) => {
                    e.stopPropagation();
                    clearFile();
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                  sx={{ ml: 0.5 }}
                >
                  <CloseIcon
                    fontSize='small'
                    sx={{ color: 'text.secondary' }}
                  />
                </IconButton>
              </Stack>
            ) : (
              <>
                <CloudUploadIcon
                  sx={{ fontSize: 36, color: 'primary.main', mb: 1 }}
                />
                <Typography variant='subtitle2' fontWeight={600}>
                  Drop .xlsx file or click to upload
                </Typography>
                <Typography
                  variant='caption'
                  color='text.secondary'
                  display='block'
                  sx={{ mt: 0.5 }}
                >
                  Auto-detects headers · Imports all sheets
                </Typography>
              </>
            )}

            {busy && (
              <LinearProgress
                sx={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}
              />
            )}
          </Paper>

          {/* Client apps preview — shown instantly after parse */}
          {clientApps !== null && clientApps.length > 0 && (
            <Stack spacing={1}>
              <Divider />
              <Typography variant='subtitle2' fontWeight={700}>
                Applications in file
              </Typography>
              <Stack direction='row' spacing={1} sx={{ flexWrap: 'wrap' }}>
                {clientApps.map((app) => (
                  <Chip
                    key={app.name}
                    label={
                      app.isNew
                        ? `${app.name} (new · ${app.proposedInitial || '?'})`
                        : app.name
                    }
                    size='small'
                    color={app.isNew ? 'warning' : 'default'}
                    variant='outlined'
                  />
                ))}
              </Stack>
            </Stack>
          )}

          <Stack
            direction='row'
            spacing={1}
            sx={{ justifyContent: 'flex-end' }}
          >
            {pendingFile && (
              <Button
                variant='text'
                size='small'
                onClick={clearFile}
                disabled={busy}
              >
                Clear
              </Button>
            )}
            <Button
              variant='contained'
              size='small'
              startIcon={<FileUploadIcon />}
              loading={phase === 'analysing'}
              loadingPosition='start'
              disabled={
                !pendingFile ||
                !rowsValid ||
                !selectedEnv ||
                isArchived ||
                busy ||
                loadError
              }
              onClick={handleAnalyse}
            >
              Analyse Import
            </Button>
          </Stack>

          {error && (
            <Alert severity='error' role='alert'>
              {error}
            </Alert>
          )}

          {validationErrors.length > 0 && (
            <Alert severity='error' role='alert'>
              <Typography variant='body2' fontWeight={600} sx={{ mb: 0.5 }}>
                Fix the following errors before importing:
              </Typography>
              <Box component='ul' sx={{ m: 0, pl: 2.5 }}>
                {validationErrors.map((e) => (
                  <Typography key={e} component='li' variant='body2'>
                    {e}
                  </Typography>
                ))}
              </Box>
            </Alert>
          )}
        </Stack>
      </Paper>

      <ImportConfirmationDialog
        open={phase === 'confirming' || phase === 'committing'}
        analysis={analysis}
        initialOverrides={overrides}
        onOverrideChange={(appName, value) =>
          setOverrides((prev) => ({ ...prev, [appName]: value }))
        }
        onConfirm={handleConfirm}
        onClose={closeDialog}
        loading={phase === 'committing'}
      />
    </PageShell>
  );
}
