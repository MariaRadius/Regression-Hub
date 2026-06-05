import { NextResponse } from 'next/server';
import { listAdminActivity } from '@/lib/db/adminActivityData';
import { withAdmin } from '@/lib/server/withTeam';

export const GET = withAdmin(async (request, _ctx, { teamId, db }) => {
  const limit = Number(new URL(request.url).searchParams.get('limit') || 100);
  const events = await listAdminActivity(db, teamId, { limit });
  return NextResponse.json(events);
});
