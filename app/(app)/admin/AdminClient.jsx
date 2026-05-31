'use client';

import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import PeopleIcon from '@mui/icons-material/People';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import {
  Button,
  Card,
  CardActions,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import Link from 'next/link';
import { useState } from 'react';
import ConfirmDialog from '@/components/ConfirmDialog';
import PageHeader from '@/components/PageHeader';
import ToastProvider, { showToast } from '@/components/Toast';
import { putSettings } from '@/lib/api/settings';
import { resetTeamTestCases } from '@/lib/api/testCases';
import { CONFIRM_TOKENS } from '@/lib/constants';

const QUICK_ACCESS = [
  {
    href: '/users',
    Icon: PeopleIcon,
    label: 'Team Members',
    description:
      'Manage user accounts, assign roles, and control team access for your organisation.',
    action: 'Manage Users',
  },
  {
    href: '/import-cases',
    Icon: UploadFileIcon,
    label: 'Import Test Cases',
    description:
      'Upload an Excel spreadsheet to bulk-import test cases directly into the database.',
    action: 'Open Importer',
  },
];

/**
 * Admin control panel — quick access to admin sub-pages and the destructive
 * "Clear All Data" action that was previously misplaced on the Test Cases page.
 */
export default function AdminClient() {
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    message: '',
    onConfirm: null,
  });
  const [promptDialog, setPromptDialog] = useState({
    open: false,
    value: '',
    onConfirm: null,
  });

  function clearAll() {
    setConfirmDialog({
      open: true,
      message:
        'Delete ALL test cases, applications, modules, and test runs from the database?',
      onConfirm: () => {
        setConfirmDialog((prev) => ({ ...prev, open: false }));
        setPromptDialog({
          open: true,
          value: '',
          onConfirm: async (typed) => {
            setPromptDialog((prev) => ({ ...prev, open: false }));
            if (typed !== CONFIRM_TOKENS.RESET) {
              showToast('Reset cancelled — type RESET exactly', 'info');
              return;
            }
            await Promise.all([
              resetTeamTestCases({ confirm: CONFIRM_TOKENS.RESET }),
              putSettings(
                { testEnvironment: '', softwareVersion: '' },
                { silentFailure: true },
              ),
            ]);
            showToast('All data cleared', 'info');
          },
        });
      },
    });
  }

  return (
    <Stack spacing={4}>
      <ToastProvider />

      <PageHeader
        eyebrow='System'
        title='Admin Panel'
        sub='Configuration and management tools for team administrators.'
      />

      {/* Quick access */}
      <Grid container spacing={2}>
        {QUICK_ACCESS.map(({ href, Icon, label, description, action }) => (
          <Grid key={href} size={{ xs: 12, sm: 6 }}>
            <Card
              variant='outlined'
              sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}
            >
              <CardContent sx={{ flex: 1 }}>
                <Stack
                  direction='row'
                  spacing={1.5}
                  sx={{ alignItems: 'flex-start', mb: 1 }}
                >
                  <Icon sx={{ color: 'primary.main', mt: 0.25 }} />
                  <Typography variant='panelTitle' component='h2'>
                    {label}
                  </Typography>
                </Stack>
                <Typography variant='tableCell' color='text.secondary'>
                  {description}
                </Typography>
              </CardContent>
              <CardActions sx={{ px: 2, pb: 2 }}>
                <Button
                  component={Link}
                  href={href}
                  variant='outlined'
                  size='small'
                >
                  {action}
                </Button>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Danger zone */}
      <Stack spacing={2}>
        <Stack direction='row' spacing={1.5} sx={{ alignItems: 'center' }}>
          <Divider sx={{ flex: 1 }} />
          <Stack direction='row' spacing={0.75} sx={{ alignItems: 'center' }}>
            <WarningAmberIcon sx={{ fontSize: 16, color: 'error.main' }} />
            <Typography
              variant='pageEyebrow'
              sx={{ color: 'error.main', letterSpacing: '0.08em' }}
            >
              Danger Zone
            </Typography>
          </Stack>
          <Divider sx={{ flex: 1 }} />
        </Stack>

        <Card
          variant='outlined'
          sx={{
            borderColor: 'error.main',
            borderWidth: 1,
            bgcolor: 'rgba(220,38,38,0.03)',
          }}
        >
          <CardContent>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={2}
              sx={{
                justifyContent: 'space-between',
                alignItems: { sm: 'center' },
              }}
            >
              <Stack spacing={0.5}>
                <Stack
                  direction='row'
                  spacing={1}
                  sx={{ alignItems: 'center' }}
                >
                  <DeleteForeverIcon
                    sx={{ fontSize: 18, color: 'error.main' }}
                  />
                  <Typography
                    variant='panelTitle'
                    component='h2'
                    sx={{ color: 'error.main' }}
                  >
                    Clear All Data
                  </Typography>
                </Stack>
                <Typography variant='tableCell' color='text.secondary'>
                  Permanently deletes all test cases, applications, modules, and
                  test runs for your team. Settings are also reset. This action
                  cannot be undone.
                </Typography>
              </Stack>
              <Button
                variant='outlined'
                color='error'
                size='small'
                onClick={clearAll}
                sx={{ flexShrink: 0 }}
              >
                Clear All Data
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Stack>

      {/* Confirmation dialogs */}
      <ConfirmDialog
        confirmDialog={confirmDialog}
        setConfirmDialog={setConfirmDialog}
      />

      <Dialog
        open={promptDialog.open}
        onClose={() => setPromptDialog((prev) => ({ ...prev, open: false }))}
        maxWidth='xs'
        fullWidth
      >
        <DialogTitle>Clear All Data</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            size='small'
            label='Type RESET to confirm'
            value={promptDialog.value}
            onChange={(e) =>
              setPromptDialog((prev) => ({ ...prev, value: e.target.value }))
            }
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() =>
              setPromptDialog((prev) => ({ ...prev, open: false }))
            }
          >
            Cancel
          </Button>
          <Button
            variant='contained'
            color='error'
            onClick={() => promptDialog.onConfirm(promptDialog.value)}
          >
            Clear
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
