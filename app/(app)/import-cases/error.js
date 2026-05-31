'use client';

import { Alert, Button, Stack, Typography } from '@mui/material';
import { useEffect } from 'react';

export default function ImportCasesError({ error, reset }) {
  useEffect(() => {
    // Log digest (not message) to avoid leaking server internals to console
    if (error?.digest)
      console.error('Import Cases error digest:', error.digest);
  }, [error]);

  return (
    <Stack spacing={2} sx={{ p: 5, alignItems: 'center' }}>
      <Alert severity='error' sx={{ width: '100%', maxWidth: 480 }}>
        {error?.digest
          ? 'Something went wrong loading the import page.'
          : error?.message || 'Something went wrong. Try refreshing the page.'}
      </Alert>
      <Typography variant='panelTitle' component='h2'>
        Failed to Load Import Cases
      </Typography>
      <Button variant='contained' onClick={reset}>
        Try Again
      </Button>
      {error?.digest && (
        <Typography variant='tableCell' color='text.disabled'>
          Error ID: {error.digest}
        </Typography>
      )}
    </Stack>
  );
}
