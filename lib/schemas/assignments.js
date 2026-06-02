import { z } from 'zod';
import { ENVIRONMENT_SENTINEL } from '@/lib/constants';
import { objectIdString } from '@/lib/schemas/common';

/**
 * Body schema for creating an assignment.
 * releaseId is required. environment is optional — omitting it (or passing the
 * ENVIRONMENT_SENTINEL) creates a release-wide assignment.
 * Latest-wins is the effective-owner rule; older overlapping assignments are
 * retained for history only.
 */
export const createAssignmentBodySchema = z.object({
  tcIds: z.array(z.string().min(1)).min(1),
  releaseId: objectIdString,
  assignedTo: z.string().min(1),
  /** Omit or pass ENVIRONMENT_SENTINEL for a release-wide assignment. */
  environment: z
    .string()
    .optional()
    .transform((v) => v ?? ENVIRONMENT_SENTINEL),
});

/**
 * Body schema for deleting an assignment.
 * Assignments are admin-only mutations per the role matrix (§12).
 */
export const deleteAssignmentBodySchema = z.object({
  confirm: z.literal('DELETE'),
});

/** Shape of a single assignment document returned to the client. */
export const assignmentSchema = z
  .object({
    _id: z.string(),
    tcId: z.string(),
    releaseId: z.string(),
    environment: z.string(),
    assignedTo: z.string(),
    teamId: z.string().optional(),
    createdAt: z.string().or(z.date()).optional(),
  })
  .passthrough();

export const assignmentsListSchema = z.array(assignmentSchema);

export const createAssignmentResponseSchema = z.object({
  ok: z.literal(true),
  id: z.string(),
  testCaseCount: z.number(),
});
