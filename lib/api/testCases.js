import { CONFIRM_TOKENS } from '@/lib/constants';
import { post } from '@/lib/http/client';
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
