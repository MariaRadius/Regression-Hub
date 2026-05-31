'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import { useEffect } from 'react';

export default function TestRunsError({ error, reset }) {
  useEffect(() => {
    console.error('[TestRunsError]', error);
  }, [error]);

  return (
    <Stack spacing={2} sx={{ py: 4 }}>
      <Alert severity='error'>
        Unable to load test runs. Try again or contact support if the problem
        persists.
      </Alert>
      <Stack sx={{ alignItems: 'center' }}>
        <Button variant='contained' onClick={reset}>
          Try Again
        </Button>
      </Stack>
    </Stack>
  );
}
