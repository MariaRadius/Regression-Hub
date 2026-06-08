import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { updateTeamSettings } from '@/lib/db/settingsData';
import { ApiError } from '@/lib/errors';
import { withAdmin } from '@/lib/server/withTeam';

const patchBodySchema = z.object({
  failureThreshold: z.number().int().min(1).max(50).optional(),
  topModulesLimit: z.number().int().min(1).max(10).optional(),
});

export const PATCH = withAdmin(async (request, _ctx, { teamId, db }) => {
  const body = await request.json();
  const parsed = patchBodySchema.safeParse(body);
  if (!parsed.success) throw new ApiError(400, 'Invalid settings');
  if (Object.keys(parsed.data).length === 0)
    throw new ApiError(400, 'No settings provided');
  await updateTeamSettings(db, teamId, parsed.data);
  revalidatePath('/(app)/dashboard', 'page');
  return NextResponse.json({ ok: true });
});
