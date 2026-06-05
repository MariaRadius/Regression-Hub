import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { updateUser } from '@/lib/db/usersData';
import { ApiError } from '@/lib/errors';
import { updateUserBodySchema } from '@/lib/schemas/users';
import { withAdmin } from '@/lib/server/withTeam';

export const PATCH = withAdmin(
  async (request, { params }, { teamId, db, session }) => {
    const { id } = await params;
    const body = await request.json();
    const parsed = updateUserBodySchema.safeParse(body);
    if (!parsed.success) throw new ApiError(400, 'Invalid update body');
    const result = await updateUser(db, teamId, id, parsed.data, {
      sessionUserId: session.user.id,
      actor: session.user.name,
    });
    revalidatePath('/users');
    return NextResponse.json(result);
  },
);
