import { patch } from '@/lib/http/client';
import { bulkUpdateResponseSchema } from '@/lib/schemas/testCasesBulk';

export function bulkUpdateTestCases(body, opts = {}) {
  return patch('/api/test-cases-bulk', body, {
    schema: bulkUpdateResponseSchema,
    ...opts,
  });
}
