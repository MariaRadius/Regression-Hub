import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { resetTeamData } from '@/lib/db/testCasesData';
import { ApiError } from '@/lib/errors';
import { resetTeamBodySchema } from '@/lib/schemas/testCases';
import { withAdmin } from '@/lib/server/withTeam';

export const POST = withAdmin(async (request, _ctx, { teamId, db }) => {
  const body = await request.json();
  const parsed = resetTeamBodySchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(400, 'Type RESET to confirm');
  }
  const deleted = await resetTeamData(db, teamId);
  revalidatePath('/(app)/dashboard', 'page');
  return NextResponse.json({ ok: true, deleted });
});
