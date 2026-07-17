import { NextResponse } from 'next/server';
import { CACHE_CONTROL } from '@/lib/constants';
import { createApplication, listApplications } from '@/lib/db/applicationsData';
import { ApiError } from '@/lib/errors';
import { createApplicationBodySchema } from '@/lib/schemas/applications';
import { withTeam } from '@/lib/server/withTeam';

export const GET = withTeam(async (_req, _ctx, { teamId, db }) => {
  const applications = await listApplications(db, teamId);
  return NextResponse.json(applications, {
    headers: {
      'Cache-Control': CACHE_CONTROL.LONG,
    },
  });
});

export const POST = withTeam(async (request, _ctx, { teamId, db }) => {
  const body = await request.json();
  const parsed = createApplicationBodySchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues[0]?.message || 'Invalid body');
  }
  const created = await createApplication(db, teamId, parsed.data);
  return NextResponse.json(created, { status: 201 });
});
