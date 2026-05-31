import { NextResponse } from 'next/server';
import { deleteAssignment, updateAssignment } from '@/lib/db/assignmentsData';
import { withTeam } from '@/lib/server/withTeam';

export const PATCH = withTeam(async (request, { params }, { teamId, db }) => {
  const { id } = await params;
  const body = await request.json();
  const result = await updateAssignment(db, teamId, id, body);
  return NextResponse.json(result);
});

export const DELETE = withTeam(
  async (_request, { params }, { teamId, db, session }) => {
    const { id } = await params;
    const result = await deleteAssignment(db, teamId, id, {
      actor: session.user.name,
    });
    return NextResponse.json(result);
  },
);
