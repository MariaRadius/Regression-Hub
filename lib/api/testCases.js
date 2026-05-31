import { CONFIRM_TOKENS } from '@/lib/constants';
import { get, patch, post } from '@/lib/http/client';
import {
  createTestCaseResponseSchema,
  okResponseSchema,
  resetTeamResponseSchema,
  testCaseSchema,
  testCasesListResponseSchema,
} from '@/lib/schemas/testCases';

export function getTestCase(id, opts = {}) {
  return get(`/api/test-cases/${id}`, {
    schema: testCaseSchema,
    ...opts,
  });
}

export function listTestCases(query = {}, opts = {}) {
  return get('/api/test-cases', {
    params: query,
    schema: testCasesListResponseSchema,
    ...opts,
  });
}

export function createTestCase(body, opts = {}) {
  return post('/api/test-cases', body, {
    schema: createTestCaseResponseSchema,
    ...opts,
  });
}

export function updateTestCase(id, body, opts = {}) {
  return patch(`/api/test-cases/${id}`, body, {
    schema: okResponseSchema,
    ...opts,
  });
}

export function resetTeamTestCases(
  body = { confirm: CONFIRM_TOKENS.RESET },
  opts = {},
) {
  return post('/api/test-cases/reset-team', body, {
    schema: resetTeamResponseSchema,
    ...opts,
  });
}
