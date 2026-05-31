'use client';

import { Alert, Box, Button, Stack, TextField } from '@mui/material';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { useState } from 'react';

export default function LoginForm({ redirectTo }) {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await signIn('credentials', {
      username,
      password,
      redirect: false,
    });
    setLoading(false);
    if (result?.error) {
      setError('Invalid username or password.');
    } else {
      router.push(redirectTo || '/dashboard');
    }
  }

  return (
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
  );
}
