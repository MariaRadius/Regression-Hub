import { z } from 'zod';
import { del, get, patch, post, request } from '@/lib/http/client';
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
const testCaseEventsSchema = z.array(
  z
    .object({
      _id: z.string(),
      category: z.string(),
      action: z.string(),
      by: z.string().nullish(),
      at: z.string(),
      environment: z.string().nullish(),
      releaseId: z.string().nullish(),
      status: z.string().nullish(),
      assignedTo: z.string().nullish(),
      notes: z.string().nullish(),
      reason: z.string().nullish(),
      changes: z
        .array(
          z.object({
            field: z.string(),
            label: z.string(),
            before: z.string().nullish(),
            after: z.string().nullish(),
          }),
        )
        .optional(),
    })
    .passthrough(),
);

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
 * Get a single test case within a release, joined to its testResults row for
 * the active environment so status/testedBy/assignedTo are env-scoped.
 *
 * @param {string} releaseId
 * @param {string} tcId - MongoDB `_id` of the test case
 * @param {{ environment?: string }} [query]
 * @param {object} [opts]
 */
export function getTestCaseForRelease(releaseId, tcId, query = {}, opts = {}) {
  return get(`/api/releases/${releaseId}/test-cases/${tcId}`, {
    params: query,
    schema: z.object({ _id: z.string() }).passthrough(),
    ...opts,
  });
}

/**
 * Lazy-load the per-case activity history for a release-scoped test case.
 *
 * @param {string} releaseId
 * @param {string} tcId
 * @param {object} [opts]
 */
export function listTestCaseEventsForRelease(releaseId, tcId, opts = {}) {
  return get(`/api/releases/${releaseId}/test-cases/${tcId}/events`, {
    schema: testCaseEventsSchema,
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
 * @param {string} tcId - MongoDB `_id` of the test case
 * @param {object} body
 * @param {object} [opts]
 */
export function updateTestCaseForRelease(releaseId, tcId, body, opts = {}) {
  return patch(`/api/releases/${releaseId}/test-cases/${tcId}`, body, {
    schema: zOk,
    ...opts,
  });
}

/**
 * Delete a test case within a release (cascade: results, assignments).
 *
 * @param {string} releaseId
 * @param {string} tcId - MongoDB `_id` of the test case
 * @param {object} [opts]
 */
export function deleteTestCaseForRelease(releaseId, tcId, opts = {}) {
  return del(`/api/releases/${releaseId}/test-cases/${tcId}`, {
    schema: zOk,
    ...opts,
  });
}

// ── Import ─────────────────────────────────────────────────────────────────

/**
 * Gzip-compress a JSON-serialisable value using the browser-native
 * CompressionStream API (no dependency). Returns a Blob with the compressed
 * bytes so the caller can POST it directly.
 *
 * @param {unknown} value
 * @returns {Promise<Blob>}
 */
async function gzipJson(value) {
  const json = JSON.stringify(value);
  const bytes = new TextEncoder().encode(json);
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  await writer.write(bytes);
  await writer.close();
  return new Response(cs.readable).blob();
}

/**
 * Two-phase gzip+JSON import into a release.
 * When confirmed is false (or absent) returns an analysis preview.
 * When confirmed is true commits the transaction.
 *
 * The body is JSON-serialised then gzip-compressed client-side (browser-native
 * CompressionStream) and sent as application/gzip. The server gunzips before
 * parsing — no format change from Phase 2, only compression in transit.
 *
 * Body shape:
 *   analyse:  { rows: Row[] }
 *   commit:   { rows: Row[], confirmed: true, environment: string, appInitialOverrides?: Record<string,string> }
 *
 * @param {string} releaseId
 * @param {{ rows: object[], confirmed?: boolean, environment?: string, appInitialOverrides?: Record<string,string> }} body
 * @param {object} [opts]
 */
export async function importIntoRelease(releaseId, body, opts = {}) {
  const isConfirm = body?.confirmed === true;
  const compressed = await gzipJson(body);
  return request(`/api/releases/${releaseId}/import`, {
    ...opts,
    headers: { ...opts.headers, 'Content-Type': 'application/gzip' },
    method: 'POST',
    body: compressed,
    schema: isConfirm
      ? importCommitResponseSchema
      : importAnalysisResponseSchema,
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
