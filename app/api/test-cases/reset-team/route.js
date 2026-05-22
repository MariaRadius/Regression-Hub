import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/server/withTeam';
import { resetTeamData } from '@/lib/db/testCasesData';
import { resetTeamBodySchema } from '@/lib/schemas/testCases';
import { ApiError } from '@/lib/errors';

export const POST = withAdmin(async (request, _ctx, { teamId, db }) => {
  const body = await request.json();
  const parsed = resetTeamBodySchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(400, 'Type RESET to confirm');
  }
  const deleted = await resetTeamData(db, teamId);
  return NextResponse.json({ ok: true, deleted });
});
