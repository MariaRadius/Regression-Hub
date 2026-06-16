import { NextResponse } from 'next/server';
import { getTeamSettings } from '@/lib/db/settingsData';
import { isJiraConfigured } from '@/lib/server/jiraClient';
import { withTeam } from '@/lib/server/withTeam';

export const GET = withTeam(async (_req, _ctx, { teamId, db }) => {
  const settings = await getTeamSettings(db, teamId);
  return NextResponse.json({
    ...settings,
    jiraConfigured: isJiraConfigured(),
    // Base URL is not a secret — the client needs it to link created issues.
    jiraBaseUrl: process.env.JIRA_BASE_URL || null,
  });
});
