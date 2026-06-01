import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ROLES } from '@/lib/constants';
import { getTeamSettings } from '@/lib/db/settingsData';
import { getDb } from '@/lib/mongodb';
import AssignmentsClient from './AssignmentsClient';

// Required: router.refresh() in AssignmentsClient re-fetches after mutations — must not cache
export const dynamic = 'force-dynamic';

export default async function AssignmentsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/');

  const isAdmin = session.user.role === ROLES.ADMIN;
  const db = await getDb();

  const { qaUsers } = await getTeamSettings(db, session.user.teamId);

  return <AssignmentsClient isAdmin={isAdmin} qaUsers={qaUsers} />;
}
