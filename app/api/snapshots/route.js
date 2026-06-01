import { NextResponse } from 'next/server';
import { listSnapshots } from '@/lib/db/reportSnapshotsData';
import { withTeam } from '@/lib/server/withTeam';

/**
 * GET /api/snapshots
 *
 * Returns all stored PDF snapshots for the team (Version History), newest first.
 *
 * @see {@link app/api/snapshots/__tests__/route.test.js}
 */
export const GET = withTeam(async (_request, _ctx, { teamId, db }) => {
  const snapshots = await listSnapshots(db, teamId);
  return NextResponse.json(snapshots);
});
