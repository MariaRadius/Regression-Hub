'use client';

import ErrorOutlinedIcon from '@mui/icons-material/ErrorOutlined';
import FolderIcon from '@mui/icons-material/Folder';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import MetaChip from '@/components/MetaChip';
import Panel from '@/components/Panel';
import { PRIORITIES } from '@/lib/constants';
import { DASHBOARD_PANEL_SX } from './panelStyles';

function SummaryChip({ icon, label, color, variant = 'filled' }) {
  return (
    <Chip
      icon={icon}
      label={label}
      color={color}
      variant={variant}
      size='small'
      sx={{ fontWeight: 600 }}
    />
  );
}

function EmptyStateIcon({ accent, icon }) {
  return (
    <Stack
      sx={{
        width: 64,
        height: 64,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 3,
        background: `linear-gradient(180deg, ${accent}1f 0%, ${accent}14 100%)`,
        border: `1px solid ${accent}33`,
        boxShadow: '0 10px 24px rgba(15,23,42,0.06)',
      }}
    >
      {icon}
    </Stack>
  );
}

function EmptyCopy({ accent, icon, title, sub }) {
  return (
    <Stack
      spacing={1.5}
      sx={{
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 250,
        py: 5,
      }}
    >
      <EmptyStateIcon accent={accent} icon={icon} />
      <Typography variant='emptyStateTitle'>{title}</Typography>
      <Typography
        variant='pageSub'
        color='text.disabled'
        sx={{ textAlign: 'center', maxWidth: 320 }}
      >
        {sub}
      </Typography>
    </Stack>
  );
}

function DashboardCaseLink({ href, children }) {
  return (
    <Link
      href={href}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '0.28rem 0.65rem',
        borderRadius: '0.85rem',
        border: '1px solid rgba(225, 77, 90, 0.22)',
        background:
          'linear-gradient(180deg, rgba(255,241,243,1) 0%, rgba(255,247,248,1) 100%)',
        color: '#a23243',
        fontSize: '1rem',
        fontWeight: 700,
        lineHeight: 1.5,
        letterSpacing: '0.01em',
        textDecoration: 'none',
      }}
    >
      {children}
    </Link>
  );
}

export default function DashboardInsightsPanels({
  topFailingModules = [],
  criticalSummary = {},
  criticalFailures = [],
  failureThreshold = 5,
}) {
  const failedCriticalCount = criticalSummary.failed ?? 0;

  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, lg: 6 }}>
        <Panel title='Top Failing Modules' sx={DASHBOARD_PANEL_SX}>
          {topFailingModules.length > 0 ? (
            <Stack divider={<Divider flexItem />} spacing={0}>
              {topFailingModules.map((module) => (
                <Stack
                  key={module.id}
                  component={Link}
                  href={`/test-cases?moduleId=${encodeURIComponent(module.id)}&status=Fail`}
                  direction='row'
                  spacing={2}
                  sx={{
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    p: 2,
                    textDecoration: 'none',
                    color: 'inherit',
                    '&:hover': { bgcolor: 'action.hover' },
                    transition: 'background-color 0.15s',
                  }}
                >
                  <Stack spacing={0.5}>
                    <Typography variant='panelTitle' component='h3'>
                      {module.name}
                    </Typography>
                    <Typography variant='metricSub' color='text.secondary'>
                      {module.total} total cases in scope
                    </Typography>
                  </Stack>
                  <Chip
                    label={`${module.failed} failed`}
                    color='error'
                    variant='outlined'
                    size='small'
                    sx={{ fontWeight: 700 }}
                  />
                </Stack>
              ))}
            </Stack>
          ) : (
            <EmptyCopy
              accent='#f08d2f'
              icon={<FolderIcon sx={{ fontSize: 34, color: 'warning.main' }} />}
              title={`No modules have more than ${failureThreshold} failed test cases.`}
              sub='This panel highlights only modules with meaningful failure volume so the team can focus on the biggest hotspots first.'
            />
          )}
        </Panel>
      </Grid>

      <Grid size={{ xs: 12, lg: 6 }}>
        <Panel
          title='Critical Failures'
          sx={DASHBOARD_PANEL_SX}
          headerActions={
            <SummaryChip
              icon={<ErrorOutlinedIcon />}
              label={`Failed ${failedCriticalCount}`}
              color='error'
            />
          }
        >
          {criticalFailures.length > 0 ? (
            <Stack divider={<Divider flexItem />} spacing={0}>
              {criticalFailures.map((item) => (
                <Stack key={item.testKey} spacing={1.5} sx={{ p: 2 }}>
                  <Stack
                    direction='row'
                    spacing={1}
                    sx={{
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <DashboardCaseLink
                      href={`/test-cases?testKey=${encodeURIComponent(item.testKey)}&status=Fail`}
                    >
                      {item.testKey}
                    </DashboardCaseLink>
                    <Chip
                      label={
                        item.priority === PRIORITIES.HIGH
                          ? 'High priority'
                          : item.priority || 'Priority unset'
                      }
                      color='error'
                      size='small'
                      variant='outlined'
                      sx={{ fontWeight: 700 }}
                    />
                  </Stack>
                  <MetaChip
                    icon={<FolderIcon fontSize='small' />}
                    label={`${item.applicationName} / ${item.moduleName}`}
                    sx={{
                      width: 'fit-content',
                      bgcolor: 'grey.100',
                      color: 'text.secondary',
                    }}
                  />
                </Stack>
              ))}
            </Stack>
          ) : (
            <EmptyCopy
              accent='#e14d5a'
              icon={
                <WarningAmberIcon sx={{ fontSize: 34, color: 'error.main' }} />
              }
              title='No high-priority cases need attention for this selection.'
              sub='This panel tracks only High priority test cases so the team can spot critical risk quickly.'
            />
          )}
        </Panel>
      </Grid>
    </Grid>
  );
}
