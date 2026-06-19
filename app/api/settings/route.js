import { NextResponse } from 'next/server';
import { getTeamSettings } from '@/lib/db/settingsData';
import { isAiConfigured } from '@/lib/server/aiClient';
import { isJiraConfigured } from '@/lib/server/jiraClient';
import { withTeam } from '@/lib/server/withTeam';

export const GET = withTeam(async (_req, _ctx, { teamId, db }) => {
  const settings = await getTeamSettings(db, teamId);
  const { aiApiKey: _key, ...rest } = settings;
  return NextResponse.json({
    ...rest,
    aiConfigured: isAiConfigured(settings),
    jiraConfigured: isJiraConfigured(),
    // Prefer a team-level Jira base URL if configured; otherwise fall back
    // to the server env var. Base URL is not a secret — the client needs it
    // to link created issues.
    jiraBaseUrl: settings.jiraBaseUrl ?? process.env.JIRA_BASE_URL ?? null,
  });
});
