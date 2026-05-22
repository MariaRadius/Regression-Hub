import { deactivateUser, updateUser } from '@/lib/db/usersData';
import { ApiError } from '@/lib/errors';
import { updateUserBodySchema } from '@/lib/schemas/users';
import { withAdmin } from '@/lib/server/withTeam';
import { NextResponse } from 'next/server';

export const PATCH = withAdmin(
  async (request, { params }, { teamId, db, session }) => {
    const { id } = await params;
    const body = await request.json();
    const parsed = updateUserBodySchema.safeParse(body);
    if (!parsed.success) throw new ApiError(400, 'Invalid update body');
    const result = await updateUser(db, teamId, id, parsed.data, {
      sessionUserId: session.user.id,
    });
    return NextResponse.json(result);
  }
);

export const DELETE = withAdmin(
  async (_request, { params }, { teamId, db, session }) => {
    const { id } = await params;
    const result = await deactivateUser(db, teamId, id, {
      sessionUserId: session.user.id,
    });
    return NextResponse.json(result);
  }
);
