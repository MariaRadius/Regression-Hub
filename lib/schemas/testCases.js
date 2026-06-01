import { z } from 'zod';
import { CONFIRM_TOKENS, STATUS } from '@/lib/constants';
import { objectIdString } from '@/lib/schemas/common';

export const JIRA_KEY_RE = /^[A-Z]+-\d+$/;

export const SERVER_SET_FIELDS = ['teamId'];

export const jiraKeySchema = z
  .string()
  .refine(
    (v) => !v || JIRA_KEY_RE.test(v),
    'jiraStory must be a valid Jira key (e.g. RXR-123)',
  )
  .optional();

export const testCaseSchema = z
  .object({
    _id: z.string(),
  })
  .passthrough();

export const testCasesListResponseSchema = z.object({
  data: z.array(testCaseSchema),
  total: z.number(),
  page: z.number(),
  totalPages: z.number(),
  applications: z
    .array(z.object({ _id: z.string(), name: z.string() }))
    .optional(),
  modules: z
    .array(
      z.object({
        _id: z.string(),
        name: z.string(),
        applicationId: z.string(),
      }),
    )
    .optional(),
});

export const createTestCaseBodySchema = z
  .object({
    applicationId: objectIdString,
    moduleId: objectIdString,
    applicationName: z.string().optional(),
    moduleName: z.string().optional(),
  })
  .passthrough();

export const updateTestCaseBodySchema = z
  .object({
    status: z.enum([STATUS.PENDING, STATUS.PASS, STATUS.FAIL]).optional(),
    jiraStory: jiraKeySchema,
    testedOn: z
      .string()
      .refine(
        (v) => !v || v <= new Date().toISOString().slice(0, 10),
        'testedOn cannot be in the future',
      )
      .optional(),
  })
  .passthrough()
  .refine((data) => !SERVER_SET_FIELDS.some((f) => f in data), {
    message:
      'Payload contains server-managed fields that cannot be set by clients',
  });

export const createTestCaseResponseSchema = z.object({
  ok: z.literal(true),
  id: z.string(),
});

export const okResponseSchema = z.object({ ok: z.literal(true) });

export const resetTeamBodySchema = z.object({
  confirm: z.literal(CONFIRM_TOKENS.RESET),
});

export const resetTeamResponseSchema = z.object({
  ok: z.literal(true),
  deleted: z.object({
    testCases: z.number(),
    modules: z.number(),
    applications: z.number(),
    assignments: z.number(),
    events: z.number(),
  }),
});
