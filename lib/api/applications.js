import { z } from 'zod';
import { get } from '@/lib/http/client';

const applicationSchema = z
  .object({
    name: z.string(),
    initial: z.string(),
  })
  .passthrough();

const applicationsListSchema = z.array(applicationSchema);

/**
 * List all applications for the current team.
 *
 * @param {object} [opts]
 * @returns {Promise<Array<{ name: string, initial: string }>>}
 */
export function listApplications(opts = {}) {
  return get('/api/applications', { schema: applicationsListSchema, ...opts });
}
