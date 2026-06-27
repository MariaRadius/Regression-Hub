import { z } from 'zod';
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
