import { z } from 'zod';
import { CONFIRM_TOKENS } from '@/lib/constants';
import { del, get, patch, post } from '@/lib/http/client';
import { resetTeamResponseSchema } from '@/lib/schemas/testCases';

export function resetTeamTestCases(
  body = { confirm: CONFIRM_TOKENS.RESET },
  opts = {},
) {
  return post('/api/test-cases/reset-team', body, {
    schema: resetTeamResponseSchema,
    ...opts,
  });
}

const generatedCasesResponseSchema = z.object({
  cases: z.array(z.object({ _id: z.string() }).passthrough()),
  total: z.number(),
  page: z.number(),
  totalPages: z.number(),
});

/**
 * Fetches AI-generated test cases across all releases for the current team.
 *
 * @param {{ page?: number, pageSize?: number, search?: string, appId?: string, moduleId?: string }} params
 */
export function getGeneratedTestCases(params = {}) {
  const qs = new URLSearchParams(
    Object.fromEntries(
      Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([k, v]) => [k, String(v)]),
    ),
  ).toString();
  const url = `/api/test-cases/generated${qs ? `?${qs}` : ''}`;
  return get(url, { schema: generatedCasesResponseSchema });
}

/**
 * Updates content fields on a test case within a release.
 * @param {string} releaseId
 * @param {string} tcId
 * @param {object} fields - partial test case fields (testCase, steps, expectedResult, etc.)
 */
export function updateTestCaseContent(releaseId, tcId, fields) {
  return patch(`/api/releases/${releaseId}/test-cases/${tcId}`, fields);
}

/**
 * Deletes a test case by ID.
 * Requires the release context for audit logging; sends { confirm: 'DELETE' } body.
 * @param {string} releaseId
 * @param {string} tcId
 */
export function deleteTestCaseById(releaseId, tcId) {
  return del(`/api/releases/${releaseId}/test-cases/${tcId}`, {
    body: { confirm: CONFIRM_TOKENS.DELETE },
  });
}

/**
 * Creates a test case in the given release with result rows for all environments.
 * @param {string} releaseId
 * @param {object} body - must include applicationId, moduleId, testCase, and other fields
 */
export function createTestCaseInRelease(releaseId, body) {
  return post(`/api/releases/${releaseId}/test-cases`, body);
}
