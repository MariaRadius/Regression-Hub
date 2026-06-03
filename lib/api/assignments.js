import { z } from 'zod';
import { post } from '@/lib/http/client';

const zCreate = z.object({ ok: z.literal(true), testCaseCount: z.number() });

export function createAssignment(body, opts = {}) {
  return post('/api/assignments', body, { schema: zCreate, ...opts });
}
