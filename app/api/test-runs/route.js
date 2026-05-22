import { listTestRuns } from '@/lib/db/testRunsData';
import { withTeam } from '@/lib/server/withTeam';
import { NextResponse } from 'next/server';

export const GET = withTeam(async (_req, _ctx, { teamId, db }) => {
  const testRuns = await listTestRuns(db, teamId);
  return NextResponse.json(testRuns);
});
