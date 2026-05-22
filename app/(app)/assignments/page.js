import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAssignmentsPageData } from '@/lib/assignmentsData';
import AssignmentsClient from './AssignmentsClient';

export const dynamic = 'force-dynamic';

export default async function AssignmentsPage({ searchParams }) {
  const session = await getServerSession(authOptions);
  const resolvedParams = await searchParams;
  const view = resolvedParams?.view === 'sent' ? 'sent' : 'mine';

  const data = await getAssignmentsPageData({
    teamId: session.user.teamId,
    userName: session.user.name,
    view,
  });

  return (
    <AssignmentsClient
      user={session.user}
      view={view}
      assignments={data.assignments}
      modules={data.modules}
      moduleCounts={data.moduleCounts}
      qaUsers={data.qaUsers}
    />
  );
}
