import { NextResponse } from 'next/server';
import { JIRA_STORY_SYNC_BATCH_LIMIT } from '@/lib/constants';
import {
  listDistinctStoryKeys,
  listStoryWatches,
  upsertStoryWatch,
} from '@/lib/db/jiraStoryWatchesData';
import { getTeamSettings } from '@/lib/db/settingsData';
import { getIssuesByKeys, isJiraConfigured } from '@/lib/server/jiraClient';
import { withTeam } from '@/lib/server/withTeam';

/**
 * POST /api/jira/sync-story-watches
 *
 * Checks Jira for updates to story keys linked to the team's test cases.
 * Throttled: only re-fetches from Jira when jiraCheckedAt is older than
 * jiraSyncThrottleHours (team setting, default 1 h). Stale stories (title or
 * description changed since last acknowledgement) are returned so the UI can
 * surface notification badges.
 *
 * Open to all authenticated users (withTeam) — QA and admin both see the bell.
 */
export const POST = withTeam(async (request, _ctx, { teamId, db }) => {
  const { searchParams } = new URL(request.url);
  const force = searchParams.get('force') === 'true';

  const settings = await getTeamSettings(db, teamId);
  const jiraConfig = {
    jiraBaseUrl: settings.jiraBaseUrl,
    jiraEmail: settings.jiraEmail,
    jiraApiToken: settings.jiraApiToken,
  };

  if (!isJiraConfigured(jiraConfig)) {
    return NextResponse.json({ stories: [] });
  }

  const allKeys = await listDistinctStoryKeys(db, teamId);
  if (allKeys.length === 0) {
    return NextResponse.json({ stories: [] });
  }

  const keys = allKeys.slice(0, JIRA_STORY_SYNC_BATCH_LIMIT);
  const watches = await listStoryWatches(db, teamId);
  const watchMap = Object.fromEntries(watches.map((w) => [w.storyKey, w]));

  const throttleCutoff = new Date(
    Date.now() - settings.jiraSyncThrottleHours * 3_600_000,
  );
  const keysToRefresh = force
    ? keys
    : keys.filter((k) => {
        const w = watchMap[k];
        return !w?.jiraCheckedAt || w.jiraCheckedAt < throttleCutoff;
      });

  let jiraError = null;
  if (keysToRefresh.length > 0) {
    try {
      const issues = await getIssuesByKeys(keysToRefresh, jiraConfig);
      await Promise.all(
        issues.map((issue) =>
          upsertStoryWatch(db, teamId, {
            storyKey: issue.key,
            jiraUpdatedAt: issue.updatedAt,
            jiraSummary: issue.summary,
            jiraDescription: issue.description,
          }),
        ),
      );
      // Merge upserted values into watchMap for stale computation
      for (const issue of issues) {
        watchMap[issue.key] = {
          ...watchMap[issue.key],
          storyKey: issue.key,
          jiraUpdatedAt: issue.updatedAt,
          jiraSummary: issue.summary,
          jiraDescription: issue.description,
          jiraCheckedAt: new Date(),
        };
      }
    } catch (err) {
      // Graceful degradation: serve from cache if Jira is unreachable.
      // Surface the error message so the client can warn the user.
      jiraError = err?.message ?? 'Jira sync failed';
      console.error('[sync-story-watches] Jira fetch failed:', err?.message);
    }
  }

  const stale = keys
    .map((k) => watchMap[k])
    .filter((w) => {
      if (!w?.jiraSummary && !w?.jiraDescription) return false;
      if (!w.acknowledgedAt) return true;
      const summaryChanged =
        (w.jiraSummary ?? '') !== (w.acknowledgedSummary ?? '');
      const descriptionChanged =
        (w.jiraDescription ?? '') !== (w.acknowledgedDescription ?? '');
      return summaryChanged || descriptionChanged;
    })
    .map((w) => ({
      storyKey: w.storyKey,
      jiraSummary: w.jiraSummary ?? '',
      jiraUpdatedAt:
        w.jiraUpdatedAt instanceof Date
          ? w.jiraUpdatedAt.toISOString()
          : w.jiraUpdatedAt,
    }));

  return NextResponse.json({
    stories: stale,
    ...(jiraError ? { jiraError } : {}),
  });
});
