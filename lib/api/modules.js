import { get, post } from '@/lib/http/client';
import {
  createModuleBodySchema,
  moduleSchema,
  modulesListSchema,
} from '@/lib/schemas/modules';

export function listModules(query = {}, opts = {}) {
  return get('/api/modules', {
    params: query.applicationId
      ? { applicationId: query.applicationId }
      : undefined,
    schema: modulesListSchema,
    ...opts,
  });
}

export function createModule(body, opts = {}) {
  return post('/api/modules', body, {
    schema: moduleSchema,
    ...opts,
  });
}

export { createModuleBodySchema };
