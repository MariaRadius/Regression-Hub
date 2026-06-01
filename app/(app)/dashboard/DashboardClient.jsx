'use client';

import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import MetricCards from '@/components/MetricCards';
import PageHeader from '@/components/PageHeader';
import Panel from '@/components/Panel';
import SummaryPanel from '@/components/SummaryPanel';
import { useReleaseEnv } from '@/contexts/ReleaseEnvContext';
import {
  buildAppBarData,
  buildDonutData,
  buildModuleBarData,
  buildTesterBarData,
} from '@/lib/db/dashboardTransforms';
import { ChartHoverProvider } from './charts/ChartHoverContext';

// Heavy visx charts — lazy-load so they don't inflate the initial bundle.
const DonutChart = dynamic(() => import('./charts/DonutChart'), {
  ssr: false,
  loading: () => <Skeleton variant='rectangular' width='100%' height='100%' />,
});

const StackedBarChart = dynamic(() => import('./charts/StackedBarChart'), {
  ssr: false,
  loading: () => <Skeleton variant='rectangular' width='100%' height='100%' />,
});

const APP_DISPLAY_ORDER = ['RadiusExam', 'Practice Admin'];

function compareAppOrder([a], [b]) {
  const ia = APP_DISPLAY_ORDER.indexOf(a);
  const ib = APP_DISPLAY_ORDER.indexOf(b);
  if (ia !== -1 || ib !== -1)
    return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib);
  return a.localeCompare(b);
}

/**
 * Client component that reads the active (releaseId, environment) from
 * ReleaseEnvContext, fetches dashboard data from /api/dashboard, and renders
 * metric cards + visx charts.
 *
 * Lazy-loads DonutChart and StackedBarChart to keep the initial bundle lean.
 */
export default function DashboardClient() {
  const router = useRouter();
  const { releaseId, releaseName, environment, activeRelease } =
    useReleaseEnv();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    if (!releaseId || !environment) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/dashboard?releaseId=${encodeURIComponent(releaseId)}&environment=${encodeURIComponent(environment)}`,
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Request failed (${res.status})`);
      }
      setData(await res.json());
    } catch (err) {
      setError(err.message ?? 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, [releaseId, environment]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Empty state — no release/environment selected ─────────────────────────
  if (!releaseId || !environment) {
    return (
      <Stack spacing={2.5}>
        <PageHeader
          eyebrow='QA Regression Control Center'
          title='Dashboard'
          sub='Select a release and environment to view metrics'
        />
        <Stack
          spacing={1}
          sx={{ py: 6, alignItems: 'center', textAlign: 'center' }}
        >
          <AssessmentOutlinedIcon
            sx={{ fontSize: 48, color: 'text.disabled' }}
          />
          <Typography variant='pageTitle' sx={{ fontWeight: 700 }}>
            No release selected
          </Typography>
          <Typography variant='pageSub' color='text.secondary'>
            Use the release selector above to pick an active release and
            environment.
          </Typography>
          <Button variant='contained' onClick={() => router.push('/releases')}>
            Go to Releases
          </Button>
        </Stack>
      </Stack>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (error) {
    return (
      <Stack spacing={2.5}>
        <PageHeader
          eyebrow='QA Regression Control Center'
          title='Dashboard'
          sub='Live metrics for the active release and environment'
          actions={
            releaseName ? (
              <Chip
                label={releaseName}
                color='primary'
                size='small'
                sx={{ fontWeight: 600 }}
              />
            ) : null
          }
        />
        <Stack
          spacing={1}
          sx={{ py: 6, alignItems: 'center', textAlign: 'center' }}
        >
          <AssessmentOutlinedIcon sx={{ fontSize: 48, color: 'error.main' }} />
          <Typography variant='pageTitle' sx={{ fontWeight: 700 }}>
            Failed to load dashboard
          </Typography>
          <Typography variant='pageSub' color='text.secondary'>
            {error}
          </Typography>
          <Button variant='contained' onClick={fetchData}>
            Try again
          </Button>
        </Stack>
      </Stack>
    );
  }

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (loading || !data) {
    return (
      <Stack spacing={2.5}>
        <Stack spacing={1}>
          <Skeleton variant='text' width={180} height={16} />
          <Skeleton variant='text' width={140} height={36} />
          <Skeleton variant='text' width={280} height={16} />
        </Stack>
        <Grid container spacing={2}>
          {[
            'tc-total',
            'tc-pass',
            'tc-fail',
            'tc-pending',
            'tc-passrate',
            'tc-failrate',
          ].map((k) => (
            <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2 }} key={k}>
              <Skeleton
                variant='rectangular'
                height={96}
                sx={{ borderRadius: 2 }}
              />
            </Grid>
          ))}
        </Grid>
        <Grid container spacing={2}>
          {['chart-donut', 'chart-app', 'chart-tester'].map((k) => (
            <Grid size={{ xs: 12, sm: 6, lg: 4 }} key={k}>
              <Skeleton
                variant='rectangular'
                height={280}
                sx={{ borderRadius: 2 }}
              />
            </Grid>
          ))}
        </Grid>
        <Skeleton variant='rectangular' height={320} sx={{ borderRadius: 2 }} />
        <Grid container spacing={2}>
          {['summary-left', 'summary-right'].map((k) => (
            <Grid size={{ xs: 12, md: 6 }} key={k}>
              <Skeleton
                variant='rectangular'
                height={240}
                sx={{ borderRadius: 2 }}
              />
            </Grid>
          ))}
        </Grid>
      </Stack>
    );
  }

  // ── Settled dashboard ─────────────────────────────────────────────────────
  const { summary, moduleGroups, testerGroups, modulesByApp } = data;
  const donutData = buildDonutData(summary);
  const moduleBarData = buildModuleBarData(moduleGroups);
  const appBarData = buildAppBarData(modulesByApp);
  const testerBarData = buildTesterBarData(testerGroups);

  const isArchived = activeRelease?.archived ?? false;

  return (
    <ChartHoverProvider>
      <Stack spacing={2.5}>
        <PageHeader
          eyebrow='QA Regression Control Center'
          title='Dashboard'
          sub='Live metrics for the active release and environment'
          actions={
            <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
              {releaseName && (
                <Chip
                  label={releaseName}
                  color='primary'
                  size='small'
                  sx={{ fontWeight: 600 }}
                />
              )}
              {isArchived && (
                <Chip
                  label='Archived'
                  color='warning'
                  size='small'
                  sx={{ fontWeight: 600 }}
                />
              )}
            </Stack>
          }
        />

        <MetricCards
          cards={[
            {
              label: 'Total Test Cases',
              value: summary.total,
              sub: 'All imported',
            },
            {
              label: 'Passed',
              value: summary.passed,
              cls: 'pass',
              sub: 'Validated',
            },
            {
              label: 'Failed',
              value: summary.failed,
              cls: 'fail',
              sub: 'Needs attention',
            },
            {
              label: 'Pending',
              value: summary.pending,
              cls: 'pending',
              sub: 'Awaiting result',
            },
            {
              label: 'Pass Rate',
              value: `${summary.passPercent}%`,
              sub: 'Of total',
            },
            {
              label: 'Fail Rate',
              value: `${summary.failPercent}%`,
              sub: 'Of total',
            },
          ]}
        />

        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
            <Panel title='Pass / Fail / Pending'>
              <Box sx={{ p: 2.5, height: 280 }}>
                <DonutChart donutData={donutData} />
              </Box>
            </Panel>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
            <Panel title='Application Summary'>
              <Box sx={{ p: 2.5, height: 280 }}>
                <StackedBarChart
                  data={appBarData}
                  orientation='vertical'
                  scaleType='percentage'
                  title='Application Summary'
                  navTo={{ filterKey: 'applicationId', valueField: 'appId' }}
                />
              </Box>
            </Panel>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
            <Panel title='QA Tester Summary'>
              <Box sx={{ p: 2.5, height: 280 }}>
                <StackedBarChart
                  data={testerBarData}
                  orientation='horizontal'
                  scaleType='count'
                  title='QA Tester Summary'
                  emptyLabel='Unassigned'
                  minBarSize={3}
                  navTo={{
                    filterKey: 'testedBy',
                    valueField: 'name',
                    encode: true,
                  }}
                />
              </Box>
            </Panel>
          </Grid>
        </Grid>

        <Panel title='Results by Module'>
          <Box sx={{ p: 2.5, height: 380 }}>
            <StackedBarChart
              data={moduleBarData}
              orientation='vertical'
              scaleType='count'
              title='Results by Module'
              sortBy='total'
              minBarSize={3}
              rotateLabels
              navTo={{ filterKey: 'moduleId', valueField: 'moduleId' }}
            />
          </Box>
        </Panel>

        <Grid container spacing={2}>
          {Object.entries(modulesByApp)
            .sort(compareAppOrder)
            .map(([appName, app]) => (
              <Grid size={{ xs: 12, md: 6 }} key={appName}>
                <SummaryPanel
                  title={appName}
                  groups={app.modules}
                  headerStats={{
                    passed: app.passed,
                    failed: app.failed,
                    pending: app.pending,
                  }}
                />
              </Grid>
            ))}
        </Grid>
      </Stack>
    </ChartHoverProvider>
  );
}
