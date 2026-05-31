import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { getTeamSettings, updateTeamSettings } from '@/lib/db/settingsData';
import { ApiError } from '@/lib/errors';
import { checkRateLimit } from '@/lib/rateLimit';
import { updateSettingsBodySchema } from '@/lib/schemas/settings';
import { withAdmin, withTeam } from '@/lib/server/withTeam';

export const GET = withTeam(async (_req, _ctx, { teamId, db }) => {
  const settings = await getTeamSettings(db, teamId);
  return NextResponse.json(settings);
});

export const PUT = withAdmin(async (request, _ctx, { teamId, db, session }) => {
  const rl = checkRateLimit(`settings:put:${session.user.id}`, 30, 60_000);
  if (!rl.ok)
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const body = await request.json();
  const parsed = updateSettingsBodySchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(400, 'Invalid settings body');
  }
  await updateTeamSettings(db, teamId, parsed.data);
  revalidatePath('/(app)/dashboard', 'page');
  revalidatePath('/(app)/reports', 'page');
  return NextResponse.json({ ok: true });
});
