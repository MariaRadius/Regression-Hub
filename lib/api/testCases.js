import { z } from 'zod';
import { CONFIRM_TOKENS } from '@/lib/constants';
import { get, post } from '@/lib/http/client';
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
