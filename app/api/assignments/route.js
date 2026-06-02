import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { createAssignment, listAssignments } from '@/lib/db/assignmentsData';
import { withTeam } from '@/lib/server/withTeam';

export const GET = withTeam(async (request, _ctx, { teamId, db }) => {
  const params = new URL(request.url).searchParams;
  const releaseId = params.get('releaseId');
  const assignedTo = params.get('assignedTo') || undefined;
  const enriched = await listAssignments(db, teamId, { releaseId, assignedTo });
  return NextResponse.json(enriched);
});

export const POST = withTeam(async (request, _ctx, { teamId, db, session }) => {
  const body = await request.json();
  const result = await createAssignment(db, teamId, body, {
    assignedBy: session.user.name,
  });
  revalidatePath('/dashboard');
  return NextResponse.json(result);
});
