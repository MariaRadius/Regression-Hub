import { NextResponse } from 'next/server';
import { CACHE_CONTROL } from '@/lib/constants';
import { countCasesByScope } from '@/lib/db/testCasesData';
import { withTeam } from '@/lib/server/withTeam';

/**
 * GET /api/releases/[id]/scope-counts
 * Per-application and per-module case counts for the Bulk Assign picker.
 * Counts move only when cases are added/removed, so a 5s cache absorbs repeated
 * modal opens without surfacing stale numbers.
 *
 * @see {@link app/api/releases/[id]/scope-counts/__tests__/route.test.js}
 */
export const GET = withTeam(async (_request, context, { teamId, db }) => {
  const { id: releaseId } = await context.params;
  const result = await countCasesByScope(db, teamId, releaseId);
  return NextResponse.json(result, {
    headers: { 'Cache-Control': CACHE_CONTROL.TINY },
  });
});
