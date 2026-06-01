import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { createRelease, listReleases } from '@/lib/db/releasesData';
import { ApiError } from '@/lib/errors';
import { withAdmin, withTeam } from '@/lib/server/withTeam';

/**
 * GET /api/releases
 *
 * Returns all non-archived releases for the team, newest-first.
 * Pass ?includeArchived=true to include archived releases (e.g. search typeahead).
 *
 * @see {@link app/api/releases/__tests__/route.test.js}
 */
export const GET = withTeam(async (request, _ctx, { teamId, db }) => {
  const sp = new URL(request.url).searchParams;
  const includeArchived = sp.get('includeArchived') === 'true';
  const releases = await listReleases(db, teamId, { includeArchived });
  return NextResponse.json(releases);
});

/**
 * POST /api/releases
 *
 * Creates an empty release or clones an existing one. Admin only.
 *
 * Body (empty):
 *   { name: string, environments?: string[] }
 *
 * Body (clone):
 *   { name: string, environments?: string[], cloneFromId: string, carryAssignments?: boolean }
 *
 * @see {@link app/api/releases/__tests__/route.test.js}
 */
export const POST = withAdmin(
  async (request, _ctx, { teamId, db, session }) => {
    const body = await request.json();

    if (!body?.name?.trim()) {
      throw new ApiError(400, 'name is required');
    }

    const result = await createRelease(db, teamId, body, {
      actor: session.user.name,
    });

    revalidatePath('/(app)/releases', 'page');
    return NextResponse.json(result, { status: 201 });
  },
);
