import { get } from '@/lib/http/client';
import { settingsResponseSchema } from '@/lib/schemas/settings';

export function getSettings(opts = {}) {
  return get('/api/settings', {
    schema: settingsResponseSchema,
    ...opts,
  });
}
