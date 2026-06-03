import { z } from 'zod';
import { objectIdString } from '@/lib/schemas/common';

/**
 * Body schema for assigning test cases. The scope is the union of explicit
 * `tcIds` plus all cases in the given applications/modules; at least one scope
 * source is required. Every assignment targets one or more concrete
 * environments.
 */
export const createAssignmentBodySchema = z
  .object({
    releaseId: objectIdString,
    assignedTo: z.string().min(1),
    tcIds: z.array(z.string().min(1)).optional(),
    applicationIds: z.array(z.string().min(1)).optional(),
    moduleIds: z.array(z.string().min(1)).optional(),
    environments: z.array(z.string().min(1)).min(1),
  })
  .refine(
    (b) =>
      Boolean(
        b.tcIds?.length || b.applicationIds?.length || b.moduleIds?.length,
      ),
    { message: 'at least one of tcIds, applicationIds, moduleIds is required' },
  );

export const createAssignmentResponseSchema = z.object({
  ok: z.literal(true),
  testCaseCount: z.number(),
});
