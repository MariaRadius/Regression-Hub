'use client';

import CloseIcon from '@mui/icons-material/Close';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DescriptionIcon from '@mui/icons-material/Description';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
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

// Canonical MIME for .xlsx. `application/zip` is also valid (xlsx is a zip
// archive). `application/octet-stream` and empty string are ambiguous — fall
// back to the extension check for those only.
const XLSX_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
]);
const AMBIGUOUS_MIMES = new Set(['application/octet-stream', '']);

function isValidXlsxFile(file) {
  if (!file) return false;
  if (AMBIGUOUS_MIMES.has(file.type)) {
    return file.name.toLowerCase().endsWith('.xlsx');
  }
  return XLSX_MIMES.has(file.type);
}

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

/** @see {@link __tests__/ImportCasesClient.test.jsx} */
export default function ImportCasesClient() {
  const { releaseId, releaseName, environments, environment, activeRelease } =
    useReleaseEnv();

  const [pendingFile, setPendingFile] = useState(null);
  const [importEnv, setImportEnv] = useState('');
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState('idle'); // idle | analysing | confirming | committing
  const [analysis, setAnalysis] = useState(null);
  const [overrides, setOverrides] = useState({});
  const [error, setError] = useState(null);
  const fileRef = useRef();

  const isArchived = Boolean(activeRelease?.archived);
  const envList = environments ?? [];
  // Derived during render — no effect needed when the active release changes.
  const selectedEnv = envList.includes(importEnv)
    ? importEnv
    : environment || '';
  const busy = phase === 'analysing' || phase === 'committing';

  function stageFile(file) {
    if (!isValidXlsxFile(file)) {
      setError('Invalid file type. Upload a .xlsx Excel workbook.');
      return;
    }
    setError(null);
    setPendingFile(file);
  }

  function clearFile() {
    setPendingFile(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleAnalyse() {
    if (!pendingFile || !releaseId || isArchived) return;
    setPhase('analysing');
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', pendingFile);
      const result = await importIntoRelease(releaseId, fd);
      setAnalysis(result);
      setOverrides({});
      setPhase('confirming');
    } catch (e) {
      setError(e.message || 'Could not analyse the workbook');
      setPhase('idle');
    }
  }

  async function handleConfirm() {
    if (!pendingFile || !releaseId || !selectedEnv) return;
    setPhase('committing');
    try {
      const fd = new FormData();
      fd.append('file', pendingFile);
      fd.append('confirmed', 'true');
      fd.append('environment', selectedEnv);
      fd.append('appInitialOverrides', JSON.stringify(overrides));
      const result = await importIntoRelease(releaseId, fd);
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
            onChange={(e) => setImportEnv(e.target.value)}
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
              !pendingFile && !isArchived && fileRef.current?.click()
            }
            onKeyDown={(e) => {
              if (isArchived) return;
              if (e.key === 'Enter' || e.key === ' ') {
                if (e.key === ' ') e.preventDefault();
                if (!pendingFile) fileRef.current?.click();
              }
            }}
            onDragOver={(e) => {
              if (isArchived) return;
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              if (isArchived) return;
              e.preventDefault();
              setDragging(false);
              stageFile(e.dataTransfer.files[0]);
            }}
            sx={{
              border: '2px dashed',
              borderColor: pendingFile
                ? 'success.main'
                : dragging
                  ? 'primary.main'
                  : 'divider',
              borderRadius: 2,
              p: 3,
              textAlign: 'center',
              cursor: isArchived
                ? 'not-allowed'
                : pendingFile
                  ? 'default'
                  : 'pointer',
              opacity: isArchived ? 0.6 : 1,
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
                <DescriptionIcon sx={{ color: 'success.main' }} />
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
              disabled={!pendingFile || !selectedEnv || isArchived || busy}
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
