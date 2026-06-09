'use client';

import CloseIcon from '@mui/icons-material/Close';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import PeopleIcon from '@mui/icons-material/People';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import {
  Alert,
  Button,
  Card,
  CardActions,
  CardContent,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  Grid,
  IconButton,
  Pagination,
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
import { updateAdminSettings } from '@/lib/api/settings';
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
  const [expanded, setExpanded] = useState(false);
  const details = entry.details ?? [];
  const subject =
    entry.subject && entry.subject !== 'Admin activity' ? entry.subject : null;
  const label = subject ? `${entry.title} — ${subject}` : entry.title;

  return (
    <Stack>
      <Stack
        direction='row'
        spacing={1.5}
        sx={{
          px: 2,
          py: 1.25,
          alignItems: 'flex-start',
          cursor: 'pointer',
          transition: 'background 0.15s',
          '&:hover': { bgcolor: 'grey.50' },
        }}
        onClick={() => setExpanded((v) => !v)}
      >
        <Stack sx={{ pt: 0.5, flexShrink: 0 }}>
          <Stack
            sx={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              bgcolor: 'primary.main',
            }}
          />
        </Stack>
        <Stack spacing={0.25} sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant='tableCell' sx={{ fontWeight: 600 }} noWrap>
            {label}
          </Typography>
          {details.length > 0 ? (
            <Typography
              variant='tableCell'
              color='text.secondary'
              sx={{ fontSize: 11 }}
              noWrap
            >
              {details.join(' · ')}
            </Typography>
          ) : null}
          <Typography
            variant='tableCell'
            color='text.disabled'
            sx={{ fontSize: 11 }}
          >
            {new Date(entry.timestamp).toLocaleString()} · {entry.actor}
          </Typography>
        </Stack>
        {expanded ? (
          <ExpandLessIcon
            sx={{
              fontSize: 15,
              color: 'text.disabled',
              flexShrink: 0,
              mt: 0.25,
            }}
          />
        ) : (
          <ExpandMoreIcon
            sx={{
              fontSize: 15,
              color: 'text.disabled',
              flexShrink: 0,
              mt: 0.25,
            }}
          />
        )}
      </Stack>

      <Collapse in={expanded} unmountOnExit>
        <Stack
          spacing={0.375}
          sx={{
            mx: 2,
            mb: 1,
            px: 1.5,
            py: 1,
            bgcolor: 'grey.50',
            borderRadius: 1,
            border: 1,
            borderColor: 'divider',
          }}
        >
          {Object.entries(entry.raw ?? {})
            .filter(([k]) => k !== 'teamId' && entry.raw[k] !== null)
            .map(([k, v]) => (
              <Stack key={k} direction='row' spacing={1}>
                <Typography
                  variant='tableCell'
                  color='text.disabled'
                  sx={{ minWidth: 110, flexShrink: 0, fontSize: 11 }}
                >
                  {k}
                </Typography>
                <Typography
                  variant='tableCell'
                  sx={{ wordBreak: 'break-all', fontSize: 11 }}
                >
                  {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                </Typography>
              </Stack>
            ))}
        </Stack>
      </Collapse>

      <Divider />
    </Stack>
  );
}

/**
 * Admin control panel — quick access to admin sub-pages and the destructive
 * "Clear All Data" action that was previously misplaced on the Test Cases page.
 */
export default function AdminClient({ user, settings }) {
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
  const [activityPage, setActivityPage] = useState(1);

  const PAGE_SIZE = 10;
  const totalPages = Math.ceil(activityEntries.length / PAGE_SIZE);
  const pagedEntries = activityEntries.slice(
    (activityPage - 1) * PAGE_SIZE,
    activityPage * PAGE_SIZE,
  );
  const [dashboardSettings, setDashboardSettings] = useState({
    failureThreshold: settings?.failureThreshold ?? 5,
    topModulesLimit: settings?.topModulesLimit ?? 5,
  });
  const [settingsSaving, setSettingsSaving] = useState(false);

  async function openActivity() {
    setActivityOpen(true);
    setActivityPage(1);
    if (activityLoading) return;

    setActivityLoading(true);
    setActivityError('');
    try {
      const events = await listAdminActivity({ limit: 500 });
      setActivityEntries(normalizeActivityEntries(events));
    } catch {
      setActivityError('Could not load admin activity right now.');
    } finally {
      setActivityLoading(false);
    }
  }

  async function saveSettings() {
    setSettingsSaving(true);
    try {
      await updateAdminSettings({
        failureThreshold: Number(dashboardSettings.failureThreshold),
        topModulesLimit: Number(dashboardSettings.topModulesLimit),
      });
      showToast('Dashboard settings saved', 'success');
    } catch {
      // error toast shown by HTTP client
    } finally {
      setSettingsSaving(false);
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
            <SettingsOutlinedIcon sx={{ fontSize: 16 }} />
            <Typography variant='pageEyebrow' sx={{ letterSpacing: '0.08em' }}>
              Dashboard Settings
            </Typography>
          </Stack>
          <Divider sx={{ flex: 1 }} />
        </Stack>

        <Card variant='outlined'>
          <CardContent>
            <Stack spacing={2}>
              <Stack spacing={0.5}>
                <Typography variant='panelTitle' component='h2'>
                  Top Failing Modules
                </Typography>
                <Typography variant='tableCell' color='text.secondary'>
                  Controls which modules appear in the "Top Failing Modules"
                  panel on the dashboard.
                </Typography>
              </Stack>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    size='small'
                    type='number'
                    label='Failure threshold'
                    value={dashboardSettings.failureThreshold}
                    onChange={(e) =>
                      setDashboardSettings((prev) => ({
                        ...prev,
                        failureThreshold: e.target.value,
                      }))
                    }
                    slotProps={{ htmlInput: { min: 1, max: 50 } }}
                    helperText='Min failed cases to appear (1–50)'
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    size='small'
                    type='number'
                    label='Top modules limit'
                    value={dashboardSettings.topModulesLimit}
                    onChange={(e) =>
                      setDashboardSettings((prev) => ({
                        ...prev,
                        topModulesLimit: e.target.value,
                      }))
                    }
                    slotProps={{ htmlInput: { min: 1, max: 10 } }}
                    helperText='Max modules to show (1–10)'
                  />
                </Grid>
              </Grid>
            </Stack>
          </CardContent>
          <CardActions sx={{ px: 2, pb: 2 }}>
            <Button
              variant='contained'
              size='small'
              onClick={saveSettings}
              disabled={settingsSaving}
            >
              {settingsSaving ? 'Saving…' : 'Save Settings'}
            </Button>
          </CardActions>
        </Card>
      </Stack>

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
                10 per page · Download for the full log.
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

          <Stack
            sx={{
              overflowY: 'auto',
              border: 1,
              borderColor: 'divider',
              borderRadius: 2,
              flex: 1,
            }}
          >
            {activityLoading ? (
              <Stack sx={{ px: 2, py: 3, alignItems: 'center' }}>
                <Typography variant='tableCell' color='text.secondary'>
                  Loading activity…
                </Typography>
              </Stack>
            ) : null}

            {!activityLoading &&
            activityEntries.length === 0 &&
            !activityError ? (
              <Stack
                spacing={1}
                sx={{ px: 2, py: 3, alignItems: 'flex-start' }}
              >
                <HistoryOutlinedIcon sx={{ color: 'text.disabled' }} />
                <Typography variant='panelTitle'>No activity yet</Typography>
                <Typography variant='tableCell' color='text.secondary'>
                  Admin actions like imports, user updates, and releases will
                  appear here.
                </Typography>
              </Stack>
            ) : null}

            {pagedEntries.map((entry) => (
              <ActivityRow key={entry._id} entry={entry} />
            ))}
          </Stack>

          {activityEntries.length > 0 ? (
            <Stack
              direction='row'
              spacing={1}
              sx={{ alignItems: 'center', justifyContent: 'space-between' }}
            >
              <Typography
                variant='tableCell'
                color='text.disabled'
                sx={{ fontSize: 11 }}
              >
                {(activityPage - 1) * PAGE_SIZE + 1}–
                {Math.min(activityPage * PAGE_SIZE, activityEntries.length)} of{' '}
                {activityEntries.length}
              </Typography>
              <Pagination
                count={Math.max(1, totalPages)}
                page={activityPage}
                onChange={(_e, p) => setActivityPage(p)}
                size='small'
                siblingCount={0}
              />
            </Stack>
          ) : null}
        </Stack>
      </Drawer>
    </Stack>
  );
}
