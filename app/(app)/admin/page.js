import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ROLES } from '@/lib/constants';
import { getTeamSettings } from '@/lib/db/settingsData';
import { getDb } from '@/lib/mongodb';
import AdminClient from './AdminClient';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== ROLES.ADMIN) redirect('/dashboard');
  const db = await getDb();
  const settings = await getTeamSettings(db, session.user.teamId);
  return <AdminClient user={session.user} settings={settings} />;
}
