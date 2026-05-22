import { createMockDb } from '@/lib/__tests__/helpers/mockDb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { db, reset } = createMockDb();
const { updateUser, deactivateUser } = vi.hoisted(() => ({
  updateUser: vi.fn(),
  deactivateUser: vi.fn(),
}));

vi.mock('@/lib/server/withTeam', () => ({
  withTeam: (handler) => (req, ctx) =>
    handler(req, ctx, {
      session: { user: { id: 'u1', teamId: 't1', role: 'admin' } },
      teamId: 't1',
      db,
    }),
  withAdmin: (handler) => (req, ctx) =>
    handler(req, ctx, {
      session: { user: { id: 'u1', teamId: 't1', role: 'admin' } },
      teamId: 't1',
      db,
    }),
}));

vi.mock('@/lib/db/usersData', () => ({ updateUser, deactivateUser }));

import { DELETE, PATCH } from '../route';

beforeEach(() => {
  reset();
  vi.clearAllMocks();
});

describe('PATCH /api/users/[id]', () => {
  it('updates user', async () => {
    updateUser.mockResolvedValue({ ok: true });
    const req = new Request('http://x', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'New' }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: 'abc' }) });
    expect(res.status).toBe(200);
    expect(updateUser).toHaveBeenCalledWith(
      db,
      't1',
      'abc',
      { name: 'New' },
      { sessionUserId: 'u1' }
    );
  });
});

describe('DELETE /api/users/[id]', () => {
  it('deactivates user', async () => {
    deactivateUser.mockResolvedValue({ ok: true });
    const res = await DELETE(new Request('http://x'), {
      params: Promise.resolve({ id: 'abc' }),
    });
    expect(res.status).toBe(200);
    expect(deactivateUser).toHaveBeenCalledWith(db, 't1', 'abc', {
      sessionUserId: 'u1',
    });
  });
});
