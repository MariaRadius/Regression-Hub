import { NextResponse } from 'next/server';
import { deleteAssignment } from '@/lib/db/assignmentsData';
import { withTeam } from '@/lib/server/withTeam';

export const DELETE = withTeam(
  async (_request, { params }, { teamId, db, session }) => {
    const { id } = await params;
    const result = await deleteAssignment(db, teamId, id, {
      actor: session.user.name,
    });
    return NextResponse.json(result);
  },
);
