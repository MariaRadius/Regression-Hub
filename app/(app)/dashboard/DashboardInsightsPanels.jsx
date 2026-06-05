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
import Panel from '@/components/Panel';
import {
  DASHBOARD_TOP_FAILING_MODULES_FAILURE_THRESHOLD,
  PRIORITIES,
} from '@/lib/constants';

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

function EmptyCopy({ icon, title, sub }) {
  return (
    <Stack spacing={1.5} sx={{ alignItems: 'center', py: 5 }}>
      {icon}
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
        color: 'inherit',
        fontSize: '1rem',
        fontWeight: 700,
        lineHeight: 1.5,
        textDecoration: 'underline',
        textUnderlineOffset: '0.18em',
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
}) {
  const failedCriticalCount = criticalSummary.failed ?? 0;

  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, lg: 5 }}>
        <Panel title='Top Failing Modules'>
          {topFailingModules.length > 0 ? (
            <Stack divider={<Divider flexItem />} spacing={0}>
              {topFailingModules.map((module) => (
                <Stack
                  key={module.id}
                  direction='row'
                  spacing={2}
                  sx={{
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    p: 2,
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
              icon={
                <FolderIcon sx={{ fontSize: 40, color: 'text.disabled' }} />
              }
              title={`No modules have more than ${DASHBOARD_TOP_FAILING_MODULES_FAILURE_THRESHOLD} failed test cases.`}
              sub='This panel highlights only modules with meaningful failure volume so the team can focus on the biggest hotspots first.'
            />
          )}
        </Panel>
      </Grid>

      <Grid size={{ xs: 12, lg: 7 }}>
        <Panel
          title='Critical Failures'
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
                  <Typography variant='metricSub' color='text.secondary'>
                    {item.moduleName} / {item.applicationName}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          ) : (
            <EmptyCopy
              icon={
                <WarningAmberIcon
                  sx={{ fontSize: 40, color: 'text.disabled' }}
                />
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
