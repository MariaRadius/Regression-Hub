import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';

const { db, reset } = createMockDb();
const { updateUser } = vi.hoisted(() => ({
  updateUser: vi.fn(),
}));

vi.mock('@/lib/server/withTeam', () => ({
  withTeam: (handler) => (req, ctx) =>
    handler(req, ctx, {
      session: {
        user: { id: 'u1', teamId: 't1', role: 'admin', name: 'Maria' },
      },
      teamId: 't1',
      db,
    }),
  withAdmin: (handler) => (req, ctx) =>
    handler(req, ctx, {
      session: {
        user: { id: 'u1', teamId: 't1', role: 'admin', name: 'Maria' },
      },
      teamId: 't1',
      db,
    }),
}));

vi.mock('@/lib/db/usersData', () => ({ updateUser }));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { PATCH } from '../route';

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
      { sessionUserId: 'u1', actor: 'Maria' },
    );
  });
});
