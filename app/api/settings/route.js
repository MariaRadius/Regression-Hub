import { NextResponse } from 'next/server';
import { getTeamSettings } from '@/lib/db/settingsData';
import { withTeam } from '@/lib/server/withTeam';

export const GET = withTeam(async (_req, _ctx, { teamId, db }) => {
  const settings = await getTeamSettings(db, teamId);
  return NextResponse.json(settings);
});
