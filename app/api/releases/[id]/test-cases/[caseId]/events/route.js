import { NextResponse } from 'next/server';
import { PER_CASE_CATEGORIES } from '@/lib/constants';
import { listEvents } from '@/lib/db/eventsData';
import { withTeam } from '@/lib/server/withTeam';

/**
 * GET /api/releases/[id]/test-cases/[caseId]/events
 *
 * Returns the lazy-loaded per-case history for the active release context.
 * Open to admin and QA.
 *
 * @see {@link app/api/releases/[id]/test-cases/[caseId]/events/__tests__/route.test.js}
 */
export const GET = withTeam(async (_request, { params }, { teamId, db }) => {
  const { id: releaseId, caseId: tcId } = await params;
  const events = await listEvents(db, teamId, {
    tcId,
    releaseId,
    categories: PER_CASE_CATEGORIES,
  });
  return NextResponse.json(events);
});
