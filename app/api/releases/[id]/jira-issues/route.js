import { NextResponse } from 'next/server';
import { getRelease } from '@/lib/db/releasesData';
import { validateEnvironment } from '@/lib/db/testResultsData';
import { ApiError } from '@/lib/errors';
import { checkRateLimit } from '@/lib/rateLimit';
import { jiraCreateRequestSchema } from '@/lib/schemas/jira';
import { createIssuesFromDrafts } from '@/lib/server/jiraOnFail';
import { withTeam } from '@/lib/server/withTeam';

/**
 * Creates reviewed Jira issue drafts — step 2 of the ask-mode review flow.
 * The client supplies only summary/description per case; project, issue type,
 * story link, and the regression-hub label are re-derived server-side from the
 * stored test case and environment.
 *
 * Body (application/json): environment, issues[{ tcId, summary, description }]
 *
 * Open to admin and QA (withTeam).
 *
 * @see {@link app/api/releases/[id]/jira-issues/__tests__/route.test.js}
 */
export const POST = withTeam(
  async (request, { params }, { teamId, db, session }) => {
    const rl = checkRateLimit(`jira:create:${session.user.id}`, 60, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Too many requests — slow down' },
        { status: 429 },
      );
    }

    const { id: releaseId } = await params;
    const body = await request.json();

    const parsed = jiraCreateRequestSchema.safeParse({ ...body, releaseId });
    if (!parsed.success) {
      throw new ApiError(
        400,
        parsed.error.issues[0]?.message || 'Invalid body',
      );
    }

    const { environment, issues } = parsed.data;

    const release = await getRelease(db, teamId, releaseId);
    validateEnvironment(release, environment);

    const result = await createIssuesFromDrafts(db, teamId, {
      releaseId,
      environment,
      issues,
    });

    return NextResponse.json(result);
  },
);
