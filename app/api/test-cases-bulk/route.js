import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { withTeam } from '@/lib/server/withTeam';
import { bulkUpdateTestCases } from '@/lib/db/testCasesBulkData';
import { bulkUpdateBodySchema } from '@/lib/schemas/testCasesBulk';
import { ApiError } from '@/lib/errors';

export const PATCH = withTeam(async (request, _ctx, { teamId, db, session }) => {
  const rl = checkRateLimit(`bulk:${session.user.id}`, 60, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: 'Too many requests — slow down' }, { status: 429 });
  }

  const body = await request.json();
  const parsed = bulkUpdateBodySchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues[0]?.message || 'Invalid body');
  }

  const result = await bulkUpdateTestCases(db, teamId, parsed.data);
  return NextResponse.json(result);
});
