import { NextResponse } from 'next/server';
import {
  JIRA_DISCARDED_STATUSES_DEFAULT,
  JIRA_STORY_SYNC_BATCH_LIMIT,
} from '@/lib/constants';
import {
  clearDiscardedAcknowledgement,
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
    return NextResponse.json({ stories: [], discarded: [] });
  }

  const allKeys = await listDistinctStoryKeys(db, teamId);
  if (allKeys.length === 0) {
    return NextResponse.json({ stories: [], discarded: [] });
  }

  const keys = allKeys.slice(0, JIRA_STORY_SYNC_BATCH_LIMIT);
  const watches = await listStoryWatches(db, teamId);
  const watchMap = Object.fromEntries(watches.map((w) => [w.storyKey, w]));

  // Snapshot sprint states from DB BEFORE the Jira refresh overwrites them.
  // Used later to detect active→null/inactive transitions (sprint removal).
  const oldSprintStates = Object.fromEntries(
    keys
      .filter((k) => watchMap[k])
      .map((k) => [k, watchMap[k].jiraSprintState]),
  );

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
            jiraStatus: issue.jiraStatus,
            jiraSprintState: issue.jiraSprintState,
          }),
        ),
      );
      // Merge upserted values into watchMap for stale/discarded computation
      for (const issue of issues) {
        watchMap[issue.key] = {
          ...watchMap[issue.key],
          storyKey: issue.key,
          jiraUpdatedAt: issue.updatedAt,
          jiraSummary: issue.summary,
          jiraDescription: issue.description,
          jiraCheckedAt: new Date(),
          jiraStatus: issue.jiraStatus,
          jiraSprintState: issue.jiraSprintState,
        };
      }
    } catch (err) {
      // Graceful degradation: serve from cache if Jira is unreachable.
      // Surface the error message so the client can warn the user.
      jiraError = err?.message ?? 'Jira sync failed';
      console.error('[sync-story-watches] Jira fetch failed:', err?.message);
    }
  }

  // Discarded is computed first so its keys can be excluded from stale.
  // A discarded story (status: Deferred/Grooming/etc. or removed from sprint)
  // should only surface the archive action — never the impact-analysis action.

  // Case-insensitive comparison: normalize both sides to lowercase.
  const discardedStatusesLower = new Set(
    (settings.jiraDiscardedStatuses ?? JIRA_DISCARDED_STATUSES_DEFAULT).map(
      (s) => s.toLowerCase(),
    ),
  );

  const isSprintRemoved = (storyKey) => {
    const wasActive = oldSprintStates[storyKey] === 'active';
    const nowActive = watchMap[storyKey]?.jiraSprintState === 'active';
    return wasActive && !nowActive;
  };

  const isDiscardedNow = (w) => {
    if (!w) return false;
    const statusDiscarded =
      w.jiraStatus && discardedStatusesLower.has(w.jiraStatus.toLowerCase());
    const sprintDiscarded =
      w.jiraSprintState === 'inactive' || isSprintRemoved(w.storyKey);
    return statusDiscarded || sprintDiscarded;
  };

  // Re-arm: when a story is no longer discarded but was previously acknowledged,
  // clear discardedAcknowledgedAt so the next discard event will resurface it.
  const reArmKeys = keys
    .map((k) => watchMap[k])
    .filter((w) => w && w.discardedAcknowledgedAt && !isDiscardedNow(w))
    .map((w) => w.storyKey);

  if (reArmKeys.length > 0) {
    await Promise.all(
      reArmKeys.map((key) => clearDiscardedAcknowledgement(db, teamId, key)),
    );
    // Clear in-memory so the map reflects the re-armed state immediately.
    for (const key of reArmKeys) {
      if (watchMap[key]) {
        watchMap[key] = { ...watchMap[key], discardedAcknowledgedAt: null };
      }
    }
  }

  const discarded = keys
    .map((k) => watchMap[k])
    .filter((w) => {
      if (!w) return false;
      if (w.discardedAcknowledgedAt) return false;
      return isDiscardedNow(w);
    })
    .map((w) => ({
      storyKey: w.storyKey,
      jiraSummary: w.jiraSummary ?? '',
      jiraStatus: w.jiraStatus ?? null,
    }));

  const discardedKeySet = new Set(discarded.map((d) => d.storyKey));

  const stale = keys
    .map((k) => watchMap[k])
    .filter((w) => {
      if (!w) return false;
      // Discarded stories are handled by the discard flow, not impact analysis.
      if (discardedKeySet.has(w.storyKey)) return false;
      if (!w.acknowledgedAt) return true;
      // Always compare content — jiraUpdatedAt alone is not reliable enough
      // to skip this (Jira index lag, old DB records with null jiraUpdatedAt,
      // or status-only changes that don't alter the `updated` timestamp).
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
          : (w.jiraUpdatedAt ?? null),
    }));

  return NextResponse.json({
    stories: stale,
    discarded,
    ...(jiraError ? { jiraError } : {}),
  });
});
