'use client';

import AddIcon from '@mui/icons-material/Add';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import CloseIcon from '@mui/icons-material/Close';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import IntegrationInstructionsOutlinedIcon from '@mui/icons-material/IntegrationInstructionsOutlined';
import LabelOutlinedIcon from '@mui/icons-material/LabelOutlined';
import PeopleIcon from '@mui/icons-material/People';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  Grid,
  IconButton,
  MenuItem,
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
import { createApplication, updateApplication } from '@/lib/api/applications';
import { updateAdminSettings } from '@/lib/api/settings';
import { resetTeamTestCases } from '@/lib/api/testCases';
import {
  AI_PROVIDERS,
  CONFIRM_TOKENS,
  JIRA_ISSUE_MODE_DEFAULT,
  JIRA_ISSUE_MODES,
} from '@/lib/constants';

const JIRA_MODE_OPTIONS = [
  { value: JIRA_ISSUE_MODES.OFF, label: 'Off' },
  { value: JIRA_ISSUE_MODES.ASK, label: 'Ask each time' },
];

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
            {new Date(entry.timestamp).toLocaleString('en-GB')} · {entry.actor}
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
const PREFIX_RE = /^[A-Z0-9]{2,5}$/;
const PREFIX_CREATE_RE = /^[A-Z0-9]{3}$/;

export default function AdminClient({
  user,
  settings,
  applications: initialApplications = [],
}) {
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
    jiraIssueMode: settings?.jiraIssueMode ?? JIRA_ISSUE_MODE_DEFAULT,
    jiraBaseUrl: settings?.jiraBaseUrl ?? '',
    jiraEmail: settings?.jiraEmail ?? '',
    jiraApiToken: settings?.jiraApiToken ?? '',
    jiraSyncThrottleHours: settings?.jiraSyncThrottleHours ?? 1,
    aiProvider: settings?.aiProvider ?? null,
    aiApiKey: settings?.aiApiKey ?? '',
  });
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [savedSettings, setSavedSettings] = useState(() => ({
    failureThreshold: settings?.failureThreshold ?? 5,
    topModulesLimit: settings?.topModulesLimit ?? 5,
    jiraIssueMode: settings?.jiraIssueMode ?? JIRA_ISSUE_MODE_DEFAULT,
    jiraBaseUrl: settings?.jiraBaseUrl ?? '',
    jiraEmail: settings?.jiraEmail ?? '',
    jiraApiToken: settings?.jiraApiToken ?? '',
    jiraSyncThrottleHours: settings?.jiraSyncThrottleHours ?? 1,
    aiProvider: settings?.aiProvider ?? null,
    aiApiKey: settings?.aiApiKey ?? '',
  }));

  const isSettingsDirty =
    Number(dashboardSettings.failureThreshold) !==
      Number(savedSettings.failureThreshold) ||
    Number(dashboardSettings.topModulesLimit) !==
      Number(savedSettings.topModulesLimit) ||
    dashboardSettings.jiraIssueMode !== savedSettings.jiraIssueMode ||
    (dashboardSettings.jiraBaseUrl || '') !==
      (savedSettings.jiraBaseUrl || '') ||
    (dashboardSettings.jiraEmail || '') !== (savedSettings.jiraEmail || '') ||
    (dashboardSettings.jiraApiToken || '') !==
      (savedSettings.jiraApiToken || '') ||
    Number(dashboardSettings.jiraSyncThrottleHours) !==
      Number(savedSettings.jiraSyncThrottleHours) ||
    (dashboardSettings.aiProvider ?? null) !==
      (savedSettings.aiProvider ?? null) ||
    (dashboardSettings.aiApiKey || '') !== (savedSettings.aiApiKey || '');

  const [applications, setApplications] = useState(initialApplications);
  const [prefixDrafts, setPrefixDrafts] = useState(() =>
    Object.fromEntries(
      initialApplications.map((a) => [a._id, a.initial ?? '']),
    ),
  );
  const [prefixSaving, setPrefixSaving] = useState({});
  const [prefixConfirm, setPrefixConfirm] = useState(null); // { app, newInitial }
  const [newAppOpen, setNewAppOpen] = useState(false);
  const [newApp, setNewApp] = useState({
    name: '',
    prefix: '',
    prefixTouched: false,
  });
  const [newAppSaving, setNewAppSaving] = useState(false);

  function requestPrefixSave(app) {
    setPrefixConfirm({ app, newInitial: prefixDrafts[app._id] });
  }

  async function confirmPrefixSave() {
    const { app, newInitial } = prefixConfirm;
    setPrefixConfirm(null);
    setPrefixSaving((prev) => ({ ...prev, [app._id]: true }));
    try {
      const { renamedCount } = await updateApplication(app._id, {
        initial: newInitial,
      });
      setApplications((prev) =>
        prev.map((a) =>
          a._id === app._id ? { ...a, initial: newInitial } : a,
        ),
      );
      const renamed =
        renamedCount > 0
          ? ` ${renamedCount} existing ID${renamedCount !== 1 ? 's' : ''} renamed.`
          : '';
      showToast(
        `Prefix for "${app.name}" updated to ${newInitial}.${renamed}`,
        'success',
      );
    } catch (err) {
      const msg = err?.message ?? '';
      if (msg.toLowerCase().includes('already in use')) {
        showToast(
          `Prefix "${newInitial}" is already in use by another application`,
          'error',
        );
      } else {
        showToast('Failed to update prefix', 'error');
      }
    } finally {
      setPrefixSaving((prev) => ({ ...prev, [app._id]: false }));
    }
  }

  function handleNewAppNameChange(value) {
    const derived = value
      .replace(/[^A-Z0-9]/gi, '')
      .toUpperCase()
      .slice(0, 3);
    setNewApp((prev) => ({
      name: value,
      prefix: prev.prefixTouched ? prev.prefix : derived,
      prefixTouched: prev.prefixTouched,
    }));
  }

  function handleNewAppPrefixChange(value) {
    setNewApp((prev) => ({
      ...prev,
      prefix: value.toUpperCase().replace(/[^A-Z0-9]/g, ''),
      prefixTouched: true,
    }));
  }

  function closeNewAppDialog() {
    setNewAppOpen(false);
    setNewApp({ name: '', prefix: '', prefixTouched: false });
  }

  async function createApp() {
    setNewAppSaving(true);
    try {
      const created = await createApplication({
        name: newApp.name.trim(),
        initial: newApp.prefix,
      });
      setApplications((prev) => [created, ...prev]);
      setPrefixDrafts((prev) => ({
        ...prev,
        [created._id]: created.initial ?? '',
      }));
      closeNewAppDialog();
      showToast('Application created', 'success');
    } catch (err) {
      const msg = err?.message ?? '';
      if (msg.toLowerCase().includes('already in use')) {
        showToast('Prefix already in use', 'error');
      } else {
        showToast('Failed to create application', 'error');
      }
    } finally {
      setNewAppSaving(false);
    }
  }

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
        jiraIssueMode: dashboardSettings.jiraIssueMode,
        jiraBaseUrl: dashboardSettings.jiraBaseUrl || undefined,
        jiraEmail: dashboardSettings.jiraEmail || undefined,
        jiraApiToken: dashboardSettings.jiraApiToken || undefined,
        jiraSyncThrottleHours: Number(dashboardSettings.jiraSyncThrottleHours),
        aiProvider: dashboardSettings.aiProvider,
        aiApiKey: dashboardSettings.aiApiKey || undefined,
      });
      setSavedSettings({
        failureThreshold: dashboardSettings.failureThreshold,
        topModulesLimit: dashboardSettings.topModulesLimit,
        jiraIssueMode: dashboardSettings.jiraIssueMode,
        jiraBaseUrl: dashboardSettings.jiraBaseUrl,
        jiraEmail: dashboardSettings.jiraEmail,
        jiraApiToken: dashboardSettings.jiraApiToken,
        jiraSyncThrottleHours: dashboardSettings.jiraSyncThrottleHours,
        aiProvider: dashboardSettings.aiProvider,
        aiApiKey: dashboardSettings.aiApiKey,
      });
      showToast('Settings saved', 'success');
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
              sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                transition: 'box-shadow 0.2s, border-color 0.2s',
                '&:hover': {
                  boxShadow: 2,
                  borderColor: 'primary.main',
                },
              }}
            >
              <CardContent sx={{ flex: 1 }}>
                <Stack
                  direction='row'
                  spacing={1.5}
                  sx={{ alignItems: 'center', mb: 1 }}
                >
                  <Stack
                    sx={{
                      p: 1,
                      borderRadius: 1.5,
                      bgcolor: 'rgba(13,148,136,0.1)',
                      color: 'primary.main',
                      flexShrink: 0,
                    }}
                  >
                    <Icon sx={{ fontSize: 20 }} />
                  </Stack>
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
                    variant='contained'
                    size='small'
                  >
                    {action}
                  </Button>
                ) : (
                  <Button
                    variant='contained'
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
            <SettingsOutlinedIcon
              sx={{ fontSize: 16, color: 'primary.main' }}
            />
            <Typography
              variant='pageEyebrow'
              sx={{ letterSpacing: '0.08em', color: 'primary.main' }}
            >
              Settings
            </Typography>
          </Stack>
          <Divider sx={{ flex: 1 }} />
        </Stack>

        <Card variant='outlined' sx={{ overflow: 'hidden' }}>
          {/* Dashboard */}
          <Accordion
            disableGutters
            elevation={0}
            square
            defaultExpanded
            sx={{
              '&:not(:last-child)': { borderBottom: 1, borderColor: 'divider' },
              '&::before': { display: 'none' },
            }}
          >
            <AccordionSummary
              expandIcon={<ExpandMoreIcon sx={{ color: 'primary.main' }} />}
              sx={{
                px: 2.5,
                py: 0.75,
                '&:hover': { bgcolor: 'grey.100' },
                '&.Mui-expanded': { bgcolor: 'rgba(13,148,136,0.04)' },
              }}
            >
              <Stack
                direction='row'
                spacing={1.5}
                sx={{ alignItems: 'center' }}
              >
                <Stack
                  sx={{
                    p: 0.75,
                    borderRadius: 1.5,
                    bgcolor: 'rgba(13,148,136,0.1)',
                    color: 'primary.main',
                    flexShrink: 0,
                  }}
                >
                  <TuneOutlinedIcon sx={{ fontSize: 18 }} />
                </Stack>
                <Stack spacing={0.25}>
                  <Typography variant='panelTitle'>Dashboard</Typography>
                  <Typography
                    variant='tableCell'
                    color='text.secondary'
                    sx={{ fontSize: 11 }}
                  >
                    Top Failing Modules panel thresholds
                  </Typography>
                </Stack>
              </Stack>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 2.5, pb: 2.5, pt: 0.5 }}>
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
            </AccordionDetails>
          </Accordion>

          {/* Jira Integration */}
          <Accordion
            disableGutters
            elevation={0}
            square
            sx={{
              '&:not(:last-child)': { borderBottom: 1, borderColor: 'divider' },
              '&::before': { display: 'none' },
            }}
          >
            <AccordionSummary
              expandIcon={<ExpandMoreIcon sx={{ color: 'primary.main' }} />}
              sx={{
                px: 2.5,
                py: 0.75,
                '&:hover': { bgcolor: 'grey.100' },
                '&.Mui-expanded': { bgcolor: 'rgba(13,148,136,0.04)' },
              }}
            >
              <Stack
                direction='row'
                spacing={1.5}
                sx={{ alignItems: 'center' }}
              >
                <Stack
                  sx={{
                    p: 0.75,
                    borderRadius: 1.5,
                    bgcolor: 'rgba(13,148,136,0.1)',
                    color: 'primary.main',
                    flexShrink: 0,
                  }}
                >
                  <IntegrationInstructionsOutlinedIcon sx={{ fontSize: 18 }} />
                </Stack>
                <Stack spacing={0.25}>
                  <Typography variant='panelTitle'>Jira Integration</Typography>
                  <Typography
                    variant='tableCell'
                    color='text.secondary'
                    sx={{ fontSize: 11 }}
                  >
                    Auto-create issues when tests are marked as failed
                  </Typography>
                </Stack>
              </Stack>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 2.5, pb: 2.5, pt: 0.5 }}>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    select
                    size='small'
                    label='Issue creation'
                    value={dashboardSettings.jiraIssueMode}
                    onChange={(e) =>
                      setDashboardSettings((prev) => ({
                        ...prev,
                        jiraIssueMode: e.target.value,
                      }))
                    }
                    helperText='Ask shows a checkbox in the Fail dialog before creating an issue'
                  >
                    {JIRA_MODE_OPTIONS.map((opt) => (
                      <MenuItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    size='small'
                    label='Jira domain'
                    placeholder='https://yourcompany.atlassian.net'
                    value={dashboardSettings.jiraBaseUrl}
                    onChange={(e) =>
                      setDashboardSettings((prev) => ({
                        ...prev,
                        jiraBaseUrl: e.target.value,
                      }))
                    }
                    helperText='Your Atlassian domain URL'
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    size='small'
                    label='Jira email'
                    placeholder='you@yourcompany.com'
                    value={dashboardSettings.jiraEmail}
                    onChange={(e) =>
                      setDashboardSettings((prev) => ({
                        ...prev,
                        jiraEmail: e.target.value,
                      }))
                    }
                    helperText='Atlassian account email used for API access'
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    size='small'
                    type='number'
                    label='Sync throttle (hours)'
                    value={dashboardSettings.jiraSyncThrottleHours}
                    onChange={(e) =>
                      setDashboardSettings((prev) => ({
                        ...prev,
                        jiraSyncThrottleHours: e.target.value,
                      }))
                    }
                    slotProps={{ htmlInput: { min: 1, max: 24 } }}
                    helperText='How often Jira story data is re-fetched (1–24 hours)'
                  />
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <TextField
                    fullWidth
                    size='small'
                    label='API token'
                    type='password'
                    placeholder='ATATT3x…'
                    value={dashboardSettings.jiraApiToken}
                    onChange={(e) =>
                      setDashboardSettings((prev) => ({
                        ...prev,
                        jiraApiToken: e.target.value,
                      }))
                    }
                    helperText='Create a token at id.atlassian.com → Security → API tokens'
                  />
                </Grid>
              </Grid>
            </AccordionDetails>
          </Accordion>

          {/* AI Generation */}
          <Accordion
            disableGutters
            elevation={0}
            square
            sx={{ '&::before': { display: 'none' } }}
          >
            <AccordionSummary
              expandIcon={<ExpandMoreIcon sx={{ color: 'primary.main' }} />}
              sx={{
                px: 2.5,
                py: 0.75,
                '&:hover': { bgcolor: 'grey.100' },
                '&.Mui-expanded': { bgcolor: 'rgba(13,148,136,0.04)' },
              }}
            >
              <Stack
                direction='row'
                spacing={1.5}
                sx={{ alignItems: 'center' }}
              >
                <Stack
                  sx={{
                    p: 0.75,
                    borderRadius: 1.5,
                    bgcolor: 'rgba(13,148,136,0.1)',
                    color: 'primary.main',
                    flexShrink: 0,
                  }}
                >
                  <AutoAwesomeOutlinedIcon sx={{ fontSize: 18 }} />
                </Stack>
                <Stack spacing={0.25}>
                  <Typography variant='panelTitle'>AI Generation</Typography>
                  <Typography
                    variant='tableCell'
                    color='text.secondary'
                    sx={{ fontSize: 11 }}
                  >
                    Generate test cases from Jira user stories using AI
                  </Typography>
                </Stack>
              </Stack>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 2.5, pb: 2.5, pt: 0.5 }}>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    select
                    size='small'
                    label='AI Provider'
                    value={dashboardSettings.aiProvider ?? ''}
                    onChange={(e) =>
                      setDashboardSettings((prev) => ({
                        ...prev,
                        aiProvider: e.target.value || null,
                        aiApiKey: '',
                      }))
                    }
                    disabled={settingsSaving}
                    slotProps={{
                      select: { displayEmpty: true },
                      inputLabel: { shrink: true },
                    }}
                    helperText='Select a provider to enable AI-powered test case generation'
                  >
                    <MenuItem value=''>Disabled</MenuItem>
                    <MenuItem value={AI_PROVIDERS.CLAUDE}>
                      Claude (Anthropic)
                    </MenuItem>
                    <MenuItem value={AI_PROVIDERS.OPENAI}>
                      OpenAI (GPT-4o)
                    </MenuItem>
                    <MenuItem value={AI_PROVIDERS.GEMINI}>
                      Google Gemini
                    </MenuItem>
                    <MenuItem value={AI_PROVIDERS.GEMMA}>Google Gemma</MenuItem>
                  </TextField>
                </Grid>
                {dashboardSettings.aiProvider && (
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      fullWidth
                      size='small'
                      label='API Key'
                      type='password'
                      value={dashboardSettings.aiApiKey ?? ''}
                      onChange={(e) =>
                        setDashboardSettings((prev) => ({
                          ...prev,
                          aiApiKey: e.target.value,
                        }))
                      }
                      disabled={settingsSaving}
                      placeholder='Paste your API key here'
                      helperText={
                        dashboardSettings.aiProvider === AI_PROVIDERS.CLAUDE
                          ? 'Get your key at console.anthropic.com → API Keys'
                          : dashboardSettings.aiProvider === AI_PROVIDERS.OPENAI
                            ? 'Get your key at platform.openai.com → API Keys'
                            : 'Get your key at aistudio.google.com → Get API key'
                      }
                    />
                  </Grid>
                )}
              </Grid>
            </AccordionDetails>
          </Accordion>
        </Card>

        <Stack direction='row' sx={{ justifyContent: 'flex-end' }}>
          <Button
            variant='contained'
            size='small'
            onClick={saveSettings}
            disabled={settingsSaving || !isSettingsDirty}
            startIcon={
              settingsSaving ? (
                <CircularProgress size={14} color='inherit' />
              ) : undefined
            }
          >
            {settingsSaving ? 'Saving…' : 'Save Settings'}
          </Button>
        </Stack>
      </Stack>

      <Stack spacing={2}>
        <Stack direction='row' spacing={1.5} sx={{ alignItems: 'center' }}>
          <Divider sx={{ flex: 1 }} />
          <Stack direction='row' spacing={0.75} sx={{ alignItems: 'center' }}>
            <LabelOutlinedIcon sx={{ fontSize: 16, color: 'primary.main' }} />
            <Typography
              variant='pageEyebrow'
              sx={{ letterSpacing: '0.08em', color: 'primary.main' }}
            >
              Test Case IDs
            </Typography>
          </Stack>
          <Divider sx={{ flex: 1 }} />
        </Stack>

        <Card variant='outlined' sx={{ overflow: 'hidden' }}>
          <Accordion
            disableGutters
            elevation={0}
            square
            defaultExpanded
            sx={{ '&::before': { display: 'none' } }}
          >
            <AccordionSummary
              expandIcon={<ExpandMoreIcon sx={{ color: 'primary.main' }} />}
              sx={{
                px: 2.5,
                py: 0.75,
                '&:hover': { bgcolor: 'grey.100' },
                '&.Mui-expanded': { bgcolor: 'rgba(13,148,136,0.04)' },
              }}
            >
              <Stack
                direction='row'
                spacing={1.5}
                sx={{ alignItems: 'center', flex: 1, mr: 1 }}
              >
                <Stack
                  sx={{
                    p: 0.75,
                    borderRadius: 1.5,
                    bgcolor: 'rgba(13,148,136,0.1)',
                    color: 'primary.main',
                    flexShrink: 0,
                  }}
                >
                  <LabelOutlinedIcon sx={{ fontSize: 18 }} />
                </Stack>
                <Stack spacing={0.25} sx={{ flex: 1 }}>
                  <Stack
                    direction='row'
                    spacing={1}
                    sx={{ alignItems: 'center' }}
                  >
                    <Typography variant='panelTitle'>
                      Test Case ID Prefixes
                    </Typography>
                    {applications.length > 0 && (
                      <Chip
                        label={applications.length}
                        size='small'
                        color='primary'
                        sx={{ fontSize: 10, height: 18, minWidth: 24 }}
                      />
                    )}
                  </Stack>
                  <Typography
                    variant='tableCell'
                    color='text.secondary'
                    sx={{ fontSize: 11 }}
                  >
                    Per-application prefix that forms the test case ID (e.g.
                    SAP-0001)
                  </Typography>
                </Stack>
                <IconButton
                  size='small'
                  onClick={(e) => {
                    e.stopPropagation();
                    setNewAppOpen(true);
                  }}
                  sx={{ color: 'primary.main', flexShrink: 0 }}
                >
                  <AddIcon fontSize='small' />
                </IconButton>
              </Stack>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 2.5, pb: 2.5, pt: 0.5 }}>
              <Stack spacing={2}>
                <Alert severity='warning'>
                  Changing a prefix will retroactively rename{' '}
                  <strong>all existing test case IDs</strong> for that
                  application (e.g. SAP-0001 → SP-0001). You will be asked to
                  confirm before any change is applied.
                </Alert>

                {applications.length === 0 ? (
                  <Stack spacing={1} sx={{ alignItems: 'center', py: 3 }}>
                    <LabelOutlinedIcon
                      sx={{ color: 'text.disabled', fontSize: 40 }}
                    />
                    <Typography variant='panelTitle'>
                      No applications yet
                    </Typography>
                    <Typography variant='tableCell' color='text.secondary'>
                      Create an application to manage its test case ID prefix.
                    </Typography>
                  </Stack>
                ) : (
                  <Stack spacing={1.5} divider={<Divider />}>
                    {applications.map((app) => {
                      const draft = prefixDrafts[app._id] ?? '';
                      const isValid = PREFIX_RE.test(draft);
                      const isChanged = draft !== app.initial;
                      const saving = !!prefixSaving[app._id];
                      const canSave = isChanged && isValid && !saving;
                      return (
                        <Grid
                          container
                          spacing={2}
                          key={app._id}
                          sx={{ alignItems: 'center' }}
                        >
                          <Grid size={{ xs: 12, sm: 4 }}>
                            <Stack spacing={0.5}>
                              <Typography
                                variant='tableCell'
                                sx={{ fontWeight: 600 }}
                              >
                                {app.name}
                              </Typography>
                              <Chip
                                label={`Current: ${app.initial ?? '—'}`}
                                size='small'
                                sx={{ width: 'fit-content', fontSize: 11 }}
                              />
                            </Stack>
                          </Grid>
                          <Grid size={{ xs: 12, sm: 3 }}>
                            <TextField
                              fullWidth
                              size='small'
                              label='New prefix'
                              value={draft}
                              onChange={(e) =>
                                setPrefixDrafts((prev) => ({
                                  ...prev,
                                  [app._id]: e.target.value
                                    .toUpperCase()
                                    .replace(/[^A-Z0-9]/g, ''),
                                }))
                              }
                              disabled={saving}
                              slotProps={{ htmlInput: { maxLength: 5 } }}
                              error={draft.length > 0 && !isValid}
                              helperText={
                                draft.length > 0 && !isValid
                                  ? '2–5 letters/digits'
                                  : ' '
                              }
                            />
                          </Grid>
                          <Grid size={{ xs: 12, sm: 3 }}>
                            <Typography
                              variant='tableCell'
                              color='text.secondary'
                            >
                              Preview:{' '}
                              <strong>
                                {(isValid ? draft : app.initial) ?? '???'}-0001
                              </strong>
                            </Typography>
                          </Grid>
                          <Grid size={{ xs: 12, sm: 2 }}>
                            <Button
                              variant='contained'
                              size='small'
                              onClick={() => requestPrefixSave(app)}
                              disabled={!canSave}
                              startIcon={
                                saving ? (
                                  <CircularProgress size={14} color='inherit' />
                                ) : undefined
                              }
                            >
                              {saving ? 'Saving…' : 'Save'}
                            </Button>
                          </Grid>
                        </Grid>
                      );
                    })}
                  </Stack>
                )}
              </Stack>
            </AccordionDetails>
          </Accordion>
        </Card>
      </Stack>

      <Dialog
        open={newAppOpen}
        onClose={closeNewAppDialog}
        maxWidth='xs'
        fullWidth
      >
        <DialogTitle>New Application</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              fullWidth
              size='small'
              label='Application Name'
              autoFocus
              value={newApp.name}
              onChange={(e) => handleNewAppNameChange(e.target.value)}
              disabled={newAppSaving}
            />
            <TextField
              fullWidth
              size='small'
              label='Prefix'
              value={newApp.prefix}
              onChange={(e) => handleNewAppPrefixChange(e.target.value)}
              disabled={newAppSaving}
              slotProps={{ htmlInput: { maxLength: 3 } }}
              error={
                newApp.prefix.length > 0 &&
                !PREFIX_CREATE_RE.test(newApp.prefix)
              }
              helperText={
                newApp.prefix.length > 0 &&
                !PREFIX_CREATE_RE.test(newApp.prefix)
                  ? 'Exactly 3 letters or digits'
                  : ' '
              }
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            variant='outlined'
            onClick={closeNewAppDialog}
            disabled={newAppSaving}
          >
            Cancel
          </Button>
          <Button
            variant='contained'
            onClick={createApp}
            disabled={
              !newApp.name.trim() ||
              !PREFIX_CREATE_RE.test(newApp.prefix) ||
              newAppSaving
            }
            startIcon={
              newAppSaving ? (
                <CircularProgress size={14} color='inherit' />
              ) : undefined
            }
          >
            {newAppSaving ? 'Creating…' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

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

      {/* Prefix change confirmation dialog */}
      <Dialog
        open={!!prefixConfirm}
        onClose={() => setPrefixConfirm(null)}
        maxWidth='xs'
        fullWidth
      >
        <DialogTitle>Rename all test case IDs?</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5}>
            <Typography variant='body2'>
              Changing the prefix for{' '}
              <strong>{prefixConfirm?.app?.name}</strong> from{' '}
              <strong>{prefixConfirm?.app?.initial}</strong> to{' '}
              <strong>{prefixConfirm?.newInitial}</strong> will retroactively
              rename every existing test case ID for this application (e.g.{' '}
              <strong>
                {prefixConfirm?.app?.initial}-0001 → {prefixConfirm?.newInitial}
                -0001
              </strong>
              ).
            </Typography>
            <Alert severity='warning'>This cannot be undone.</Alert>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPrefixConfirm(null)}>Cancel</Button>
          <Button variant='contained' color='error' onClick={confirmPrefixSave}>
            Rename all IDs
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
