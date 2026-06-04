import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { ROLES } from '@/lib/constants';
import { createUser, getUsers } from '@/lib/db/usersData';
import { ApiError } from '@/lib/errors';
import { checkRateLimit } from '@/lib/rateLimit';
import { createUserBodySchema } from '@/lib/schemas/users';
import { withAdmin, withTeam } from '@/lib/server/withTeam';

export const GET = withTeam(async (request, _ctx, { session, teamId, db }) => {
  const role = new URL(request.url).searchParams.get('role');

  if (role === ROLES.QA) {
    const users = await getUsers(db, teamId, { role: ROLES.QA, active: true });
    return NextResponse.json(users);
  }

  if (session.user.role !== ROLES.ADMIN) {
    return NextResponse.json(
      { error: 'Admin access required' },
      { status: 403 },
    );
  }

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
