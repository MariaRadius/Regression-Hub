import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAssignmentsPageData } from '@/lib/db/assignmentsData';
import { getDb } from '@/lib/mongodb';
import AssignmentsClient from './AssignmentsClient';

// Required: router.refresh() in AssignmentsClient re-fetches after mutations — must not cache
export const dynamic = 'force-dynamic';

export default async function AssignmentsPage({ searchParams }) {
  const session = await getServerSession(authOptions);
  const resolvedParams = await searchParams;
  const view = resolvedParams?.view === 'sent' ? 'sent' : 'mine';

  const db = await getDb();
  const data = await getAssignmentsPageData(db, session.user.teamId, {
    userName: session.user.name,
    view,
  });

  return (
    <AssignmentsClient
      view={view}
      assignments={data.assignments}
      modules={data.modules}
      moduleCounts={data.moduleCounts}
      qaUsers={data.qaUsers}
    />
  );
}
