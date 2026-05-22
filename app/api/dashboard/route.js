import { getDashboardData } from '@/lib/db/dashboardData';
import { withTeam } from '@/lib/server/withTeam';
import { NextResponse } from 'next/server';

export const GET = withTeam(async (request, _ctx, { teamId, db }) => {
  const applicationId =
    new URL(request.url).searchParams.get('applicationId') || '';
  const data = await getDashboardData(db, teamId, applicationId);
  return NextResponse.json(data, {
    headers: {
      'Cache-Control': 'private, max-age=10, stale-while-revalidate=30',
    },
  });
});
