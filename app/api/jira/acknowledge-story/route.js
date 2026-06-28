import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  acknowledgeAllStoryWatches,
  acknowledgeStoryWatch,
} from '@/lib/db/jiraStoryWatchesData';
import { ApiError } from '@/lib/errors';
import { withTeam } from '@/lib/server/withTeam';

const bodySchema = z
  .object({
    storyKey: z.string().min(1).optional(),
    all: z.boolean().optional(),
  })
  .refine((d) => d.storyKey || d.all, {
    message: 'storyKey or all: true is required',
  });

/**
 * POST /api/jira/acknowledge-story
 *
 * Marks one story (by storyKey) or all stories as acknowledged,
 * silencing the notification badge for those entries.
 *
 * Open to all authenticated users (withTeam).
 */
export const POST = withTeam(async (request, _ctx, { teamId, db }) => {
  let rawBody;
  try {
    rawBody = await request.json();
  } catch {
    throw new ApiError(400, 'Invalid JSON body');
  }

  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues[0]?.message ?? 'Invalid body');
  }

  const { storyKey, all } = parsed.data;

  if (all) {
    await acknowledgeAllStoryWatches(db, teamId);
  } else {
    await acknowledgeStoryWatch(db, teamId, storyKey);
  }

  return NextResponse.json({ ok: true });
});
