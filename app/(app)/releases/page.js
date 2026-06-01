import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ROLES } from '@/lib/constants';
import { listReleases } from '@/lib/db/releasesData';
import { getDb } from '@/lib/mongodb';
import ReleasesClient from './ReleasesClient';

export const dynamic = 'force-dynamic';

export default async function ReleasesPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect('/login');
  }

  const { user } = session;

  if (user.role !== ROLES.ADMIN && user.role !== ROLES.QA) {
    redirect('/dashboard');
  }

  const db = await getDb();

  // Fetch all releases (active + archived) so the table can show the full picture.
  const releases = await listReleases(db, user.teamId, {
    includeArchived: true,
  });

  return <ReleasesClient user={user} releases={releases} />;
}
