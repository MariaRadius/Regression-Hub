import { deleteVersion, getVersions } from '@/lib/db/versionsData';
import { ApiError } from '@/lib/errors';
import { withAdmin, withTeam } from '@/lib/server/withTeam';
import { NextResponse } from 'next/server';

export const GET = withTeam(async (_req, _ctx, { teamId, db }) => {
  const versions = await getVersions(db, teamId);
  return NextResponse.json(versions, {
    headers: { 'Cache-Control': 'no-store' },
  });
});

export const DELETE = withAdmin(async (request, _ctx, { teamId, db }) => {
  const { searchParams } = new URL(request.url);
  const version = searchParams.get('version');
  const isCurrent = searchParams.get('isCurrent') === 'true';
  if (!version) throw new ApiError(400, 'version param required');
  const result = await deleteVersion(db, teamId, version, isCurrent);
  return NextResponse.json({ ok: true, ...result });
});
