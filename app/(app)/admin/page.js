import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ROLES } from '@/lib/constants';
import { listApplications } from '@/lib/db/applicationsData';
import { getTeamSettings } from '@/lib/db/settingsData';
import { getDb } from '@/lib/mongodb';
import AdminClient from './AdminClient';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== ROLES.ADMIN) redirect('/dashboard');
  const db = await getDb();
  const [settings, appsRaw] = await Promise.all([
    getTeamSettings(db, session.user.teamId),
    listApplications(db, session.user.teamId),
  ]);
  const applications = appsRaw.map(({ _id, name, initial }) => ({
    _id,
    name,
    initial,
  }));
  return (
    <AdminClient
      user={session.user}
      settings={settings}
      applications={applications}
    />
  );
}
