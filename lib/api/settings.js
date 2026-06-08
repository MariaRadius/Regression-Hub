import { get, patch } from '@/lib/http/client';
import { settingsResponseSchema } from '@/lib/schemas/settings';

export function getSettings(opts = {}) {
  return get('/api/settings', {
    schema: settingsResponseSchema,
    ...opts,
  });
}

export function updateAdminSettings(body, opts = {}) {
  return patch('/api/admin/settings', body, opts);
}
