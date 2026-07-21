import { NextResponse } from 'next/server';
import { getTestCasesByStory } from '@/lib/db/testCasesData';
import { ApiError } from '@/lib/errors';
import { JIRA_KEY_RE } from '@/lib/schemas/testCases';
import { withTeam } from '@/lib/server/withTeam';

/**
 * GET /api/jira/stories/[storyKey]/test-cases
 *
 * Returns a lean list of test cases linked to the given Jira story key.
 * Used by the discard review dialog to show what will be deleted.
 *
 * Open to all authenticated users — display-only, no mutations.
 */
export const GET = withTeam(async (_request, { params }, { teamId, db }) => {
  const { storyKey } = await params;
  if (!JIRA_KEY_RE.test(storyKey)) {
    throw new ApiError(400, 'Invalid storyKey format');
  }

  const rawCases = await getTestCasesByStory(db, teamId, storyKey);
  const testCases = rawCases.map((tc) => ({
    _id: String(tc._id),
    testKey: tc.testKey ?? null,
    testCase: tc.testCase,
    type: tc.type ?? null,
    priority: tc.priority ?? null,
  }));

  return NextResponse.json({ testCases });
});
