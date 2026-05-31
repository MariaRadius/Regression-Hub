import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';

export default function ImportCasesLoading() {
  return (
    <Stack>
      {/* PageHeader skeleton — eyebrow + title + sub, matches mb: 3 from PageHeader */}
      <Stack spacing={0.5} sx={{ mb: 3 }}>
        <Skeleton variant='text' width={200} height={16} />
        <Skeleton variant='text' width={320} height={32} />
        <Skeleton variant='text' width={420} height={20} />
      </Stack>

      {/* UploadExcel outer Paper skeleton */}
      <Paper variant='outlined' sx={{ p: 2 }}>
        {/* Dropzone Paper — p: 3, centered content: icon + 2 text lines */}
        <Paper
          variant='outlined'
          sx={{
            borderRadius: 2,
            p: 3,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <Skeleton variant='circular' width={36} height={36} sx={{ mb: 1 }} />
          <Skeleton variant='text' width={220} height={20} />
          <Skeleton variant='text' width={180} height={16} sx={{ mt: 0.5 }} />
        </Paper>

        {/* 2-column text fields row */}
        <Grid container spacing={1.5} sx={{ mt: 1.5 }}>
          <Grid size={6}>
            <Skeleton variant='rounded' height={40} />
          </Grid>
          <Grid size={6}>
            <Skeleton variant='rounded' height={40} />
          </Grid>
        </Grid>

        {/* Import button row — right-aligned, matches Button size='small' height */}
        <Stack direction='row' sx={{ justifyContent: 'flex-end', mt: 1.5 }}>
          <Skeleton variant='rounded' width={72} height={30} />
        </Stack>
      </Paper>
    </Stack>
  );
}
