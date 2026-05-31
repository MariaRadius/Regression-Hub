import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { CACHE_CONTROL } from '@/lib/constants';
import { deleteVersion, getVersions } from '@/lib/db/versionsData';
import { ApiError } from '@/lib/errors';
import { withAdmin, withTeam } from '@/lib/server/withTeam';

export const GET = withTeam(async (_req, _ctx, { teamId, db }) => {
  const versions = await getVersions(db, teamId);
  return NextResponse.json(versions, {
    headers: { 'Cache-Control': CACHE_CONTROL.SHORT },
  });
});

export const DELETE = withAdmin(async (request, _ctx, { teamId, db }) => {
  const { searchParams } = new URL(request.url);
  const version = searchParams.get('version');
  const isCurrent = searchParams.get('isCurrent') === 'true';
  if (!version) throw new ApiError(400, 'version param required');
  const result = await deleteVersion(db, teamId, version, isCurrent);
  revalidatePath('/(app)/dashboard', 'page');
  revalidatePath('/(app)/reports', 'page');
  return NextResponse.json({ ok: true, ...result });
});
