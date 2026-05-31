'use client';

import { Alert, Button, Stack } from '@mui/material';

export default function TestCasesError({ error, reset }) {
  return (
    <Stack spacing={2} sx={{ py: 4 }}>
      <Alert severity='error'>
        {error?.message || 'Something went wrong loading test cases.'}
      </Alert>
      <Stack sx={{ alignItems: 'center' }}>
        <Button variant='contained' onClick={reset}>
          Try Again
        </Button>
      </Stack>
    </Stack>
  );
}
