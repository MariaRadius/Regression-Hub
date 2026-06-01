import Grid from '@mui/material/Grid';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import PageHeader from '@/components/PageHeader';
import Panel from '@/components/Panel';

export default function ReportsLoading() {
  return (
    <Stack spacing={3}>
      {/* PageHeader skeleton */}
      <PageHeader
        eyebrow={<Skeleton variant='text' width={60} height={14} />}
        title={<Skeleton variant='text' width={100} height={36} />}
        sub={<Skeleton variant='text' width={320} height={16} />}
      />

      {/* Overview panel skeleton - 5 metric cards */}
      <Panel
        title={<Skeleton variant='text' width={80} height={28} />}
        headerActions={
          <Stack direction='row' spacing={1}>
            <Skeleton variant='rounded' width={80} height={24} />
            <Skeleton variant='rounded' width={64} height={24} />
          </Stack>
        }
      >
        <Stack spacing={2} sx={{ p: 3 }}>
          <Grid container spacing={1.5}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Grid key={n} size={{ xs: 6, sm: 4, md: 'grow' }}>
                <Skeleton variant='rounded' height={76} />
              </Grid>
            ))}
          </Grid>
          <Skeleton variant='rounded' height={8} />
        </Stack>
      </Panel>

      {/* Application Breakdown panel skeleton */}
      <Panel title={<Skeleton variant='text' width={180} height={28} />}>
        <Stack>
          {[1, 2, 3].map((n) => (
            <Stack
              key={n}
              direction='row'
              spacing={2}
              sx={{
                px: 2.5,
                py: 1.5,
                borderBottom: n < 3 ? 1 : 0,
                borderColor: 'divider',
                alignItems: 'center',
              }}
            >
              <Skeleton variant='text' width={140} />
              <Skeleton variant='text' width={36} sx={{ ml: 'auto' }} />
              <Skeleton variant='text' width={36} />
              <Skeleton variant='text' width={36} />
              <Skeleton variant='text' width={36} />
              <Skeleton variant='rounded' width={100} height={14} />
            </Stack>
          ))}
        </Stack>
      </Panel>

      {/* Export panel skeleton */}
      <Panel title={<Skeleton variant='text' width={60} height={28} />}>
        <Stack spacing={1.75} sx={{ p: 3 }}>
          <Skeleton variant='rounded' height={56} sx={{ maxWidth: 320 }} />
          <Stack direction='row' spacing={1.25}>
            <Skeleton variant='rounded' width={128} height={36} />
            <Skeleton variant='rounded' width={168} height={36} />
          </Stack>
        </Stack>
      </Panel>
    </Stack>
  );
}
