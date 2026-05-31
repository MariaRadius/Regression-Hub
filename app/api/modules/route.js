import { NextResponse } from 'next/server';
import { CACHE_CONTROL } from '@/lib/constants';
import { createModule, listModules } from '@/lib/db/modulesData';
import { ApiError } from '@/lib/errors';
import { createModuleBodySchema } from '@/lib/schemas/modules';
import { withTeam } from '@/lib/server/withTeam';

export const GET = withTeam(async (request, _ctx, { teamId, db }) => {
  const applicationId =
    new URL(request.url).searchParams.get('applicationId') || '';
  const enriched = await listModules(db, teamId, { applicationId });
  return NextResponse.json(enriched, {
    headers: {
      'Cache-Control': CACHE_CONTROL.LONG,
    },
  });
});

export const POST = withTeam(async (request, _ctx, { teamId, db }) => {
  const body = await request.json();
  const parsed = createModuleBodySchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues[0]?.message || 'Invalid body');
  }
  const created = await createModule(db, teamId, parsed.data);
  return NextResponse.json(created, { status: 201 });
});
