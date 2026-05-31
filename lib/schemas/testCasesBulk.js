import { z } from 'zod';
import { jiraKeySchema, SERVER_SET_FIELDS } from '@/lib/schemas/testCases';

export const bulkUpdateBodySchema = z
  .object({
    ids: z.array(z.string()).optional(),
    filter: z
      .object({
        applicationId: z.string().optional(),
        moduleId: z.string().optional(),
        testedBy: z.string().optional(),
        version: z.string().optional(),
      })
      .optional(),
    fields: z
      .object({
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
          'fields contains server-managed fields that cannot be set by clients',
      }),
    pendingOnly: z.boolean().optional(),
  })
  .refine(
    (data) => {
      if (!data.fields) return false;
      if (data.ids?.length) return true;
      // filter path: require at least one non-empty key to prevent full-team sweeps
      if (!data.filter) return false;
      return Object.values(data.filter).some(
        (v) => v !== undefined && v !== '',
      );
    },
    { message: 'ids or non-empty filter, and fields are required' },
  );

export const bulkUpdateResponseSchema = z.object({
  ok: z.literal(true),
  updated: z.number(),
  skipped: z.number(),
});
