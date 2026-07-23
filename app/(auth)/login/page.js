import Stack from '@mui/material/Stack';
import LoginForm from './LoginForm';

export default async function LoginPage({ searchParams }) {
  const params = await searchParams;

  return (
    <Stack
      sx={{
        minHeight: '100vh',
        alignItems: 'center',
        justifyContent: 'center',
        // Nav gradient: RSC cannot useTheme(); values match palette.nav.dark → nav.main
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      }}
    >
      <LoginForm redirectTo={params?.redirectTo} reason={params?.reason} />
    </Stack>
  );
}
