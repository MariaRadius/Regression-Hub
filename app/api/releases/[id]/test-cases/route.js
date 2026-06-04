import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { createTestCase, listTestCases } from '@/lib/db/testCasesData';
import { ApiError } from '@/lib/errors';
import { createTestCaseBodySchema } from '@/lib/schemas/testCases';
import { withAdmin, withTeam } from '@/lib/server/withTeam';

/**
 * GET /api/releases/[id]/test-cases
 *
 * Lists test cases for a release + environment context.
 * Open to admin and QA.
 *
 * Query params:
 *   environment (required), applicationId, moduleId, status, priority,
 *   testKey, jiraStory, testCase, q, sortBy, sortDir, page, limit, includeMeta
 *
 * @see {@link app/api/releases/[id]/test-cases/__tests__/route.test.js}
 */
export const GET = withTeam(async (request, { params }, { teamId, db }) => {
  const { id: releaseId } = await params;
  const { searchParams } = new URL(request.url);

  const environment = searchParams.get('environment') || '';
  if (!environment) {
    throw new ApiError(400, 'environment query param is required');
  }

  const result = await listTestCases(db, teamId, {
    releaseId,
    environment,
    applicationId: searchParams.get('applicationId') || '',
    moduleId: searchParams.get('moduleId') || '',
    status: searchParams.get('status') || '',
    testedBy: searchParams.get('testedBy') || '',
    assignedTo: searchParams.get('assignedTo') || '',
    priority: searchParams.get('priority') || '',
    testKey: searchParams.get('testKey') || '',
    jiraStory: searchParams.get('jiraStory') || '',
    testCase: searchParams.get('testCase') || '',
    q: searchParams.get('q') || '',
    sortBy: searchParams.get('sortBy') || '',
    sortDir: searchParams.get('sortDir') || '',
    page: searchParams.get('page') || '1',
    limit: searchParams.get('limit') || '50',
    includeMeta: searchParams.get('includeMeta') === 'true',
  });

  return NextResponse.json(result);
});

/**
 * POST /api/releases/[id]/test-cases
 *
 * Creates a test case in the given release, minting a testKey and fanning out
 * dense Pending results for all environments the release declares.
 *
 * Mutations are admin-only per the role × action matrix (§12).
 *
 * @see {@link app/api/releases/[id]/test-cases/__tests__/route.test.js}
 */
export const POST = withAdmin(async (request, { params }, { teamId, db }) => {
  const { id: releaseId } = await params;
  const body = await request.json();

  const parsed = createTestCaseBodySchema.safeParse({ ...body, releaseId });
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues[0]?.message || 'Invalid body');
  }

  const result = await createTestCase(db, teamId, parsed.data);
  revalidatePath('/(app)/test-cases', 'page');
  revalidatePath('/(app)/dashboard', 'page');
  return NextResponse.json(result, { status: 201 });
});
