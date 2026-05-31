import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';

const { db, reset } = createMockDb();
const { getUsers, createUser, checkRateLimit } = vi.hoisted(() => ({
  getUsers: vi.fn(),
  createUser: vi.fn(),
  checkRateLimit: vi.fn(() => ({ ok: true })),
}));

vi.mock('@/lib/server/withTeam', () => ({
  withTeam: (handler) => (_req, _ctx) =>
    handler(_req, _ctx, {
      session: {
        user: { id: 'u1', teamId: 't1', role: 'admin', username: 'admin' },
      },
      teamId: 't1',
      db,
    }),
  withAdmin: (handler) => (_req, _ctx) =>
    handler(_req, _ctx, {
      session: {
        user: {
          id: 'u1',
          teamId: 't1',
          role: 'admin',
          username: 'admin',
          teamName: 'Radius',
        },
      },
      teamId: 't1',
      db,
    }),
}));

vi.mock('@/lib/db/usersData', () => ({ getUsers, createUser }));
vi.mock('@/lib/rateLimit', () => ({ checkRateLimit }));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { GET, POST } from '../route';

beforeEach(() => {
  reset();
  vi.clearAllMocks();
});

describe('GET /api/users', () => {
  it('returns users for admin', async () => {
    getUsers.mockResolvedValue([{ _id: 'u1', name: 'A' }]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveLength(1);
  });
});

describe('POST /api/users', () => {
  it('creates user', async () => {
    createUser.mockResolvedValue({ ok: true, id: 'new-id' });
    const req = new Request('http://x', {
      method: 'POST',
      body: JSON.stringify({
        name: 'A',
        username: 'a',
        password: 'password1',
        role: 'qa',
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(createUser).toHaveBeenCalled();
  });
});
