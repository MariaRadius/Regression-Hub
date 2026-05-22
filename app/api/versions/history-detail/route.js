import { getVersionHistoryDetail } from '@/lib/db/versionsData';
import { ApiError } from '@/lib/errors';
import { withTeam } from '@/lib/server/withTeam';
import { NextResponse } from 'next/server';

export const GET = withTeam(async (request, _ctx, { teamId, db }) => {
  const version = new URL(request.url).searchParams.get('version');
  if (!version) throw new ApiError(400, 'version required');
  const data = await getVersionHistoryDetail(db, teamId, version);
  return NextResponse.json(data);
});
