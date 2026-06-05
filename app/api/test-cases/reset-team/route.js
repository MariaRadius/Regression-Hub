import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { AUDIT_ACTION, AUDIT_CATEGORY } from '@/lib/constants';
import { appendAdminActivity } from '@/lib/db/adminActivityData';
import { resetTeamData } from '@/lib/db/testCasesData';
import { ApiError } from '@/lib/errors';
import { resetTeamBodySchema } from '@/lib/schemas/testCases';
import { withAdmin } from '@/lib/server/withTeam';

export const POST = withAdmin(
  async (request, _ctx, { teamId, db, session }) => {
    const body = await request.json();
    const parsed = resetTeamBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, 'Type RESET to confirm');
    }
    const deleted = await resetTeamData(db, teamId);
    await appendAdminActivity(db, teamId, {
      category: AUDIT_CATEGORY.CONFIG,
      action: AUDIT_ACTION.RESET_DATA,
      by: session.user.name,
      deleted,
    });
    revalidatePath('/(app)/dashboard', 'page');
    return NextResponse.json({ ok: true, deleted });
  },
);
