import { NextResponse } from 'next/server';
import { getStoryWatch } from '@/lib/db/jiraStoryWatchesData';
import { getTeamSettings } from '@/lib/db/settingsData';
import { getTestCasesByStory } from '@/lib/db/testCasesData';
import { ApiError } from '@/lib/errors';
import { JIRA_KEY_RE } from '@/lib/schemas/testCases';
import { analyzeTestCaseImpact, isAiConfigured } from '@/lib/server/aiClient';
import { getJiraStory, isJiraConfigured } from '@/lib/server/jiraClient';
import { withTeam } from '@/lib/server/withTeam';

/**
 * POST /api/jira/stories/[storyKey]/ai-impact
 *
 * Runs AI impact analysis on all test cases linked to a Jira story.
 * Compares the last-acknowledged snapshot to current Jira content and returns
 * affectedCases, newCases, and obsoleteCases.
 *
 * Open to all authenticated users — analysis is read-only.
 */
export const POST = withTeam(async (_request, { params }, { teamId, db }) => {
  const { storyKey } = await params;

  if (!JIRA_KEY_RE.test(storyKey)) {
    throw new ApiError(400, 'Invalid storyKey format (expected e.g. RXR-123)');
  }

  const settings = await getTeamSettings(db, teamId);
  const jiraConfig = {
    jiraBaseUrl: settings.jiraBaseUrl,
    jiraEmail: settings.jiraEmail,
    jiraApiToken: settings.jiraApiToken,
  };

  if (!isJiraConfigured(jiraConfig)) {
    throw new ApiError(422, 'Jira integration is not configured');
  }
  if (!isAiConfigured(settings)) {
    throw new ApiError(422, 'AI provider is not configured');
  }

  const [watch, testCases] = await Promise.all([
    getStoryWatch(db, teamId, storyKey),
    getTestCasesByStory(db, teamId, storyKey),
  ]);

  let story;
  try {
    story = await getJiraStory(storyKey, jiraConfig);
  } catch (err) {
    throw new ApiError(400, err?.message ?? 'Failed to fetch story from Jira');
  }

  const impact = await analyzeTestCaseImpact(settings, {
    oldSummary: watch?.acknowledgedSummary ?? '',
    oldDescription: watch?.acknowledgedDescription ?? '',
    newSummary: story.summary,
    newDescription: story.description,
    acceptanceCriteria: story.acceptanceCriteria,
    existingTestCases: testCases,
  });

  const tcMap = new Map(testCases.map((tc) => [tc._id, tc]));
  const changedIds = new Set([
    ...impact.affectedCases.map((c) => c.id),
    ...impact.obsoleteCases.map((c) => c.id),
  ]);

  const enrichedImpact = {
    affectedCases: impact.affectedCases.map((c) => ({
      ...c,
      testKey: tcMap.get(c.id)?.testKey ?? null,
      testCase: tcMap.get(c.id)?.testCase ?? '',
    })),
    newCases: impact.newCases,
    obsoleteCases: impact.obsoleteCases.map((c) => ({
      ...c,
      testKey: tcMap.get(c.id)?.testKey ?? null,
      testCase: tcMap.get(c.id)?.testCase ?? '',
    })),
    unaffectedCases: testCases
      .filter((tc) => !changedIds.has(tc._id))
      .map((tc) => ({
        id: tc._id,
        testKey: tc.testKey ?? null,
        testCase: tc.testCase,
      })),
  };

  return NextResponse.json({
    story: {
      key: story.key,
      summary: story.summary,
      acceptanceCriteria: story.acceptanceCriteria,
    },
    impact: enrichedImpact,
  });
});
