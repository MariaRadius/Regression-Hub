import { NextResponse } from 'next/server';
import { listCaseResults } from '@/lib/db/testResultsData';
import { withTeam } from '@/lib/server/withTeam';

// ---------------------------------------------------------------------------
// GET /api/releases/[id]/results/[tcId]
// ---------------------------------------------------------------------------

/**
 * Returns the minimal per-environment execution rows for a single test case
 * in one round-trip — purpose-built for the test-case detail panel. Replaces
 * the panel's previous N-calls-per-environment fan-out (each of which
 * over-fetched an entire environment's rows just to keep one).
 *
 * Open to admin and QA (withTeam).
 *
 * @see {@link app/api/releases/[id]/results/[tcId]/__tests__/route.test.js}
 */
export const GET = withTeam(async (_request, { params }, { teamId, db }) => {
  const { id: releaseId, tcId } = await params;
  const results = await listCaseResults(db, teamId, releaseId, tcId);
  return NextResponse.json(results);
});
