import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ROLES } from '@/lib/constants';
import { getTeamSettings } from '@/lib/db/settingsData';
import { getDb } from '@/lib/mongodb';
import ImportCasesClient from './ImportCasesClient';

export default async function ImportCasesPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/dashboard');
  if (session.user.role !== ROLES.ADMIN) redirect('/dashboard');

  const db = await getDb();
  const settings = await getTeamSettings(db, session.user.teamId);

  return (
    <ImportCasesClient
      initialEnv={settings.testEnvironment ?? ''}
      initialVersion={settings.softwareVersion ?? ''}
    />
  );
}
