import { NextResponse } from 'next/server';
import { CACHE_CONTROL } from '@/lib/constants';
import { getCachedDashboardData } from '@/lib/db/dashboardData';
import { withTeam } from '@/lib/server/withTeam';

export const GET = withTeam(
  async (request, _ctx, { teamId }) => {
    const applicationId =
      new URL(request.url).searchParams.get('applicationId') || '';
    const data = await getCachedDashboardData(teamId, applicationId);
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': CACHE_CONTROL.SHORT,
      },
    });
  },
  { includeDb: false },
);
