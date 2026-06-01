'use client';

import NewReleasesIcon from '@mui/icons-material/NewReleases';
import { Alert, Button, Stack, Typography } from '@mui/material';

/**
 * Error boundary for the /releases segment.
 * Shown when the RSC page throws during data fetching.
 *
 * @param {{ error: Error, reset: () => void }} props
 */
export default function ReleasesError({ error, reset }) {
  return (
    <Stack spacing={3} sx={{ alignItems: 'center', py: 10 }}>
      <NewReleasesIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
      <Typography variant='pageTitle' sx={{ textAlign: 'center' }}>
        Could not load releases
      </Typography>
      <Alert severity='error' sx={{ maxWidth: 480, width: '100%' }}>
        {error?.message ??
          'An unexpected error occurred while loading releases.'}
      </Alert>
      <Button variant='contained' onClick={reset}>
        Try again
      </Button>
    </Stack>
  );
}
