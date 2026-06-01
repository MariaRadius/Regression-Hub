import { NextResponse } from 'next/server';
import { deleteApplication } from '@/lib/db/applicationsData';
import { withAdmin } from '@/lib/server/withTeam';

/**
 * DELETE /api/applications/[id]
 *
 * Deletes a team application. Throws 409 if any test case still references it.
 * Admin only.
 *
 * @see {@link app/api/applications/[id]/__tests__/route.test.js}
 */
export const DELETE = withAdmin(async (_req, ctx, { teamId, db }) => {
  const { id } = await ctx.params;
  await deleteApplication(db, teamId, id);
  return NextResponse.json({ ok: true });
});
