import { get, post, patch } from '@/lib/http/client';
import {
  testCasesListResponseSchema,
  createTestCaseResponseSchema,
  okResponseSchema,
  resetTeamResponseSchema,
} from '@/lib/schemas/testCases';

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

export function resetTeamTestCases(body = { confirm: 'RESET' }, opts = {}) {
  return post('/api/test-cases/reset-team', body, {
    schema: resetTeamResponseSchema,
    ...opts,
  });
}
