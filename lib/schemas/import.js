import { z } from 'zod';
import { objectIdString } from '@/lib/schemas/common';

/**
 * Body schema for the two-phase import route (POST /api/releases/[id]/import).
 * When confirmed is false (or absent) the route runs dry-run analysis and returns
 * a preview. When confirmed is true the route commits the transaction.
 */
export const importBodySchema = z.object({
  releaseId: objectIdString,
  environment: z.string().min(1),
  confirmed: z.boolean().optional().default(false),
  /**
   * Admin-supplied overrides for application initials surfaced in the analysis
   * preview step. Keys are proposed initials (from the analysis); values are the
   * admin-chosen 3-char replacements (A-Z0-9, validated DB-globally unique by the
   * commit path).
   */
  appInitialOverrides: z.record(z.string().regex(/^[A-Z0-9]{3}$/)).optional(),
});

/** A single row in the import preview, representing one test case's resolution. */
export const importPreviewRowSchema = z.object({
  rowIndex: z.number().int().nonnegative(),
  testName: z.string(),
  applicationName: z.string(),
  moduleName: z.string(),
  action: z.enum(['create', 'update']),
  /** Present for update rows: the stable caseId being updated. */
  caseId: z.string().optional(),
  /** Present for update rows: the existing test key. */
  testKey: z.string().optional(),
  /** Present for update rows: the prior test-case name as it exists in the DB. */
  priorName: z.string().optional(),
  /** Present for new applications: the proposed 3-char initial before admin override. */
  proposedInitial: z.string().optional(),
  warnings: z.array(z.string()).optional(),
});

/** Full analysis response returned in the dry-run (confirmed: false) phase. */
export const importAnalysisResponseSchema = z.object({
  valid: z.boolean(),
  rows: z.array(importPreviewRowSchema),
  createCount: z.number().int().nonnegative(),
  updateCount: z.number().int().nonnegative(),
  errors: z.array(z.string()),
  warnings: z.array(z.string()),
});

/** Response returned after a successful committed import. */
export const importCommitResponseSchema = z.object({
  imported: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  releaseId: z.string(),
});
