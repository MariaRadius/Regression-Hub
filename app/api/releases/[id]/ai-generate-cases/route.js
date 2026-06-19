import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getRelease } from '@/lib/db/releasesData';
import { getTeamSettings } from '@/lib/db/settingsData';
import { ApiError } from '@/lib/errors';
import { JIRA_KEY_RE } from '@/lib/schemas/testCases';
import {
  generateTestCasesFromStory,
  isAiConfigured,
} from '@/lib/server/aiClient';
import { getJiraStory } from '@/lib/server/jiraClient';
import { withTeam } from '@/lib/server/withTeam';

const bodySchema = z.object({
  jiraStory: z
    .string()
    .regex(JIRA_KEY_RE, 'Invalid Jira story key (expected format: ABC-123)'),
});

export const POST = withTeam(async (request, { params }, { teamId, db }) => {
  const { id: releaseId } = await params;
  const body = await request.json();

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) throw new ApiError(400, parsed.error.issues[0].message);

  const settings = await getTeamSettings(db, teamId);
  if (!isAiConfigured(settings)) {
    throw new ApiError(
      400,
      'AI provider not configured — set it in Admin → Settings',
    );
  }

  await getRelease(db, teamId, releaseId);

  let story;
  try {
    story = await getJiraStory(parsed.data.jiraStory);
  } catch (err) {
    throw new ApiError(400, `Jira error: ${err.message}`);
  }

  let testCases;
  try {
    testCases = await generateTestCasesFromStory(settings, story);
  } catch (err) {
    throw new ApiError(502, `AI error: ${err.message}`);
  }

  return NextResponse.json({ testCases, story });
});
