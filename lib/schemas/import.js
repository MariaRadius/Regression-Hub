import { z } from 'zod';

/**
 * A single row in the JSON import payload (13 data fields + client-derived fingerprint).
 * softwareVersionTested is intentionally NOT included (not emitted by the client parser).
 * releaseId comes from the URL path param, never the body.
 */
// Coerce nullable string fields: null values from JSON serialization are
// converted to empty strings rather than rejected with a 400.
const nullableString = z
  .string()
  .nullable()
  .optional()
  .transform((v) => v ?? '');

const importRowSchema = z.object({
  applicationName: nullableString,
  moduleName: nullableString,
  type: nullableString,
  traceability: nullableString,
  testKey: nullableString,
  testCase: z.string(),
  preconditions: nullableString,
  steps: nullableString,
  expectedResult: z.string(),
  notes: nullableString,
  status: nullableString,
  testedBy: nullableString,
  testedOn: nullableString,
  /** Client-derived slugify(testCase). Trusted by server (decision B). */
  fingerprint: nullableString,
});

/**
 * Request body schema for POST /api/releases/[id]/import (application/json).
 *
 * - analyse (preview): { rows: Row[] }                     (confirmed absent/false)
 * - commit:            { rows: Row[], confirmed: true, environment: string, appInitialOverrides?: Record<string,string> }
 *
 * releaseId comes from the path param, never the body.
 */
export const importBodySchema = z.object({
  rows: z.array(importRowSchema),
  confirmed: z.boolean().optional(),
  environment: z.string().optional(),
  /**
   * Admin-supplied overrides mapping application name → desired 3-char initial.
   * Values must be exactly 3 uppercase alphanumeric characters.
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
  /** Present for update rows: the MongoDB _id of the matched existing test case document. */
  existingTcId: z.string().optional(),
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
