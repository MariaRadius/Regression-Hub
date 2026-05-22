import { del, get, patch, post } from '@/lib/http/client';
import { usersListSchema } from '@/lib/schemas/users';
import { z } from 'zod';

const zOk = z.object({ ok: z.literal(true) });
const zCreate = z.object({ ok: z.literal(true), id: z.string() });

export function listUsers(opts = {}) {
  return get('/api/users', { schema: usersListSchema, ...opts });
}

export function createUser(body, opts = {}) {
  return post('/api/users', body, { schema: zCreate, ...opts });
}

export function updateUser(id, body, opts = {}) {
  return patch(`/api/users/${id}`, body, { schema: zOk, ...opts });
}

export function deactivateUser(id, opts = {}) {
  return del(`/api/users/${id}`, { schema: zOk, ...opts });
}
