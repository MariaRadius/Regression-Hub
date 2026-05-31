'use client';

import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlined';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import EmptyState from '@/components/EmptyState';

export default function ReportsError({ reset }) {
  return (
    <EmptyState
      icon={<ErrorOutlineIcon sx={{ fontSize: 56, color: 'error.main' }} />}
      title='Reports failed to load'
    >
      <Typography
        variant='body2'
        color='text.secondary'
        sx={{ mt: 0.5, mb: 2 }}
      >
        Something went wrong while fetching version history. Your data is safe.
      </Typography>
      <Button variant='contained' onClick={reset}>
        Try again
      </Button>
    </EmptyState>
  );
}
