import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { ROLES } from '@/lib/constants';
import { getTeamSettings } from '@/lib/db/settingsData';
import { bulkUpdateTestCases } from '@/lib/db/testCasesBulkData';
import { ApiError } from '@/lib/errors';
import { checkRateLimit } from '@/lib/rateLimit';
import { bulkUpdateBodySchema } from '@/lib/schemas/testCasesBulk';
import { withTeam } from '@/lib/server/withTeam';

export const PATCH = withTeam(
  async (request, _ctx, { teamId, db, session }) => {
    const rl = checkRateLimit(`bulk:${session.user.id}`, 60, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Too many requests — slow down' },
        { status: 429 },
      );
    }

    const body = await request.json();
    const parsed = bulkUpdateBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(
        400,
        parsed.error.issues[0]?.message || 'Invalid body',
      );
    }

    // BR-15 — QA users can only record themselves as the tester
    // @see app/api/test-cases-bulk/__tests__/route.test.js
    if (session.user.role === ROLES.QA && parsed.data.fields.testedBy) {
      parsed.data.fields.testedBy = session.user.name;
    }

    // R21 — testedBy must be a registered QA user
    if (parsed.data.fields.testedBy) {
      const settings = await getTeamSettings(db, teamId);
      if (!settings.qaUsers.includes(parsed.data.fields.testedBy))
        throw new ApiError(
          400,
          `"${parsed.data.fields.testedBy}" is not a registered QA user for this team`,
        );
    }

    const result = await bulkUpdateTestCases(db, teamId, {
      ...parsed.data,
      actor: session.user.name,
    });
    revalidatePath('/(app)/dashboard', 'page');
    revalidatePath('/(app)/reports', 'page');
    return NextResponse.json(result);
  },
);
