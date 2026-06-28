import { z } from 'zod';
import { post } from '@/lib/http/client';

const staleStorySchema = z.object({
  storyKey: z.string(),
  jiraSummary: z.string(),
  jiraUpdatedAt: z.string(),
});

const syncResponseSchema = z.object({
  stories: z.array(staleStorySchema),
  jiraError: z.string().optional(),
});

/**
 * Triggers a server-side Jira story-watch sync and returns stale stories.
 * Silently returns [] if Jira is unconfigured or unreachable.
 *
 * @returns {Promise<{ stories: Array<{ storyKey: string, jiraSummary: string, jiraUpdatedAt: string }>, jiraError?: string }>}
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
  return { stories: result?.stories ?? [], jiraError: result?.jiraError };
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
