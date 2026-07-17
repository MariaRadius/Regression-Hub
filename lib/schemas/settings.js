import { z } from 'zod';
import { JIRA_ISSUE_MODES } from '@/lib/constants';

export const settingsResponseSchema = z
  .object({
    qaUsers: z.array(z.string()),
    failureThreshold: z.number().int().min(1).optional(),
    topModulesLimit: z.number().int().min(1).optional(),
    jiraIssueMode: z.enum(Object.values(JIRA_ISSUE_MODES)).optional(),
    // True only when the server has all Jira env vars set; the token itself
    // never reaches the client.
    jiraConfigured: z.boolean().optional(),
    jiraBaseUrl: z.string().nullish(),
    jiraProjectKey: z.string().nullish(),
  })
  .passthrough();
