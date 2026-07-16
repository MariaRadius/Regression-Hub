import LabelOutlinedIcon from '@mui/icons-material/LabelOutlined';
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import EmptyState from '@/components/EmptyState';
import MetaChip from '@/components/MetaChip';
import MetricCards from '@/components/MetricCards';
import PageHeader from '@/components/PageHeader';
import Panel from '@/components/Panel';
import SummaryPanel from '@/components/SummaryPanel';
import { authOptions } from '@/lib/auth';
import { getCachedDashboardData } from '@/lib/db/dashboardData';
import {
  buildAppBarData,
  buildDonutData,
  buildFailByModuleData,
  buildFailBySeverityData,
  buildModuleBarData,
  buildTesterBarData,
} from '@/lib/db/dashboardTransforms';
import { getCachedReleaseKnownIssues } from '@/lib/db/knownIssuesData';
import { resolveActiveReleaseEnv } from '@/lib/db/releasesData';
import { getTeamSettings } from '@/lib/db/settingsData';
import { getDb } from '@/lib/mongodb';
import { parseReleaseCtxCookie, RELEASE_CTX_COOKIE } from '@/lib/releaseCtx';
import { ChartHoverProvider } from './charts/ChartHoverContext';
import DonutChart from './charts/DonutChart';
import FailByModuleChart from './charts/FailByModuleChart';
import FailBySeverityChart from './charts/FailBySeverityChart';
import StackedBarChart from './charts/StackedBarChart';
import DashboardInsightsPanels from './DashboardInsightsPanels';
import DashboardRefresh from './DashboardRefresh';
import KnownIssuesPanel from './KnownIssuesPanel';
import { DASHBOARD_PANEL_BODY_SX, DASHBOARD_PANEL_SX } from './panelStyles';

// Re-execute on every router.refresh() so the RSC re-runs the query with the
// latest selection from the release-context cookie (which the client updates
// when the selection changes).
export const dynamic = 'force-dynamic';

const APP_DISPLAY_ORDER = ['RadiusExam', 'Practice Admin'];

function compareAppOrder([a], [b]) {
  const ia = APP_DISPLAY_ORDER.indexOf(a);
  const ib = APP_DISPLAY_ORDER.indexOf(b);
  if (ia !== -1 || ib !== -1)
    return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib);
  return a.localeCompare(b);
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function formatCount(value) {
  return Number(value || 0).toLocaleString();
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const teamId = session?.user?.teamId;
  if (!teamId) redirect('/');

  // Read the active selection from the release-context cookie (the server-side
  // mirror of the client working context). resolveActiveReleaseEnv validates it
  // against live releases and falls back to the latest release when it is
  // absent, archived, or stale — so the dashboard is never empty on first load.
  const stored = parseReleaseCtxCookie(
    (await cookies()).get(RELEASE_CTX_COOKIE)?.value,
  );
  const db = await getDb();
  const [
    { releaseId, environment },
    { failureThreshold, topModulesLimit, jiraBaseUrl },
  ] = await Promise.all([
    resolveActiveReleaseEnv(db, teamId, stored),
    getTeamSettings(db, teamId),
  ]);

  // No releases exist yet — render an empty state rather than crashing.
  if (!releaseId || !environment) {
    return (
      <Stack spacing={2.5}>
        <PageHeader
          eyebrow='QA Regression Control Center'
          title='Dashboard'
          sub='No releases found — import test cases to get started'
        />
        <DashboardRefresh />
      </Stack>
    );
  }

  const [data, knownIssues] = await Promise.all([
    getCachedDashboardData(teamId, releaseId, environment, {
      failureThreshold,
      topModulesLimit,
    }),
    getCachedReleaseKnownIssues(teamId, releaseId),
  ]);

  const {
    summary,
    criticalSummary,
    topFailingModules,
    criticalFailures,
    failByModule = [],
    failBySeverity = [],
    moduleGroups,
    testerGroups,
    modulesByApp,
  } = data;

  const donutData = buildDonutData(summary);
  const failByModuleData = buildFailByModuleData(failByModule);
  const failBySeverityData = buildFailBySeverityData(failBySeverity);
  const moduleBarData = buildModuleBarData(moduleGroups);
  const appBarData = buildAppBarData(modulesByApp);
  const testerBarData = buildTesterBarData(testerGroups);

  return (
    <ChartHoverProvider>
      <DashboardRefresh />
      <Stack spacing={2.5}>
        <PageHeader
          eyebrow='QA Regression Control Center'
          title='Dashboard'
          sub='Live metrics for the active release and environment'
        />
        <MetricCards
          columns={6}
          cards={[
            {
              label: 'Total Test Cases',
              value: formatCount(summary.total),
              sub: 'All imported',
            },
            {
              label: 'Passed',
              value: formatCount(summary.passed),
              cls: 'pass',
              sub: 'Validated',
            },
            {
              label: 'Failed',
              value: formatCount(summary.failed),
              cls: 'fail',
              sub: 'Needs attention',
            },
            {
              label: 'Pending',
              value: formatCount(summary.pending),
              cls: 'pending',
              sub: 'Awaiting result',
            },
            {
              label: 'Pass Rate',
              value: formatPercent(summary.passPercent),
              sub: 'Of total',
            },
            {
              label: 'Fail Rate',
              value: formatPercent(summary.failPercent),
              sub: 'Of total',
            },
          ]}
        />
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
            <Panel title='Pass / Fail / Pending' sx={DASHBOARD_PANEL_SX}>
              <Box sx={{ ...DASHBOARD_PANEL_BODY_SX, height: 280 }}>
                <DonutChart donutData={donutData} />
              </Box>
            </Panel>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
            <Panel title='Application Summary' sx={DASHBOARD_PANEL_SX}>
              <Box sx={{ ...DASHBOARD_PANEL_BODY_SX, height: 280 }}>
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
            <Panel title='QA Tester Summary' sx={DASHBOARD_PANEL_SX}>
              <Box sx={{ ...DASHBOARD_PANEL_BODY_SX, height: 280 }}>
                <StackedBarChart
                  data={testerBarData}
                  orientation='horizontal'
                  scaleType='count'
                  title='QA Tester Summary'
                  emptyLabel='Unassigned'
                  minBarSize={3}
                  navTo={{
                    filterKey: 'assignedTo',
                    valueField: 'name',
                    encode: true,
                  }}
                />
              </Box>
            </Panel>
          </Grid>
        </Grid>

        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Panel title='Failures by Module' sx={DASHBOARD_PANEL_SX}>
              <Box sx={{ ...DASHBOARD_PANEL_BODY_SX, height: 280 }}>
                {failByModuleData.length > 0 ? (
                  <FailByModuleChart failData={failByModuleData} />
                ) : (
                  <EmptyState
                    icon={
                      <TaskAltOutlinedIcon
                        sx={{ fontSize: 34, color: 'success.main' }}
                      />
                    }
                    title='No failures for this selection'
                  >
                    <Typography
                      variant='pageSub'
                      color='text.disabled'
                      sx={{ textAlign: 'center', maxWidth: 320 }}
                    >
                      Every executed test case has passed or is still pending —
                      nothing has failed in the active release and environment.
                    </Typography>
                  </EmptyState>
                )}
              </Box>
            </Panel>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Panel title='Fail Severity Summary' sx={DASHBOARD_PANEL_SX}>
              <Box sx={{ ...DASHBOARD_PANEL_BODY_SX, height: 280 }}>
                {failBySeverityData.length > 0 ? (
                  <FailBySeverityChart severityData={failBySeverityData} />
                ) : (
                  <EmptyState
                    icon={
                      <TaskAltOutlinedIcon
                        sx={{ fontSize: 34, color: 'success.main' }}
                      />
                    }
                    title='No failures for this selection'
                  >
                    <Typography
                      variant='pageSub'
                      color='text.disabled'
                      sx={{ textAlign: 'center', maxWidth: 320 }}
                    >
                      Failures are grouped by test-case priority
                      (High/Medium/Low); none have been recorded for the active
                      release and environment.
                    </Typography>
                  </EmptyState>
                )}
              </Box>
            </Panel>
          </Grid>
        </Grid>

        <Panel title='Results by Module' sx={DASHBOARD_PANEL_SX}>
          <Box sx={{ ...DASHBOARD_PANEL_BODY_SX, height: 380 }}>
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

        <DashboardInsightsPanels
          topFailingModules={topFailingModules}
          criticalSummary={criticalSummary}
          criticalFailures={criticalFailures}
          failureThreshold={failureThreshold}
        />

        <Panel
          title='Known Issues by Environment'
          headerActions={
            knownIssues.releaseName ? (
              <MetaChip
                icon={<LabelOutlinedIcon fontSize='small' />}
                label={knownIssues.releaseName}
                color='info'
                variant='outlined'
              />
            ) : undefined
          }
          sx={DASHBOARD_PANEL_SX}
        >
          <Box sx={DASHBOARD_PANEL_BODY_SX}>
            <KnownIssuesPanel
              data={knownIssues}
              jiraBaseUrl={jiraBaseUrl ?? null}
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
