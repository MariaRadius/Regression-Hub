import { z } from 'zod';
import { objectIdString } from '@/lib/schemas/common';

/** One editable draft shown in the review dialog. */
export const jiraDraftSchema = z.object({
  tcId: z.string(),
  summary: z.string(),
  description: z.string(),
  jiraStory: z.string().nullable().optional(),
});

/** Body for POST /api/releases/[id]/jira-drafts. */
export const jiraDraftsRequestSchema = z.object({
  releaseId: objectIdString,
  environment: z.string().min(1),
  tcIds: z.array(z.string().min(1)).min(1),
  notes: z.string().min(1),
});

/** Response of POST /api/releases/[id]/jira-drafts. */
export const jiraDraftsResponseSchema = z.object({
  drafts: z.array(jiraDraftSchema),
  skipped: z.array(z.object({ tcId: z.string(), reason: z.string() })),
});

/** Body for POST /api/releases/[id]/jira-issues (reviewed drafts). */
export const jiraCreateRequestSchema = z.object({
  releaseId: objectIdString,
  environment: z.string().min(1),
  issues: z
    .array(
      z.object({
        tcId: z.string().min(1),
        summary: z.string().min(1).max(255),
        description: z.string().min(1),
        skipLink: z.boolean().optional(),
        storyOverride: z.string().optional(),
      }),
    )
    .min(1),
});

/** Body for POST /api/jira/stories/[storyKey]/discard-acknowledge. */
export const discardAcknowledgeBodySchema = z.object({
  deleteIds: z.array(z.string().min(1)).default([]),
});

/**
 * Outcome of server-side Jira issue creation (lib/server/jiraOnFail.js) —
 * shared by the results response (auto mode) and the jira-issues response.
 */
export const jiraOutcomeSchema = z.object({
  created: z.array(
    z.object({
      tcId: z.string(),
      key: z.string(),
      linkError: z.string().optional(),
    }),
  ),
  skipped: z.array(z.object({ tcId: z.string(), reason: z.string() })),
  errors: z.array(z.object({ tcId: z.string(), error: z.string() })),
});
