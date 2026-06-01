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
        title={<Skeleton variant='text' width={100} height={36} />}
        sub={<Skeleton variant='text' width={480} height={16} />}
      />

      {/* Context bar skeleton — release chip + environment chip */}
      <Stack direction='row' spacing={1}>
        <Skeleton variant='rounded' width={80} height={24} />
        <Skeleton variant='rounded' width={64} height={24} />
      </Stack>

      {/* Overview panel skeleton — 5 metric cards + pass-rate bar */}
      <Panel title={<Skeleton variant='text' width={80} height={28} />}>
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

      {/* Download PDF panel skeleton */}
      <Panel title={<Skeleton variant='text' width={120} height={28} />}>
        <Stack spacing={2} sx={{ p: 3 }}>
          <Skeleton variant='rounded' height={48} />
          <Skeleton variant='rounded' width={144} height={36} />
        </Stack>
      </Panel>

      {/* Export Excel panel skeleton */}
      <Panel title={<Skeleton variant='text' width={120} height={28} />}>
        <Stack spacing={2} sx={{ p: 3 }}>
          <Skeleton variant='rounded' height={48} />
          <Stack spacing={0.5}>
            <Skeleton variant='rounded' width={144} height={36} />
            <Skeleton variant='text' width={200} height={16} />
          </Stack>
        </Stack>
      </Panel>

      {/* Version History panel skeleton — alert + 3 table rows */}
      <Panel title={<Skeleton variant='text' width={140} height={28} />}>
        <Stack spacing={2} sx={{ p: 3 }}>
          <Skeleton variant='rounded' height={48} />
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
                <Skeleton variant='text' width={80} />
                <Skeleton variant='rounded' width={64} height={24} />
                <Skeleton variant='text' width={140} sx={{ ml: 'auto' }} />
                <Skeleton variant='text' width={80} />
                <Skeleton variant='rounded' width={90} height={30} />
              </Stack>
            ))}
          </Stack>
        </Stack>
      </Panel>
    </Stack>
  );
}
