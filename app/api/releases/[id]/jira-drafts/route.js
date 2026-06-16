import { NextResponse } from 'next/server';
import { getRelease } from '@/lib/db/releasesData';
import { validateEnvironment } from '@/lib/db/testResultsData';
import { ApiError } from '@/lib/errors';
import { checkRateLimit } from '@/lib/rateLimit';
import { jiraDraftsRequestSchema } from '@/lib/schemas/jira';
import { buildDraftsForFailures } from '@/lib/server/jiraOnFail';
import { withTeam } from '@/lib/server/withTeam';

/**
 * Builds editable Jira issue drafts for freshly failed cases — step 1 of the
 * ask-mode review flow. No Jira calls happen here; the reviewed drafts are
 * created via POST /api/releases/[id]/jira-issues.
 *
 * Body (application/json): environment, tcIds[], notes
 * `testedBy` always comes from the session — drafts are attributed to the
 * person recording the failure.
 *
 * Open to admin and QA (withTeam).
 *
 * @see {@link app/api/releases/[id]/jira-drafts/__tests__/route.test.js}
 */
export const POST = withTeam(
  async (request, { params }, { teamId, db, session }) => {
    const rl = checkRateLimit(`jira:drafts:${session.user.id}`, 60, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Too many requests — slow down' },
        { status: 429 },
      );
    }

    const { id: releaseId } = await params;
    const body = await request.json();

    const parsed = jiraDraftsRequestSchema.safeParse({ ...body, releaseId });
    if (!parsed.success) {
      throw new ApiError(
        400,
        parsed.error.issues[0]?.message || 'Invalid body',
      );
    }

    const { environment, tcIds, notes } = parsed.data;

    const release = await getRelease(db, teamId, releaseId);
    validateEnvironment(release, environment);

    const testedBy = session.user.name;
    const result = await buildDraftsForFailures(db, teamId, {
      release,
      environment,
      entries: tcIds.map((tcId) => ({ tcId, notes, testedBy })),
    });

    return NextResponse.json(result);
  },
);
