import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { createTestCase, listTestCases } from '@/lib/db/testCasesData';
import { ApiError } from '@/lib/errors';
import { createTestCaseBodySchema } from '@/lib/schemas/testCases';
import { withTeam } from '@/lib/server/withTeam';

export const GET = withTeam(async (request, _ctx, { teamId, db }) => {
  const { searchParams } = new URL(request.url);
  const result = await listTestCases(db, teamId, {
    applicationId: searchParams.get('applicationId') || '',
    moduleId: searchParams.get('moduleId') || '',
    status: searchParams.get('status') || '',
    testedBy: searchParams.get('testedBy') || '',
    version: searchParams.get('version') || '',
    assignedTo: searchParams.get('assignedTo') || '',
    priority: searchParams.get('priority') || '',
    jiraStory: searchParams.get('jiraStory') || '',
    page: searchParams.get('page') || '1',
    limit: searchParams.get('limit') || '50',
    includeMeta: searchParams.get('includeMeta') === 'true',
  });
  return NextResponse.json(result);
});

export const POST = withTeam(async (request, _ctx, { teamId, db }) => {
  const body = await request.json();
  const parsed = createTestCaseBodySchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues[0]?.message || 'Invalid body');
  }
  const result = await createTestCase(db, teamId, parsed.data);
  revalidatePath('/(app)/dashboard', 'page');
  return NextResponse.json(result);
});
