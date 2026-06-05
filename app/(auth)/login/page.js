import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import AuthHistoryGuard from '@/components/AuthHistoryGuard';
import LoginForm from './LoginForm';

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

export default async function LoginPage({ searchParams }) {
  const params = await searchParams;
  const redirectTo = params?.redirectTo;
  const message = getAccessMessage(params?.reason);

  return (
    <Stack
      sx={{
        minHeight: '100vh',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'nav.dark',
        // Nav gradient: RSC cannot useTheme(); values match palette.nav.dark → nav.main
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      }}
    >
      <Paper
        elevation={8}
        sx={{
          px: { xs: 4, sm: 5 },
          py: { xs: 4, sm: 6 },
          width: '100%',
          maxWidth: 400,
          borderRadius: 3,
        }}
      >
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
            Regression Hub
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
        <LoginForm redirectTo={redirectTo} />
        <Typography
          variant='metricSub'
          color='text.disabled'
          sx={{ textAlign: 'center', mt: 3 }}
          display='block'
        >
          Contact your admin if you need access.
        </Typography>
      </Paper>
    </Stack>
  );
}
