import { z } from 'zod';
import { del, get, patch, post } from '@/lib/http/client';
import {
  importAnalysisResponseSchema,
  importCommitResponseSchema,
} from '@/lib/schemas/import';
import {
  addEnvironmentBodySchema,
  cloneReleaseBodySchema,
  createReleaseBodySchema,
  createReleaseResponseSchema,
  deleteReleaseBodySchema,
  releaseSchema,
  releasesListSchema,
  removeEnvironmentBodySchema,
  updateReleaseBodySchema,
} from '@/lib/schemas/releases';
import { testCasesListResponseSchema } from '@/lib/schemas/testCases';

const zOk = z.object({ ok: z.literal(true) });
const createTestCaseResponseSchema = z.object({
  ok: z.literal(true),
  id: z.string(),
});

// ── Releases ───────────────────────────────────────────────────────────────

/**
 * List all releases for the current team.
 *
 * @param {{ includeArchived?: boolean }} [query]
 * @param {object} [opts]
 */
export function listReleases(query = {}, opts = {}) {
  return get('/api/releases', {
    params: query,
    schema: releasesListSchema,
    ...opts,
  });
}

/**
 * Get a single release by ID.
 *
 * @param {string} id
 * @param {object} [opts]
 */
export function getRelease(id, opts = {}) {
  return get(`/api/releases/${id}`, { schema: releaseSchema, ...opts });
}

/**
 * Create an empty release.
 *
 * @param {import('@/lib/schemas/releases').CreateReleaseBody} body
 * @param {object} [opts]
 */
export function createRelease(body, opts = {}) {
  return post('/api/releases', body, {
    schema: createReleaseResponseSchema,
    ...opts,
  });
}

/**
 * Clone an existing release into a new one.
 *
 * @param {import('@/lib/schemas/releases').CloneReleaseBody} body
 * @param {object} [opts]
 */
export function cloneRelease(body, opts = {}) {
  return post('/api/releases', body, {
    schema: createReleaseResponseSchema,
    ...opts,
  });
}

/**
 * Update a release's name and/or archived flag.
 *
 * @param {string} id
 * @param {import('@/lib/schemas/releases').UpdateReleaseBody} body
 * @param {object} [opts]
 */
export function updateRelease(id, body, opts = {}) {
  return patch(`/api/releases/${id}`, body, { schema: zOk, ...opts });
}

/**
 * Delete a release (cascade: test cases, results, assignments).
 * Requires confirm: 'DELETE' in body.
 *
 * @param {string} id
 * @param {{ confirm: 'DELETE' }} body
 * @param {object} [opts]
 */
export function deleteRelease(id, body, opts = {}) {
  return del(`/api/releases/${id}`, { ...opts, body });
}

// ── Environments ───────────────────────────────────────────────────────────

/**
 * Add an environment to a release.
 *
 * @param {string} releaseId
 * @param {{ environment: string }} body
 * @param {object} [opts]
 */
export function addEnvironment(releaseId, body, opts = {}) {
  return post(`/api/releases/${releaseId}/environments`, body, {
    schema: zOk,
    ...opts,
  });
}

/**
 * Remove an environment from a release.
 * Requires confirm: 'DELETE_ENVIRONMENT' in body.
 *
 * @param {string} releaseId
 * @param {{ environment: string, confirm: 'DELETE_ENVIRONMENT' }} body
 * @param {object} [opts]
 */
export function removeEnvironment(releaseId, body, opts = {}) {
  return del(`/api/releases/${releaseId}/environments`, { ...opts, body });
}

// ── Test Cases (release-scoped) ────────────────────────────────────────────

/**
 * List test cases (via results) for a release and environment.
 *
 * @param {string} releaseId
 * @param {object} [query]
 * @param {object} [opts]
 */
export function listTestCasesForRelease(releaseId, query = {}, opts = {}) {
  return get(`/api/releases/${releaseId}/test-cases`, {
    params: query,
    schema: testCasesListResponseSchema,
    ...opts,
  });
}

/**
 * Get a single test case within a release.
 *
 * @param {string} releaseId
 * @param {string} caseId
 * @param {object} [opts]
 */
export function getTestCaseForRelease(releaseId, caseId, opts = {}) {
  return get(`/api/releases/${releaseId}/test-cases/${caseId}`, {
    schema: z.object({ _id: z.string() }).passthrough(),
    ...opts,
  });
}

/**
 * Create a test case within a release.
 *
 * @param {string} releaseId
 * @param {object} body
 * @param {object} [opts]
 */
export function createTestCaseForRelease(releaseId, body, opts = {}) {
  return post(`/api/releases/${releaseId}/test-cases`, body, {
    schema: createTestCaseResponseSchema,
    ...opts,
  });
}

/**
 * Update a test case within a release.
 *
 * @param {string} releaseId
 * @param {string} caseId
 * @param {object} body
 * @param {object} [opts]
 */
export function updateTestCaseForRelease(releaseId, caseId, body, opts = {}) {
  return patch(`/api/releases/${releaseId}/test-cases/${caseId}`, body, {
    schema: zOk,
    ...opts,
  });
}

/**
 * Delete a test case within a release (cascade: results, assignments).
 *
 * @param {string} releaseId
 * @param {string} caseId
 * @param {object} [opts]
 */
export function deleteTestCaseForRelease(releaseId, caseId, opts = {}) {
  return del(`/api/releases/${releaseId}/test-cases/${caseId}`, {
    schema: zOk,
    ...opts,
  });
}

// ── Import ─────────────────────────────────────────────────────────────────

/**
 * Two-phase Excel import into a release.
 * When confirmed is false (or absent) returns an analysis preview.
 * When confirmed is true commits the transaction.
 *
 * Accepts FormData (with file) or a plain JSON body for the confirmed=true commit.
 *
 * @param {string} releaseId
 * @param {FormData | object} body
 * @param {object} [opts]
 */
export function importIntoRelease(releaseId, body, opts = {}) {
  const isConfirm =
    body instanceof FormData
      ? body.get('confirmed') === 'true'
      : body?.confirmed === true;
  return post(`/api/releases/${releaseId}/import`, body, {
    schema: isConfirm
      ? importCommitResponseSchema
      : importAnalysisResponseSchema,
    ...opts,
  });
}

export {
  addEnvironmentBodySchema,
  cloneReleaseBodySchema,
  createReleaseBodySchema,
  deleteReleaseBodySchema,
  removeEnvironmentBodySchema,
  updateReleaseBodySchema,
};
