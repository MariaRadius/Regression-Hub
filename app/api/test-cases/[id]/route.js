import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { ROLES } from '@/lib/constants';
import { getTeamSettings } from '@/lib/db/settingsData';
import { getTestCase, updateTestCase } from '@/lib/db/testCasesData';
import { ApiError } from '@/lib/errors';
import { updateTestCaseBodySchema } from '@/lib/schemas/testCases';
import { withTeam } from '@/lib/server/withTeam';

/**
 * @see {@link app/api/test-cases/[id]/__tests__/route.test.js}
 */
export const GET = withTeam(async (_request, { params }, { teamId, db }) => {
  const { id } = await params;
  const tc = await getTestCase(db, teamId, id);
  return NextResponse.json(tc);
});

/**
 * @see {@link app/api/test-cases/[id]/__tests__/route.test.js}
 */
export const PATCH = withTeam(
  async (request, { params }, { teamId, db, session }) => {
    const { id } = await params;
    const body = await request.json();
    const parsed = updateTestCaseBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(
        400,
        parsed.error.issues[0]?.message || 'Invalid body',
      );
    }

    // BR-15 — QA cannot change testedBy; silently preserve the existing value
    if (session.user.role === ROLES.QA) delete parsed.data.testedBy;

    // R21 — testedBy must be a registered QA user
    if (parsed.data.testedBy) {
      const settings = await getTeamSettings(db, teamId);
      if (!settings.qaUsers.includes(parsed.data.testedBy))
        throw new ApiError(
          400,
          `"${parsed.data.testedBy}" is not a registered QA user for this team`,
        );
    }

    const result = await updateTestCase(db, teamId, id, parsed.data, {
      actor: session.user.name,
    });
    revalidatePath('/(app)/dashboard', 'page');
    return NextResponse.json(result);
  },
);
