'use client';

import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlined';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import EmptyState from '@/components/EmptyState';

export default function DashboardError({ error: _error, reset }) {
  return (
    <EmptyState
      icon={<ErrorOutlineIcon sx={{ fontSize: 48, color: 'error.main' }} />}
      title='Dashboard failed to load'
    >
      <Typography variant='body2' color='text.secondary' sx={{ mt: 1, mb: 2 }}>
        An unexpected error occurred while loading the dashboard. Try again or
        contact support if the problem persists.
      </Typography>
      <Button variant='contained' onClick={reset}>
        Try again
      </Button>
    </EmptyState>
  );
}
