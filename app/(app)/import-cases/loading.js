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

      {/* ImportCasesClient outer Paper skeleton (p: 2, Stack spacing={2}) */}
      <Paper variant='outlined' sx={{ p: 2 }}>
        <Stack spacing={2}>
          {/* Import-environment select (maxWidth 320, height 40 + helperText line) */}
          <Stack spacing={0.5}>
            <Skeleton variant='rounded' width={320} height={40} />
            <Skeleton variant='text' width={300} height={16} />
          </Stack>

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
            <Skeleton
              variant='circular'
              width={36}
              height={36}
              sx={{ mb: 1 }}
            />
            <Skeleton variant='text' width={220} height={20} />
            <Skeleton variant='text' width={180} height={16} sx={{ mt: 0.5 }} />
          </Paper>

          {/* Analyse button row — right-aligned, matches Button size='small' height */}
          <Stack direction='row' sx={{ justifyContent: 'flex-end' }}>
            <Skeleton variant='rounded' width={140} height={30} />
          </Stack>
        </Stack>
      </Paper>
    </Stack>
  );
}
