import { NextResponse } from 'next/server';
import { getAiGeneratedTestCases } from '@/lib/db/testCasesData';
import { withTeam } from '@/lib/server/withTeam';

/**
 * GET /api/test-cases/generated
 *
 * Cross-release listing of test cases created by AI generation (source:'ai').
 * Team-scoped, paginated, filterable by appId, moduleId, and search.
 *
 * @see {@link __tests__/route.test.js}
 */
export const GET = withTeam(async (request, _ctx, { teamId, db }) => {
  const { searchParams } = new URL(request.url);
  const result = await getAiGeneratedTestCases(db, teamId, {
    page: searchParams.get('page') || '1',
    pageSize: searchParams.get('pageSize') || '20',
    search: searchParams.get('search') || '',
    appId: searchParams.get('appId') || '',
    moduleId: searchParams.get('moduleId') || '',
  });
  return NextResponse.json(result);
});
