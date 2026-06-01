import { NextResponse } from 'next/server';
import { deleteModule } from '@/lib/db/modulesData';
import { withAdmin } from '@/lib/server/withTeam';

/**
 * DELETE /api/modules/[id]
 *
 * Deletes a team module. Throws 409 if any test case still references it.
 * Admin only.
 *
 * @see {@link app/api/modules/[id]/__tests__/route.test.js}
 */
export const DELETE = withAdmin(async (_req, ctx, { teamId, db }) => {
  const { id } = await ctx.params;
  await deleteModule(db, teamId, id);
  return NextResponse.json({ ok: true });
});
