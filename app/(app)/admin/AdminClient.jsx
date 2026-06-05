'use client';

import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import CloseIcon from '@mui/icons-material/Close';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import ManageAccountsOutlinedIcon from '@mui/icons-material/ManageAccountsOutlined';
import PeopleIcon from '@mui/icons-material/People';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import {
  Alert,
  Button,
  Card,
  CardActions,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  Grid,
  IconButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import Link from 'next/link';
import { useState } from 'react';
import {
  buildAdminActivityCsv,
  formatAdminActivityEntries,
} from '@/app/(app)/admin/adminActivity';
import ConfirmDialog from '@/components/ConfirmDialog';
import PageHeader from '@/components/PageHeader';
import ToastProvider, { showToast } from '@/components/Toast';
import { listAdminActivity } from '@/lib/api/admin';
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
  {
    key: 'activity',
    Icon: HistoryOutlinedIcon,
    label: 'Activity Logs',
    description:
      'Open a compact audit trail for admin actions like user updates, imports, and data resets.',
    action: 'View Activity',
  },
];

function downloadLogsFile(entries) {
  const csv = buildAdminActivityCsv(entries);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `admin-activity-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function normalizeActivityEntries(events) {
  if (!Array.isArray(events) || events.length === 0) return [];
  if (events[0]?.title && events[0]?.timestamp) return events;
  return formatAdminActivityEntries(events);
}

function ActivityRow({ entry }) {
  return (
    <Card variant='outlined'>
      <CardContent>
        <Stack spacing={1.5}>
          <Stack
            direction='row'
            spacing={1.25}
            sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}
          >
            <Stack spacing={0.375}>
              <Typography variant='panelTitle' component='h3'>
                {entry.title}
              </Typography>
              <Typography variant='tableCell' color='text.secondary'>
                {entry.subject}
              </Typography>
            </Stack>
            <Typography
              variant='formLabel'
              sx={{
                color: 'primary.main',
                px: 1,
                py: 0.375,
                border: 1,
                borderColor: 'divider',
                borderRadius: 999,
                lineHeight: 1,
              }}
            >
              {entry.actor}
            </Typography>
          </Stack>

          <Stack spacing={0.75}>
            <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
              <ManageAccountsOutlinedIcon
                sx={{ fontSize: 16, color: 'primary.main' }}
              />
              <Typography variant='tableCell'>
                Updated by <strong>{entry.actor}</strong>
              </Typography>
            </Stack>
            <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
              <ScheduleOutlinedIcon
                sx={{ fontSize: 16, color: 'primary.main' }}
              />
              <Typography variant='tableCell' color='text.secondary'>
                {new Date(entry.timestamp).toLocaleString()}
              </Typography>
            </Stack>
          </Stack>

          {entry.details.length > 0 ? (
            <Stack spacing={0.75}>
              {entry.details.map((detail) => (
                <Stack
                  key={`${entry._id}-${detail}`}
                  direction='row'
                  spacing={1}
                  sx={{ alignItems: 'flex-start' }}
                >
                  <CheckCircleOutlinedIcon
                    sx={{ fontSize: 16, color: 'primary.main', mt: 0.125 }}
                  />
                  <Typography variant='tableCell'>{detail}</Typography>
                </Stack>
              ))}
            </Stack>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}

/**
 * Admin control panel — quick access to admin sub-pages and the destructive
 * "Clear All Data" action that was previously misplaced on the Test Cases page.
 */
export default function AdminClient({ user }) {
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
  const [activityOpen, setActivityOpen] = useState(false);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState('');
  const [activityEntries, setActivityEntries] = useState([]);

  async function openActivity() {
    setActivityOpen(true);
    if (activityEntries.length > 0 || activityLoading) return;

    setActivityLoading(true);
    setActivityError('');
    try {
      const events = await listAdminActivity({ limit: 100 });
      setActivityEntries(normalizeActivityEntries(events));
    } catch {
      setActivityError('Could not load admin activity right now.');
    } finally {
      setActivityLoading(false);
    }
  }

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
            await resetTeamTestCases({ confirm: CONFIRM_TOKENS.RESET });
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

      <Grid container spacing={2}>
        {QUICK_ACCESS.map(({ href, key, Icon, label, description, action }) => (
          <Grid key={href || key} size={{ xs: 12, sm: 6, lg: 4 }}>
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
                {href ? (
                  <Button
                    component={Link}
                    href={href}
                    variant='outlined'
                    size='small'
                  >
                    {action}
                  </Button>
                ) : (
                  <Button
                    variant='outlined'
                    size='small'
                    onClick={openActivity}
                  >
                    {action}
                  </Button>
                )}
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>

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

      <Drawer
        anchor='right'
        open={activityOpen}
        onClose={() => setActivityOpen(false)}
        slotProps={{
          paper: {
            sx: {
              width: { xs: '100%', sm: 440, lg: 480 },
              p: 2,
            },
          },
        }}
      >
        <Stack spacing={2} sx={{ height: '100%' }}>
          <Stack
            direction='row'
            spacing={1.5}
            sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}
          >
            <Stack spacing={0.5}>
              <Typography variant='pageEyebrow'>Admin Activity</Typography>
              <Typography variant='pageTitle'>Activity Logs</Typography>
              <Typography variant='pageSub' component='div'>
                Opened on demand so the admin page stays fast. Review who
                updated what, and download the latest 100 entries when needed.
              </Typography>
            </Stack>
            <IconButton
              aria-label='Close activity logs'
              onClick={() => setActivityOpen(false)}
            >
              <CloseIcon />
            </IconButton>
          </Stack>

          <Stack
            direction='row'
            spacing={1.5}
            sx={{ justifyContent: 'space-between', alignItems: 'center' }}
          >
            <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
              <InsightsOutlinedIcon sx={{ color: 'primary.main' }} />
              <Typography variant='tableCell' color='text.secondary'>
                Signed in as {user?.name || 'Admin'}
              </Typography>
            </Stack>
            <Button
              variant='outlined'
              size='small'
              startIcon={<DownloadOutlinedIcon />}
              onClick={() => downloadLogsFile(activityEntries)}
              disabled={activityEntries.length === 0}
            >
              Download Logs
            </Button>
          </Stack>

          {activityError ? (
            <Alert severity='error'>{activityError}</Alert>
          ) : null}

          <Stack spacing={1.5} sx={{ overflowY: 'auto', pr: 0.5 }}>
            {activityLoading ? (
              <Typography variant='tableCell' color='text.secondary'>
                Loading activity…
              </Typography>
            ) : null}

            {!activityLoading &&
            activityEntries.length === 0 &&
            !activityError ? (
              <Card variant='outlined'>
                <CardContent>
                  <Stack spacing={1.5} sx={{ alignItems: 'flex-start' }}>
                    <HistoryOutlinedIcon sx={{ color: 'primary.main' }} />
                    <Typography variant='panelTitle'>
                      No activity yet
                    </Typography>
                    <Typography variant='tableCell' color='text.secondary'>
                      Admin actions like imports, user updates, and reset events
                      will appear here once they happen.
                    </Typography>
                    <Button
                      variant='contained'
                      onClick={() => setActivityOpen(false)}
                    >
                      Back to Admin
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            ) : null}

            {activityEntries.map((entry) => (
              <ActivityRow key={entry._id} entry={entry} />
            ))}
          </Stack>
        </Stack>
      </Drawer>
    </Stack>
  );
}
