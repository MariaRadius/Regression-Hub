import { z } from 'zod';
import { get, post } from '@/lib/http/client';

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

const createdApplicationSchema = z
  .object({ _id: z.string(), name: z.string(), initial: z.string() })
  .passthrough();

/**
 * Create a new application for the current team.
 *
 * @param {{ name: string, initial?: string }} body
 * @returns {Promise<{ _id: string, name: string, initial: string }>}
 */
export function createApplication(body, opts = {}) {
  return post('/api/applications', body, {
    schema: createdApplicationSchema,
    ...opts,
  });
}
