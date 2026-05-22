import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getReportsPageData } from '@/lib/reportsData';
import ReportsClient from './ReportsClient';

export const dynamic = 'force-dynamic';

export default async function ReportsPage({ searchParams }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const resolvedParams = await searchParams;
  const applicationId = resolvedParams?.applicationId || '';

  const data = await getReportsPageData({ teamId: session.user.teamId, applicationId });

  return (
    <ReportsClient
      user={session.user}
      initialVersions={data.versions}
      initialSummary={data.summary}
      initialSettings={data.settings}
      initialApplications={data.applications}
      initialApplicationId={applicationId}
    />
  );
}
