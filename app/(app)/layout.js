import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Toolbar from '@mui/material/Toolbar';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import AuthHistoryGuard from '@/components/AuthHistoryGuard';
import TopNav from '@/components/TopNav';
import { ReleaseEnvProvider } from '@/contexts/ReleaseEnvContext';
import { authOptions } from '@/lib/auth';
import { listReleases } from '@/lib/db/releasesData';
import { getDb } from '@/lib/mongodb';
import { parseReleaseCtxCookie, RELEASE_CTX_COOKIE } from '@/lib/releaseCtx';

export default async function AppLayout({ children }) {
  const session = await getServerSession(authOptions);
  const user = session?.user;

  if (!user?.teamId) {
    redirect('/login?reason=auth-required');
  }

  // Non-archived releases, newest-first — seeds the release/environment
  // working context. Guard the DB call against a falsy teamId.
  const releases = await listReleases(await getDb(), user.teamId);

  // Seed the provider with the persisted selection from the release-context
  // cookie so the server renders the same release the client will resolve to —
  // avoiding a first-paint flash and hydration mismatch. The provider
  // re-validates the seed against `releases`.
  const ssrSeed = parseReleaseCtxCookie(
    (await cookies()).get(RELEASE_CTX_COOKIE)?.value,
  );

  return (
    <Stack sx={{ minHeight: '100vh' }}>
      <ReleaseEnvProvider releases={releases} ssrSeed={ssrSeed}>
        <AuthHistoryGuard />
        <TopNav user={user} />
        <Toolbar />
        <Container component='main' maxWidth='lg' sx={{ py: 4 }}>
          {children}
        </Container>
      </ReleaseEnvProvider>
    </Stack>
  );
}
