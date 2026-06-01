import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import PageHeader from '@/components/PageHeader';
import Panel from '@/components/Panel';

/** Skeleton for one environment card — mirrors <ReportCard> dimensions. */
function CardSkeleton() {
  return (
    <Paper variant='outlined' sx={{ p: 2, borderLeftWidth: 4 }}>
      <Stack spacing={2}>
        <Stack
          direction='row'
          spacing={1}
          sx={{ justifyContent: 'space-between' }}
        >
          <Skeleton variant='text' width={48} height={20} />
          <Skeleton variant='rounded' width={56} height={24} />
        </Stack>
        <Stack spacing={0.25}>
          <Skeleton variant='text' width={140} height={20} />
          <Skeleton variant='text' width={80} height={16} />
        </Stack>
        <Stack spacing={1}>
          <Skeleton variant='rounded' height={32} />
          <Stack direction='row' spacing={1}>
            <Skeleton variant='rounded' height={32} sx={{ flex: 1 }} />
            <Skeleton variant='rounded' height={32} sx={{ flex: 1 }} />
          </Stack>
        </Stack>
      </Stack>
    </Paper>
  );
}

export default function ReportsLoading() {
  return (
    <Stack spacing={3}>
      {/* PageHeader skeleton */}
      <PageHeader
        title={<Skeleton variant='text' width={100} height={36} />}
        sub={<Skeleton variant='text' width={480} height={16} />}
      />

      {/* Guidance Alert skeleton */}
      <Skeleton variant='rounded' height={64} />

      {/* Two release panels, each with a grid of environment cards */}
      {[1, 2].map((p) => (
        <Panel
          key={p}
          title={<Skeleton variant='text' width={120} height={28} />}
        >
          <Grid container spacing={2} sx={{ p: 3 }}>
            {[1, 2, 3].map((n) => (
              <Grid key={n} size={{ xs: 12, sm: 6, md: 4 }}>
                <CardSkeleton />
              </Grid>
            ))}
          </Grid>
        </Panel>
      ))}
    </Stack>
  );
}
