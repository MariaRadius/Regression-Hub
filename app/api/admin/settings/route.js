import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AUDIT_ACTION, AUDIT_CATEGORY } from '@/lib/constants';
import { appendAdminActivity } from '@/lib/db/adminActivityData';
import { getTeamSettings, updateTeamSettings } from '@/lib/db/settingsData';
import { ApiError } from '@/lib/errors';
import { withAdmin } from '@/lib/server/withTeam';

const patchBodySchema = z.object({
  failureThreshold: z.number().int().min(1).max(50).optional(),
  topModulesLimit: z.number().int().min(1).max(10).optional(),
});

const SETTING_LABELS = {
  failureThreshold: 'Failure threshold',
  topModulesLimit: 'Top modules limit',
};

export const PATCH = withAdmin(
  async (request, _ctx, { teamId, db, session }) => {
    const body = await request.json();
    const parsed = patchBodySchema.safeParse(body);
    if (!parsed.success) throw new ApiError(400, 'Invalid settings');
    if (Object.keys(parsed.data).length === 0)
      throw new ApiError(400, 'No settings provided');

    const before = await getTeamSettings(db, teamId);
    await updateTeamSettings(db, teamId, parsed.data);

    const changes = Object.entries(parsed.data).map(([key, after]) => ({
      label: SETTING_LABELS[key] ?? key,
      before: before[key] ?? null,
      after,
    }));

    await appendAdminActivity(db, teamId, {
      category: AUDIT_CATEGORY.CONFIG,
      action: AUDIT_ACTION.UPDATE,
      by: session.user?.name ?? session.user?.email ?? null,
      subject: 'Dashboard settings',
      changes,
    });

    revalidatePath('/(app)/dashboard', 'page');
    return NextResponse.json({ ok: true });
  },
);
