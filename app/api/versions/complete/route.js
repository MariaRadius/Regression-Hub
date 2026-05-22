import { completeVersion } from '@/lib/db/versionsData';
import { ApiError } from '@/lib/errors';
import { withAdmin } from '@/lib/server/withTeam';
import { NextResponse } from 'next/server';

export const POST = withAdmin(async (request, _ctx, { teamId, db }) => {
  const { version } = await request.json();
  if (!version) throw new ApiError(400, 'version required');
  const result = await completeVersion(db, teamId, version);
  return NextResponse.json({ ok: true, ...result });
});
