import { NextResponse } from 'next/server';
import { getTeamSettings } from '@/lib/db/settingsData';
import { JIRA_KEY_RE } from '@/lib/schemas/testCases';
import { getJiraStory } from '@/lib/server/jiraClient';
import { withTeam } from '@/lib/server/withTeam';

/**
 * Checks whether a Jira story key resolves to an existing issue.
 * Used by the JiraDraftReviewDialog to validate the story before creating.
 *
 * GET /api/jira/validate-story?key=AIOP-123
 * Response: { valid: boolean }
 */
export const GET = withTeam(async (request, _, { teamId, db }) => {
  const key = new URL(request.url).searchParams.get('key');
  if (!key || !JIRA_KEY_RE.test(key)) {
    return NextResponse.json({ valid: false });
  }
  const settings = await getTeamSettings(db, teamId);
  try {
    await getJiraStory(key, {
      jiraBaseUrl: settings.jiraBaseUrl,
      jiraEmail: settings.jiraEmail,
      jiraApiToken: settings.jiraApiToken,
    });
    return NextResponse.json({ valid: true });
  } catch {
    return NextResponse.json({ valid: false });
  }
});
