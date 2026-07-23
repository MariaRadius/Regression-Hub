'use client';

import {
  Alert,
  Box,
  Button,
  LinearProgress,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { useState } from 'react';
import AuthHistoryGuard from '@/components/AuthHistoryGuard';
import { getSafeRedirectTarget } from '@/lib/authRedirects';

function getAccessMessage(reason) {
  if (reason === 'signed-out') {
    return {
      severity: 'info',
      text: 'You signed out successfully. Sign in again to continue.',
    };
  }
  if (reason === 'auth-required') {
    return {
      severity: 'warning',
      text: 'Your session is no longer active. Sign in to continue.',
    };
  }
  return null;
}

export default function LoginForm({ redirectTo, reason }) {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const message = getAccessMessage(reason);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await signIn('credentials', {
      username,
      password,
      redirect: false,
    });
    if (result?.error) {
      setLoading(false);
      setError('Invalid username or password.');
    } else {
      // Keep loading=true through the post-auth redirect so the spinner
      // and progress bar persist until the new page is painted.
      await fetch('/api/auth/validate-ctx', { method: 'POST' }).catch(() => {});
      router.replace(getSafeRedirectTarget(redirectTo));
    }
  }

  return (
    <Paper
      elevation={8}
      sx={{
        position: 'relative',
        overflow: 'hidden',
        px: { xs: 4, sm: 5 },
        py: { xs: 4, sm: 6 },
        width: '100%',
        maxWidth: 400,
        borderRadius: 3,
      }}
    >
      {/* Full-width progress bar pinned to top edge of card — visible throughout
          the sign-in call and the post-auth navigation. */}
      {loading && (
        <LinearProgress
          sx={{ position: 'absolute', top: 0, left: 0, right: 0 }}
        />
      )}

      <AuthHistoryGuard />

      <Box sx={{ textAlign: 'center', mb: 4 }}>
        <Stack
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 56,
            height: 56,
            borderRadius: 1.5,
            bgcolor: 'primary.main',
            color: '#fff',
            fontWeight: 700,
            fontSize: 20,
            mb: 2,
          }}
        >
          QA
        </Stack>
        <Typography variant='pageTitle' component='h1' display='block'>
          Test Atlas
        </Typography>
        <Typography variant='pageSub' color='text.secondary' display='block'>
          Sign in to your team account
        </Typography>
      </Box>

      {message && (
        <Alert severity={message.severity} sx={{ mb: 3 }}>
          {message.text}
        </Alert>
      )}

      <Box component='form' onSubmit={handleSubmit}>
        <Stack spacing={2} sx={{ mb: 3 }}>
          <TextField
            label='Username'
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder='e.g. qa-radius'
            required
            autoFocus
            slotProps={{ inputLabel: { shrink: true } }}
            fullWidth
            disabled={loading}
          />
          <TextField
            label='Password'
            type='password'
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder='Enter your password'
            required
            slotProps={{ inputLabel: { shrink: true } }}
            fullWidth
            disabled={loading}
          />
        </Stack>
        {error && (
          <Alert severity='error' sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Button
          type='submit'
          variant='contained'
          fullWidth
          loading={loading}
          loadingPosition='center'
          size='large'
          sx={{ fontWeight: 600 }}
        >
          Sign In
        </Button>
      </Box>

      <Typography
        variant='metricSub'
        color='text.disabled'
        sx={{ textAlign: 'center', mt: 3 }}
        display='block'
      >
        Contact your admin if you need access.
      </Typography>
    </Paper>
  );
}
