import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getTeamSettings } from '@/lib/db/settingsData';
import { getDb } from '@/lib/mongodb';
import { isAiConfigured } from '@/lib/server/aiClient';
import TestCasesClient from './TestCasesClient';

export default async function TestCasesPage() {
  const session = await getServerSession(authOptions);
  const db = await getDb();
  const settings = await getTeamSettings(db, session.user.teamId);
  return (
    <TestCasesClient
      user={session.user}
      aiConfigured={isAiConfigured(settings)}
    />
  );
}
