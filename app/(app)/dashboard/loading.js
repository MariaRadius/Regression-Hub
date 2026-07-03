import Grid from '@mui/material/Grid';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';

const METRIC_CARD_KEYS = [
  'tc-total',
  'tc-pass',
  'tc-fail',
  'tc-pending',
  'tc-passrate',
  'tc-failrate',
];
const CHART_PANEL_KEYS = ['chart-donut', 'chart-app', 'chart-tester'];
const INSIGHT_PANEL_KEYS = ['insight-modules', 'insight-critical'];
const SUMMARY_PANEL_KEYS = ['summary-left', 'summary-right'];

export default function DashboardLoading() {
  return (
    <Stack spacing={2.5}>
      {/* PageHeader skeleton */}
      <Stack spacing={1}>
        <Skeleton variant='text' width={180} height={16} />
        <Skeleton variant='text' width={140} height={36} />
        <Skeleton variant='text' width={280} height={16} />
      </Stack>

      {/* 6 metric-card skeletons */}
      <Grid container spacing={2}>
        {METRIC_CARD_KEYS.map((k) => (
          <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2 }} key={k}>
            <Skeleton
              variant='rectangular'
              height={96}
              sx={{ borderRadius: 2 }}
            />
          </Grid>
        ))}
      </Grid>

      {/* 3 chart-panel skeletons */}
      <Grid container spacing={2}>
        {CHART_PANEL_KEYS.map((k) => (
          <Grid size={{ xs: 12, sm: 6, lg: 4 }} key={k}>
            <Skeleton
              variant='rectangular'
              height={280}
              sx={{ borderRadius: 2 }}
            />
          </Grid>
        ))}
      </Grid>

      {/* Half-width Failures by Module chart skeleton (centered) */}
      <Grid container spacing={2} sx={{ justifyContent: 'center' }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Skeleton
            variant='rectangular'
            height={280}
            sx={{ borderRadius: 2 }}
          />
        </Grid>
      </Grid>

      {/* Two half-width insight panel skeletons */}
      <Grid container spacing={2}>
        {INSIGHT_PANEL_KEYS.map((k) => (
          <Grid size={{ xs: 12, lg: 6 }} key={k}>
            <Skeleton
              variant='rectangular'
              height={260}
              sx={{ borderRadius: 2 }}
            />
          </Grid>
        ))}
      </Grid>

      {/* Full-width module bar chart skeleton */}
      <Skeleton variant='rectangular' height={320} sx={{ borderRadius: 2 }} />

      {/* Two half-width summary panel skeletons */}
      <Grid container spacing={2}>
        {SUMMARY_PANEL_KEYS.map((k) => (
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
