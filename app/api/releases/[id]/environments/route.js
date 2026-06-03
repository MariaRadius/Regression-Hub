import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { CONFIRM_TOKENS } from '@/lib/constants';
import { addEnvironment, removeEnvironment } from '@/lib/db/releasesData';
import { ApiError } from '@/lib/errors';
import { withAdmin } from '@/lib/server/withTeam';

/**
 * POST /api/releases/[id]/environments
 *
 * Adds a new environment to a release. Fans out Pending result rows for every
 * existing test case in a transaction. Admin only.
 *
 * Body: { environment: string, confirm: 'DELETE' }
 *
 * The confirm token guards against accidental fan-out writes at scale.
 *
 * @see {@link app/api/releases/[id]/environments/__tests__/route.test.js}
 */
export const POST = withAdmin(
  async (request, context, { teamId, db, session }) => {
    const { id } = await context.params;
    const body = await request.json();

    if (body?.confirm !== CONFIRM_TOKENS.DELETE) {
      throw new ApiError(400, 'Type DELETE to confirm');
    }

    if (!body?.environment?.trim()) {
      throw new ApiError(400, 'environment is required');
    }

    const result = await addEnvironment(db, teamId, id, body.environment, {
      actor: session.user.name,
    });

    revalidatePath('/(app)/releases', 'page');
    return NextResponse.json(result, { status: 201 });
  },
);

/**
 * DELETE /api/releases/[id]/environments
 *
 * Removes an environment from a release. Cascades: deletes that environment's
 * results and its assignment events from the audit log.
 * The release must have at least two environments before this can succeed.
 * Admin only.
 *
 * Body: { environment: string, confirm: 'DELETE' }
 *
 * @see {@link app/api/releases/[id]/environments/__tests__/route.test.js}
 */
export const DELETE = withAdmin(
  async (request, context, { teamId, db, session }) => {
    const { id } = await context.params;
    const body = await request.json();

    if (body?.confirm !== CONFIRM_TOKENS.DELETE) {
      throw new ApiError(400, 'Type DELETE to confirm');
    }

    if (!body?.environment?.trim()) {
      throw new ApiError(400, 'environment is required');
    }

    const result = await removeEnvironment(db, teamId, id, body.environment, {
      actor: session.user.name,
    });

    revalidatePath('/(app)/releases', 'page');
    return NextResponse.json(result);
  },
);
