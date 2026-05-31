'use client';

import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlineRounded';
import { Box, Button, Paper, Stack, Typography } from '@mui/material';

export default function UsersError({ error, reset }) {
  return (
    <Stack spacing={3}>
      {/* PageHeader skeleton matches settled layout: eyebrow + h1 */}
      <Stack spacing={0.5} sx={{ mb: 3 }}>
        <Typography variant='pageEyebrow'>Admin</Typography>
        <Typography variant='pageTitle'>User Management</Typography>
      </Stack>

      {/* Panel — matches Paper variant='outlined' > PanelHeader + content */}
      <Paper variant='outlined'>
        <Box
          sx={{
            px: 2,
            py: 1.5,
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <Typography variant='panelTitle' component='h2'>
            Users
          </Typography>
        </Box>

        {/* EmptyState composition per CLAUDE.md: icon + title + subtitle + action */}
        <Stack
          spacing={1}
          sx={{ py: 5, alignItems: 'center', textAlign: 'center' }}
        >
          <ErrorOutlineIcon sx={{ fontSize: 48, color: 'error.main' }} />
          <Typography variant='emptyStateTitle' color='text.disabled'>
            Something went wrong
          </Typography>
          <Typography variant='body2' color='text.secondary'>
            {error?.message || 'Failed to load users'}
          </Typography>
          <Button variant='contained' size='small' onClick={reset}>
            Try again
          </Button>
        </Stack>
      </Paper>
    </Stack>
  );
}
