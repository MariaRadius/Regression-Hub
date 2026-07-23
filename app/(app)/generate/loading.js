import { Grid, Paper, Skeleton, Stack } from '@mui/material';

/** Skeleton that dimensionally matches the settled GenerateClient page. */
export default function GenerateLoading() {
  return (
    <Stack spacing={3} sx={{ p: { xs: 2, sm: 3 } }}>
      {/* PageHeader — matches Stack direction='row' justifyContent='space-between' */}
      <Stack
        direction='row'
        sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}
      >
        <Stack spacing={0.5}>
          <Skeleton variant='text' width={52} height={13} />
          <Skeleton variant='text' width={200} height={30} />
        </Stack>
      </Stack>

      {/* Two-column grid: JiraStoriesPanel (left) + GenerateStoryForm (right) */}
      <Grid container spacing={2}>
        <Grid size={6}>
          <Paper variant='outlined' sx={{ p: 2, height: 320 }}>
            <Stack spacing={1.5}>
              <Skeleton variant='text' width={160} height={22} />
              <Skeleton variant='text' width='80%' height={16} />
              <Skeleton variant='rounded' width='100%' height={44} />
              <Skeleton variant='rounded' width='100%' height={44} />
              <Skeleton variant='rounded' width='100%' height={44} />
            </Stack>
          </Paper>
        </Grid>
        <Grid size={6}>
          <Paper variant='outlined' sx={{ p: 2, height: 320 }}>
            <Stack spacing={1.5}>
              <Skeleton variant='text' width={140} height={22} />
              <Skeleton variant='rounded' width='100%' height={40} />
              <Skeleton variant='rounded' width='100%' height={40} />
              <Skeleton variant='rounded' width='100%' height={40} />
              <Skeleton
                variant='rounded'
                width={120}
                height={36}
                sx={{ alignSelf: 'flex-end' }}
              />
            </Stack>
          </Paper>
        </Grid>
      </Grid>

      {/* AI-Generated Cases section header */}
      <Stack spacing={1.5}>
        <Stack direction='row' spacing={1.5} sx={{ alignItems: 'center' }}>
          <Skeleton variant='circular' width={18} height={18} />
          <Skeleton variant='text' width={160} height={22} />
          <Skeleton variant='rounded' width={30} height={20} />
          <Stack direction='row' spacing={1.5} sx={{ ml: 'auto' }}>
            <Skeleton variant='rounded' width={160} height={36} />
            <Skeleton variant='rounded' width={140} height={36} />
          </Stack>
        </Stack>

        {/* Case cards */}
        {['c1', 'c2', 'c3', 'c4'].map((key) => (
          <Paper key={key} variant='outlined' sx={{ p: 2 }}>
            <Stack
              direction='row'
              spacing={2}
              sx={{ alignItems: 'flex-start' }}
            >
              <Skeleton variant='rounded' width={56} height={20} />
              <Stack spacing={0.5} sx={{ flex: 1 }}>
                <Skeleton variant='text' width='70%' height={18} />
                <Skeleton variant='text' width='45%' height={14} />
              </Stack>
              <Skeleton variant='circular' width={28} height={28} />
            </Stack>
          </Paper>
        ))}
      </Stack>
    </Stack>
  );
}
