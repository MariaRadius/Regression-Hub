import { z } from 'zod';
import { get } from '@/lib/http/client';

const adminActivityEventSchema = z
  .object({
    _id: z.string(),
    category: z.string(),
    action: z.string(),
    by: z.string().nullish(),
    at: z.string(),
  })
  .passthrough();

export function listAdminActivity(query = {}, opts = {}) {
  return get('/api/admin/events', {
    params: query,
    schema: z.array(adminActivityEventSchema),
    ...opts,
  });
}
