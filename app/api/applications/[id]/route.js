import { NextResponse } from 'next/server';
import {
  deleteApplication,
  updateApplicationInitial,
} from '@/lib/db/applicationsData';
import { ApiError } from '@/lib/errors';
import { updateApplicationBodySchema } from '@/lib/schemas/applications';
import { withAdmin } from '@/lib/server/withTeam';

/**
 * PATCH /api/applications/[id]
 *
 * Updates the `initial` prefix for a team application.
 * Rejects with 409 if the prefix is already in use by another application.
 * Admin only.
 */
export const PATCH = withAdmin(async (request, ctx, { teamId, db }) => {
  const { id } = await ctx.params;
  const body = await request.json();
  const parsed = updateApplicationBodySchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues[0]?.message || 'Invalid body');
  }
  const result = await updateApplicationInitial(
    db,
    teamId,
    id,
    parsed.data.initial,
  );
  return NextResponse.json(result);
});

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
