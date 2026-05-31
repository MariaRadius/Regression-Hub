import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { createUser, getUsers } from '@/lib/db/usersData';
import { ApiError } from '@/lib/errors';
import { checkRateLimit } from '@/lib/rateLimit';
import { createUserBodySchema } from '@/lib/schemas/users';
import { withAdmin } from '@/lib/server/withTeam';

export const GET = withAdmin(async (_req, _ctx, { teamId, db }) => {
  const users = await getUsers(db, teamId);
  return NextResponse.json(users);
});

export const POST = withAdmin(
  async (request, _ctx, { teamId, db, session }) => {
    const rl = checkRateLimit(`users:create:${session.user.id}`, 10, 60_000);
    if (!rl.ok)
      return NextResponse.json(
        { error: 'Too many requests — try again shortly' },
        { status: 429 },
      );

    const body = await request.json();
    const parsed = createUserBodySchema.safeParse(body);
    if (!parsed.success) throw new ApiError(400, 'Invalid user body');

    const result = await createUser(db, teamId, parsed.data, {
      createdBy: session.user.username,
      teamName: session.user.teamName,
    });
    revalidatePath('/users');
    return NextResponse.json(result, { status: 201 });
  },
);
