import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { listApplications } from '@/lib/db/applicationsData';
import { listModules } from '@/lib/db/modulesData';
import { getTeamSettings } from '@/lib/db/settingsData';
import { getAiGeneratedTestCases } from '@/lib/db/testCasesData';
import { getDb } from '@/lib/mongodb';
import { isAiConfigured } from '@/lib/server/aiClient';
import GenerateClient from './GenerateClient';

export default async function GeneratePage() {
  const session = await getServerSession(authOptions);
  const db = await getDb();

  const [settings, applications, modules, initialData] = await Promise.all([
    getTeamSettings(db, session.user.teamId),
    listApplications(db, session.user.teamId),
    listModules(db, session.user.teamId),
    getAiGeneratedTestCases(db, session.user.teamId, { page: 1, pageSize: 20 }),
  ]);

  return (
    <GenerateClient
      aiConfigured={isAiConfigured(settings)}
      applications={applications}
      modules={modules}
      initialCases={initialData.cases}
      initialTotal={initialData.total}
    />
  );
}
