import { z } from 'zod';
import { STATUS } from '@/lib/constants';
import { objectIdString } from '@/lib/schemas/common';

const statusEnum = z.enum([STATUS.PASS, STATUS.FAIL, STATUS.PENDING]);

/**
 * Body schema for recording a single result.
 * BR-15: testedBy is forced to self for QA users; admins may set it to any
 * active QA user. The route enforces this — the schema accepts the field.
 * R21: notes required when status is Fail; reason required when resetting to
 * Pending. The route enforces this at the data layer.
 */
export const recordResultBodySchema = z.object({
  caseId: z.string().min(1),
  releaseId: objectIdString,
  environment: z.string().min(1),
  status: statusEnum,
  testedBy: z.string().min(1).optional(),
  testedOn: z.string().optional(),
  notes: z.string().optional(),
  reason: z.string().optional(),
});

/**
 * Body schema for bulk-recording results (pass/fail/pending across many cases).
 * Each entry in `results` follows the same shape as a single record write.
 */
export const bulkRecordResultBodySchema = z.object({
  releaseId: objectIdString,
  environment: z.string().min(1),
  status: statusEnum,
  caseIds: z.array(z.string().min(1)).min(1),
  testedBy: z.string().min(1).optional(),
  testedOn: z.string().optional(),
  notes: z.string().optional(),
  reason: z.string().optional(),
});

/** Shape of a single result document returned to the client. */
export const resultSchema = z
  .object({
    _id: z.string(),
    caseId: z.string(),
    releaseId: z.string(),
    environment: z.string(),
    status: statusEnum,
    testedBy: z.string().optional(),
    testedOn: z.string().or(z.date()).optional(),
    notes: z.string().optional(),
    reason: z.string().optional(),
    teamId: z.string().optional(),
  })
  .passthrough();

export const resultsListSchema = z.array(resultSchema);

/** Summary counts for a given (release, environment) pair. */
export const resultSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  passed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
  passRate: z.number().min(0).max(100),
});
