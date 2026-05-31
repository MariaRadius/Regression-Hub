import { NextResponse } from 'next/server';
import { CACHE_CONTROL } from '@/lib/constants';
import { listApplications } from '@/lib/db/applicationsData';
import { withTeam } from '@/lib/server/withTeam';

export const GET = withTeam(async (_req, _ctx, { teamId, db }) => {
  const applications = await listApplications(db, teamId);
  return NextResponse.json(applications, {
    headers: {
      'Cache-Control': CACHE_CONTROL.LONG,
    },
  });
});
