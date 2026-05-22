import { createAssignment, listAssignments } from '@/lib/db/assignmentsData';
import { withTeam } from '@/lib/server/withTeam';
import { NextResponse } from 'next/server';

export const GET = withTeam(async (request, _ctx, { teamId, db, session }) => {
  const view = new URL(request.url).searchParams.get('view') || 'mine';
  const enriched = await listAssignments(db, teamId, {
    view,
    userName: session.user.name,
  });
  return NextResponse.json(enriched);
});

export const POST = withTeam(async (request, _ctx, { teamId, db, session }) => {
  const body = await request.json();
  const result = await createAssignment(db, teamId, body, {
    assignedBy: session.user.name,
  });
  return NextResponse.json(result);
});
