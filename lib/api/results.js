import { z } from 'zod';
import { get, patch, post } from '@/lib/http/client';
import {
  bulkRecordResultBodySchema,
  caseResultsListSchema,
  recordResultBodySchema,
  resultSummarySchema,
} from '@/lib/schemas/results';

const zOk = z.object({ ok: z.literal(true) });

/**
 * Fetch the minimal per-environment execution rows for a single test case in
 * one round-trip. Backs the test-case detail panel.
 *
 * @param {string} releaseId
 * @param {string} tcId
 * @param {object} [opts]
 */
export function listCaseResults(releaseId, tcId, opts = {}) {
  return get(`/api/releases/${releaseId}/results/${tcId}`, {
    schema: caseResultsListSchema,
    ...opts,
  });
}

/**
 * Get the summary counts for a (release, environment) pair.
 *
 * @param {string} releaseId
 * @param {{ environment: string }} query
 * @param {object} [opts]
 */
export function getResultSummary(releaseId, query = {}, opts = {}) {
  return get(`/api/releases/${releaseId}/results`, {
    params: { ...query, summary: 'true' },
    schema: resultSummarySchema,
    ...opts,
  });
}

/**
 * Record a single result (Pass / Fail / Pending).
 * BR-15: QA testedBy is forced to self by the route.
 * R21: notes required on Fail; reason required on Pending reset.
 *
 * @param {string} releaseId
 * @param {import('@/lib/schemas/results').RecordResultBody} body
 * @param {object} [opts]
 */
export function recordResult(releaseId, body, opts = {}) {
  return post(`/api/releases/${releaseId}/results`, body, {
    schema: zOk,
    ...opts,
  });
}

/**
 * Bulk-record results for multiple cases in one environment.
 *
 * @param {string} releaseId
 * @param {import('@/lib/schemas/results').BulkRecordResultBody} body
 * @param {object} [opts]
 */
export function bulkRecordResults(releaseId, body, opts = {}) {
  return patch(`/api/releases/${releaseId}/results`, body, {
    schema: zOk,
    ...opts,
  });
}

export { bulkRecordResultBodySchema, recordResultBodySchema };
