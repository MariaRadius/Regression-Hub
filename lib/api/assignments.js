import { z } from 'zod';
import { del, get, post } from '@/lib/http/client';

const zOk = z.object({ ok: z.literal(true) });
const zCreate = z.object({ ok: z.literal(true), id: z.string() });
const assignmentSchema = z.object({ _id: z.string() }).passthrough();

export function listAssignments(query, opts = {}) {
  return get('/api/assignments', {
    params: query,
    schema: z.array(assignmentSchema),
    ...opts,
  });
}

export function createAssignment(body, opts = {}) {
  return post('/api/assignments', body, { schema: zCreate, ...opts });
}

export function deleteAssignment(id, opts = {}) {
  return del(`/api/assignments/${id}`, { schema: zOk, ...opts });
}
