import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { assignTestCases } from '@/lib/db/assignmentsData';
import { ApiError } from '@/lib/errors';
import { createAssignmentBodySchema } from '@/lib/schemas/assignments';
import { withTeam } from '@/lib/server/withTeam';

/**
 * POST /api/assignments
 * Assigns test cases (scope = tcIds ∪ applications ∪ modules) to a user for one
 * or more environments. Open to any team member (the Bulk Assign UI entry point
 * is admin-gated in FilterStrip; Reassign stays available to QA).
 */
export const POST = withTeam(async (request, _ctx, { teamId, db, session }) => {
  const body = await request.json();
  const parsed = createAssignmentBodySchema.safeParse(body);
  if (!parsed.success)
    throw new ApiError(400, parsed.error.issues[0]?.message || 'Invalid body');

  const result = await assignTestCases(db, teamId, parsed.data, {
    assignedBy: session.user.name,
  });
  revalidatePath('/dashboard');
  revalidatePath('/(app)/test-cases', 'page');
  return NextResponse.json(result);
});
