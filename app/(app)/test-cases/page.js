import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { listTestCases } from '@/lib/db/testCasesData';
import { getDb } from '@/lib/mongodb';
import TestCasesClient from './TestCasesClient';

export default async function TestCasesPage() {
  const session = await getServerSession(authOptions);
  const db = await getDb();
  const initialData = await listTestCases(db, session.user.teamId, {
    includeMeta: true,
  });
  return <TestCasesClient user={session.user} initialData={initialData} />;
}
