import { post } from '@/lib/http/client';
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
