import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ROLES } from '@/lib/constants';
import { listApplications } from '@/lib/db/applicationsData';
import { getUsers } from '@/lib/db/usersData';
import { getDb } from '@/lib/mongodb';
import ImportCasesClient from './ImportCasesClient';

export default async function ImportCasesPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/dashboard');
  if (session.user.role !== ROLES.ADMIN) redirect('/dashboard');

  const db = await getDb();
  const teamId = session.user.teamId;

  const [roster, knownApps] = await Promise.allSettled([
    getUsers(db, teamId),
    listApplications(db, teamId),
  ]);

  return (
    <ImportCasesClient
      roster={roster.status === 'fulfilled' ? (roster.value ?? []) : null}
      knownApps={
        knownApps.status === 'fulfilled' ? (knownApps.value ?? []) : null
      }
    />
  );
}
