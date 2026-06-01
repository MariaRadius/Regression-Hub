import { z } from 'zod';
import { objectIdString } from '@/lib/schemas/common';

/** Body schema for creating an empty release. */
export const createReleaseBodySchema = z.object({
  name: z.string().min(1),
  environments: z.array(z.string().min(1)).min(1),
});

/** Body schema for cloning an existing release into a new one. */
export const cloneReleaseBodySchema = z.object({
  name: z.string().min(1),
  environments: z.array(z.string().min(1)).min(1),
  sourceReleaseId: objectIdString,
  carryAssignments: z.boolean().optional().default(false),
});

/** Body schema for updating a release (name and/or archived flag). */
export const updateReleaseBodySchema = z
  .object({
    name: z.string().min(1).optional(),
    archived: z.boolean().optional(),
  })
  .refine((data) => data.name !== undefined || data.archived !== undefined, {
    message: 'At least one of name or archived must be provided',
  });

/** Body schema for adding an environment to a release. */
export const addEnvironmentBodySchema = z.object({
  environment: z.string().min(1),
});

/**
 * Body schema for removing an environment from a release.
 * Caller must pass confirm: 'DELETE_ENVIRONMENT' to proceed.
 */
export const removeEnvironmentBodySchema = z.object({
  environment: z.string().min(1),
  confirm: z.literal('DELETE_ENVIRONMENT'),
});

/**
 * Body schema for deleting a release.
 * Caller must pass confirm: 'DELETE' to proceed.
 */
export const deleteReleaseBodySchema = z.object({
  confirm: z.literal('DELETE'),
});

/** Shape of a single release document returned to the client. */
export const releaseSchema = z
  .object({
    _id: z.string(),
    name: z.string(),
    teamId: z.string(),
    environments: z.array(z.string()),
    archived: z.boolean(),
    sourceReleaseId: z.string().optional(),
    createdAt: z.string().or(z.date()).optional(),
    updatedAt: z.string().or(z.date()).optional(),
  })
  .passthrough();

export const releasesListSchema = z.array(releaseSchema);

export const createReleaseResponseSchema = z.object({
  ok: z.literal(true),
  id: z.string(),
});
