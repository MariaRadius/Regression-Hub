import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Toolbar from '@mui/material/Toolbar';
import { getServerSession } from 'next-auth';
import TopNav from '@/components/TopNav';
import { authOptions } from '@/lib/auth';

export default async function AppLayout({ children }) {
  const session = await getServerSession(authOptions);
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <TopNav user={session?.user} />
      <Toolbar />
      <Container component='main' maxWidth='lg' sx={{ py: 4 }}>
        {children}
      </Container>
    </Box>
  );
}
