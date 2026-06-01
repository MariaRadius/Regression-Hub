import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Toolbar from '@mui/material/Toolbar';
import { getServerSession } from 'next-auth';
import ReleaseContextBar from '@/components/ReleaseContextBar';
import TopNav from '@/components/TopNav';
import { ReleaseEnvProvider } from '@/contexts/ReleaseEnvContext';
import { authOptions } from '@/lib/auth';
import { listReleases } from '@/lib/db/releasesData';
import { getDb } from '@/lib/mongodb';

export default async function AppLayout({ children }) {
  const session = await getServerSession(authOptions);
  const user = session?.user;

  // Non-archived releases, newest-first — seeds the release/environment
  // working context and the persistent ReleaseContextBar selector. Guard the
  // DB call against a falsy teamId.
  const releases = user?.teamId
    ? await listReleases(await getDb(), user.teamId)
    : [];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <TopNav user={user} />
      <Toolbar />
      <ReleaseEnvProvider releases={releases}>
        <ReleaseContextBar releases={releases} />
        <Container component='main' maxWidth='lg' sx={{ py: 4 }}>
          {children}
        </Container>
      </ReleaseEnvProvider>
    </Box>
  );
}
