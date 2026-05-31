'use client';

import CloseIcon from '@mui/icons-material/Close';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DescriptionIcon from '@mui/icons-material/Description';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useCallback, useRef, useState } from 'react';
import { importExcel } from '@/lib/api/importExcel';
import { putSettings } from '@/lib/api/settings';

// Canonical MIME for .xlsx. `application/zip` is also valid (xlsx is a zip archive).
// `application/octet-stream` and empty string are ambiguous (some platforms don't
// register the MIME) — fall back to extension check for those cases only.
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

/** @see {@link __tests__/UploadExcel.test.jsx} */
export default function UploadExcel({
  onImported,
  initialEnv = '',
  initialVersion = '',
}) {
  const [dragging, setDragging] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [env, setEnv] = useState(initialEnv);
  const [version, setVersion] = useState(initialVersion);
  const fileRef = useRef();
  const saveTimer = useRef(null);

  const saveSettings = useCallback((testEnvironment, softwareVersion) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      putSettings(
        { testEnvironment, softwareVersion },
        { silentFailure: true },
      );
    }, 600);
  }, []);

  function handleEnvChange(e) {
    const val = e.target.value;
    setEnv(val);
    saveSettings(val, version);
  }

  function handleVersionChange(e) {
    const val = e.target.value;
    setVersion(val);
    saveSettings(env, val);
  }

  function stageFile(file) {
    if (!isValidXlsxFile(file)) {
      setStatus({
        type: 'error',
        message: 'Invalid file type. Upload a .xlsx Excel workbook.',
      });
      return;
    }
    setPendingFile(file);
    setStatus(null);
  }

  async function handleImport() {
    if (!pendingFile) return;
    setLoading(true);
    setStatus({ type: 'info', message: `Importing ${pendingFile.name}…` });
    try {
      const form = new FormData();
      form.append('file', pendingFile);
      form.append('testEnvironment', env);
      form.append('softwareVersion', version);
      const data = await importExcel(form);
      setStatus({
        type: 'success',
        message: `Imported ${data.imported} test cases.`,
      });
      setPendingFile(null);
      onImported?.();
    } catch (e) {
      setStatus({ type: 'error', message: e.message });
    } finally {
      setLoading(false);
    }
  }

  function clearFile() {
    setPendingFile(null);
    setStatus(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <Paper variant='outlined' sx={{ p: 2 }}>
      <Paper
        data-testid='upload-dropzone'
        variant='outlined'
        role='button'
        tabIndex={0}
        aria-label='Upload .xlsx file — click or drag and drop'
        onClick={() => !pendingFile && fileRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            if (e.key === ' ') e.preventDefault();
            if (!pendingFile) fileRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
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
          cursor: pendingFile ? 'default' : 'pointer',
          transition: 'border-color 0.2s ease, background-color 0.2s ease',
          bgcolor: pendingFile
            ? 'success.50'
            : dragging
              ? 'action.hover'
              : 'background.paper',
          '&:hover': pendingFile
            ? {}
            : {
                borderColor: 'primary.light',
                bgcolor: 'action.hover',
              },
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
              <CloseIcon fontSize='small' sx={{ color: 'text.secondary' }} />
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

        {loading && (
          <LinearProgress
            sx={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}
          />
        )}
      </Paper>

      <Grid container spacing={1.5} sx={{ mt: 1.5 }}>
        <Grid size={6}>
          <TextField
            size='small'
            fullWidth
            label='Test Environment'
            name='testEnvironment'
            value={env}
            onChange={handleEnvChange}
            placeholder='e.g. QA, Staging, Production'
            slotProps={{
              htmlInput: { autoComplete: 'off', spellCheck: false },
            }}
          />
        </Grid>
        <Grid size={6}>
          <TextField
            size='small'
            fullWidth
            label='Software Version'
            name='softwareVersion'
            value={version}
            onChange={handleVersionChange}
            placeholder='e.g. 2.4.1'
            slotProps={{
              htmlInput: { autoComplete: 'off', spellCheck: false },
            }}
          />
        </Grid>
      </Grid>

      <Stack direction='row' sx={{ justifyContent: 'flex-end', mt: 1.5 }}>
        {pendingFile && (
          <Button
            variant='text'
            size='small'
            onClick={clearFile}
            sx={{ mr: 1 }}
          >
            Clear
          </Button>
        )}
        <Button
          variant='contained'
          size='small'
          startIcon={<FileUploadIcon />}
          loading={loading}
          loadingPosition='start'
          disabled={!pendingFile}
          onClick={handleImport}
        >
          Import
        </Button>
      </Stack>

      <div
        role={status?.type === 'error' ? 'alert' : 'status'}
        aria-live={status?.type === 'error' ? 'assertive' : 'polite'}
        aria-atomic='true'
      >
        {status ? (
          <Alert
            severity={status.type === 'info' ? 'info' : status.type}
            sx={{ mt: 1.5, mb: 0 }}
          >
            {status.message}
          </Alert>
        ) : null}
      </div>
    </Paper>
  );
}
