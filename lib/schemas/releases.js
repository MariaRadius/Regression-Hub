import { z } from 'zod';
import { objectIdString } from '@/lib/schemas/common';

/**
 * Trimmed, non-empty release name that does not contain "/".
 *
 * @see {@link lib/__tests__/schemas/releases.test.js}
 */
export const releaseNameSchema = z
  .string()
  .trim()
  .min(1, 'Release name is required')
  .refine((v) => !v.includes('/'), 'Release name cannot contain "/"');

/**
 * Trimmed, non-empty environment name that does not contain "/".
 *
 * @see {@link lib/__tests__/schemas/releases.test.js}
 */
export const environmentNameSchema = z
  .string()
  .trim()
  .min(1, 'Environment is required')
  .refine((v) => !v.includes('/'), 'Environment cannot contain "/"');

/** Body schema for creating an empty release. */
export const createReleaseBodySchema = z.object({
  name: releaseNameSchema,
  environments: z.array(environmentNameSchema).min(1),
  jiraSprintId: z.string().trim().nullable().optional(),
});

/** Body schema for cloning an existing release into a new one. */
export const cloneReleaseBodySchema = z.object({
  name: releaseNameSchema,
  environments: z.array(environmentNameSchema).min(1),
  sourceReleaseId: objectIdString,
  carryAssignments: z.boolean().optional().default(false),
  jiraSprintId: z.string().trim().nullable().optional(),
});

/** Body schema for updating a release (name and/or archived flag). */
export const updateReleaseBodySchema = z
  .object({
    name: releaseNameSchema.optional(),
    archived: z.boolean().optional(),
    jiraSprintId: z.string().trim().nullable().optional(),
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.archived !== undefined ||
      data.jiraSprintId !== undefined,
    {
      message:
        'At least one of name, archived, or jiraSprintId must be provided',
    },
  );

/** Body schema for adding an environment to a release. */
export const addEnvironmentBodySchema = z.object({
  environment: environmentNameSchema,
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
    jiraSprintId: z.string().nullable().optional(),
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
