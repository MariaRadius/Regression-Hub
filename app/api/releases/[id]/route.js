import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { CONFIRM_TOKENS } from '@/lib/constants';
import {
  deleteRelease,
  getRelease,
  updateRelease,
} from '@/lib/db/releasesData';
import { ApiError } from '@/lib/errors';
import { withAdmin, withTeam } from '@/lib/server/withTeam';

/**
 * GET /api/releases/[id]
 *
 * Returns a single release. Throws 404 when not found or owned by another team.
 *
 * @see {@link app/api/releases/[id]/__tests__/route.test.js}
 */
export const GET = withTeam(async (_request, context, { teamId, db }) => {
  const { id } = await context.params;
  const release = await getRelease(db, teamId, id);
  return NextResponse.json(release);
});

/**
 * PATCH /api/releases/[id]
 *
 * Updates a release's name and/or archived flag. Admin only.
 *
 * Body: { name?: string, archived?: boolean }
 *
 * @see {@link app/api/releases/[id]/__tests__/route.test.js}
 */
export const PATCH = withAdmin(
  async (request, context, { teamId, db, session }) => {
    const { id } = await context.params;
    const body = await request.json();

    const patch = {};
    if ('name' in body) patch.name = body.name;
    if ('archived' in body) patch.archived = body.archived;

    if (Object.keys(patch).length === 0) {
      throw new ApiError(400, 'No updatable fields provided');
    }

    const result = await updateRelease(db, teamId, id, patch, {
      actor: session.user.name,
    });

    revalidatePath('/(app)/releases', 'page');
    return NextResponse.json(result);
  },
);

/**
 * DELETE /api/releases/[id]
 *
 * Deletes a release and cascades to test cases, results, and events (assignment history is part of the events log).
 * Admin only. Requires body `{ confirm: 'DELETE' }`.
 *
 * The release must not be archived (unarchive it first).
 *
 * @see {@link app/api/releases/[id]/__tests__/route.test.js}
 */
export const DELETE = withAdmin(
  async (request, context, { teamId, db, session }) => {
    const { id } = await context.params;
    const body = await request.json();

    if (body?.confirm !== CONFIRM_TOKENS.DELETE) {
      throw new ApiError(400, 'Type DELETE to confirm');
    }

    const result = await deleteRelease(db, teamId, id, {
      actor: session.user.name,
    });

    revalidatePath('/(app)/releases', 'page');
    return NextResponse.json(result);
  },
);
