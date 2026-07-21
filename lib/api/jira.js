import { z } from 'zod';
import { get, post } from '@/lib/http/client';

const staleStorySchema = z.object({
  storyKey: z.string(),
  jiraSummary: z.string(),
  jiraUpdatedAt: z.string().nullable().optional(),
});

const discardedStorySchema = z.object({
  storyKey: z.string(),
  jiraSummary: z.string(),
  jiraStatus: z.string().nullable(),
});

const syncResponseSchema = z.object({
  stories: z.array(staleStorySchema),
  discarded: z.array(discardedStorySchema).default([]),
  jiraError: z.string().optional(),
});

/**
 * Triggers a server-side Jira story-watch sync and returns stale and
 * discarded stories. Silently returns [] if Jira is unconfigured or unreachable.
 *
 * @returns {Promise<{ stories: Array, discarded: Array, jiraError?: string }>}
 */
export async function syncStoryWatches({ force = false } = {}) {
  const path = force
    ? '/api/jira/sync-story-watches?force=true'
    : '/api/jira/sync-story-watches';
  const result = await post(
    path,
    {},
    { schema: syncResponseSchema, silentFailure: true },
  );
  return {
    stories: result?.stories ?? [],
    discarded: result?.discarded ?? [],
    jiraError: result?.jiraError,
  };
}

/**
 * Returns test cases linked to a Jira story key (lean projection for
 * the discard review dialog).
 *
 * @param {string} storyKey
 */
export function getStoryTestCases(storyKey) {
  return get(`/api/jira/stories/${encodeURIComponent(storyKey)}/test-cases`, {
    schema: z.object({
      testCases: z.array(z.object({ _id: z.string() }).passthrough()),
    }),
    silentFailure: true,
  });
}

/**
 * Acknowledges a discarded story's review — deletes the selected test cases
 * and marks the story so it no longer surfaces in the discard panel.
 *
 * @param {string} storyKey
 * @param {{ deleteIds: string[] }} body
 */
export function acknowledgeDiscardedStory(storyKey, body) {
  return post(
    `/api/jira/stories/${encodeURIComponent(storyKey)}/discard-acknowledge`,
    body,
    { suppressToastForStatus: [400, 403, 500] },
  );
}

/**
 * Acknowledges a single stale story or all stale stories.
 *
 * @param {{ storyKey?: string, all?: boolean }} body
 */
export function acknowledgeStory(body) {
  return post('/api/jira/acknowledge-story', body, { silentFailure: true });
}

import {
  jiraDraftsResponseSchema,
  jiraOutcomeSchema,
} from '@/lib/schemas/jira';

/**
 * Build editable Jira issue drafts for failed cases (ask-mode step 1).
 *
 * @param {string} releaseId
 * @param {{ environment: string, tcIds: string[], notes: string }} body
 * @param {object} [opts]
 */
export function buildJiraDrafts(releaseId, body, opts = {}) {
  return post(`/api/releases/${releaseId}/jira-drafts`, body, {
    schema: jiraDraftsResponseSchema,
    ...opts,
  });
}

/**
 * Create reviewed Jira issues from (possibly edited) drafts (ask-mode step 2).
 *
 * @param {string} releaseId
 * @param {{ environment: string, issues: Array<{ tcId: string, summary: string, description: string }> }} body
 * @param {object} [opts]
 */
export function createJiraIssues(releaseId, body, opts = {}) {
  return post(`/api/releases/${releaseId}/jira-issues`, body, {
    schema: jiraOutcomeSchema,
    ...opts,
  });
}

const improvedDraftSchema = z.object({
  summary: z.string(),
  description: z.string(),
});

/**
 * AI-improves a single Jira issue draft (summary + description).
 * Returns the rewritten text for the QA to review before creating the issue.
 *
 * @param {string} releaseId
 * @param {{ summary: string, description: string }} body
 * @param {object} [opts]
 */
export function improveJiraDraft(releaseId, body, opts = {}) {
  return post(`/api/releases/${releaseId}/jira-improve-draft`, body, {
    schema: improvedDraftSchema,
    ...opts,
  });
}

/**
 * Runs AI impact analysis for the given story key.
 *
 * @param {string} storyKey - e.g. "RXR-42"
 * @returns {Promise<{ story: object, impact: { affectedCases: [], newCases: [], obsoleteCases: [] } }>}
 */
export function analyzeStoryImpact(storyKey) {
  // The dialog renders the error inline, so suppress the global toast to avoid
  // showing the same message twice.
  return post(
    `/api/jira/stories/${encodeURIComponent(storyKey)}/ai-impact`,
    {},
    {
      suppressToastForStatus: [400, 422, 500, 502],
    },
  );
}
